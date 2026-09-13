// docdd-kit v0.2.0 — scripts/check-doc-refs.mjs（キットが管理するファイル。直すと /docdd:update-kit が差分を見せて聞く）
// CLAUDE.md・.claude/rules/・docs/ の文書が指しているファイルが、本当にあるかを検査する。
// 存在しないファイルを指す仕様書は、読んだ人（と Claude）を行き止まりへ送る。
//
//   node scripts/check-doc-refs.mjs
//
// 見る書き方: バッククォートで囲んだパス（拡張子は下の EXTS）と、相対リンク [文字](./a.md)・[文字](../b.md)。
//   リンクはその文書のフォルダを起点に探す。バッククォートのパスはプロジェクトの一番上・文書のフォルダ・末尾一致の順に探す。
// 見ない所: 「例」の字を含む行、HTML コメントの中、コードブロックの中（書き方の見本を書けるように）。
// 大文字・小文字だけが違う参照も失敗にする（macOS では開けても、Linux の CI や clone した先では開けない）。
// 対象の文書: git が追跡しているもの。docs/_imported/（取り込んだ原文）・docs/requirements/00_template.md・
//   docs/decisions/0000-template.md（見本）は除く。
// 終了コード: 0 = 問題なし（警告だけのときも 0）／1 = 無いファイルを指している・対象の文書が git に無い／2 = git が使えない
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** 検査するパスの拡張子。ここに足せば、その拡張子のパスも検査する。 */
const EXTS = [
  "md", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "go", "rb", "php",
  "sql", "toml", "json", "yml", "yaml", "css", "sh", "prisma",
];
const TARGETS = ["CLAUDE.md", ".claude/rules/*.md", "docs/*.md"];
const EXCLUDED = [
  /^docs\/_imported\//,
  /^docs\/requirements\/00_template\.md$/,
  /^docs\/decisions\/0000-template\.md$/,
];

/** バッククォートの中身がまるごと 1 つのパスのとき（`src/app.ts:42` の行番号は外して読む）。 */
const PATH_REF = new RegExp(
  `^([\\p{L}\\p{N}_./@()\\[\\]+-]+\\.(?:${EXTS.join("|")}))(?::[0-9]+(?:-[0-9]+)?)?$`,
  "u",
);
/** `](./…)` と `](../…)` の相対リンク。 */
const LINK = /\]\((\.{1,2}\/[^)\s]*)/g;

/** 実ファイルではなく命名の型を書いたもの（`NNNN-title.md`・`YYYY-MM-DD.md`）と絶対パスは見ない。 */
function isPattern(ref) {
  return /NNNN|YYYY|^\//.test(ref);
}

// ---- docdd:scan-markdown begin（check-doc-*.mjs の 3 本で同じ中身。直すときは 3 本とも直す） ----
/**
 * Markdown を行ごとに「地の文 text／インラインコード code／HTML コメント comment／コードブロック fence」に分ける。
 * 行番号を保つため、入力 1 行に対して必ず 1 要素（区間の配列）を返す。
 */
function scanMarkdown(source) {
  const result = [];
  let fence = null;
  let inComment = false;
  for (const line of source.split(/\r?\n/)) {
    if (!inComment) {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (open && open[1][0] === fence.ch && open[1].length >= fence.len && open[2].trim() === "") {
          fence = null;
        }
        result.push([{ kind: "fence", raw: line }]);
        continue;
      }
      if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
        fence = { ch: open[1][0], len: open[1].length };
        result.push([{ kind: "fence", raw: line }]);
        continue;
      }
    }
    const segs = [];
    let text = "";
    const flush = () => {
      if (text) segs.push({ kind: "text", raw: text });
      text = "";
    };
    let i = 0;
    while (i < line.length) {
      if (inComment || line.startsWith("<!--", i)) {
        flush();
        const end = line.indexOf("-->", inComment ? i : i + 4);
        const stop = end === -1 ? line.length : end + 3;
        segs.push({ kind: "comment", raw: line.slice(i, stop) });
        inComment = end === -1;
        i = stop;
        continue;
      }
      if (line[i] === "`") {
        let n = 0;
        while (line[i + n] === "`") n += 1;
        let close = -1;
        for (let j = i + n; j < line.length; ) {
          if (line[j] !== "`") {
            j += 1;
            continue;
          }
          let k = j;
          while (line[k] === "`") k += 1;
          if (k - j === n) {
            close = j;
            break;
          }
          j = k;
        }
        if (close !== -1) {
          flush();
          segs.push({ kind: "code", raw: line.slice(i, close + n), inner: line.slice(i + n, close) });
          i = close + n;
          continue;
        }
        text += line.slice(i, i + n);
        i += n;
        continue;
      }
      text += line[i];
      i += 1;
    }
    flush();
    result.push(segs);
  }
  return result;
}
// ---- docdd:scan-markdown end ----

/* `-c core.quotepath=false` を付けないと、日本語のパスが 8 進エスケープで返りファイルを開けない。 */
const git = (args) =>
  execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
const listFiles = (specs) => git(["ls-files", "-z", "--", ...specs]).split("\0").filter(Boolean);

const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (probe.error) {
  console.error("❌ git が見つかりません。git を入れてから実行してください（この検査は git が追跡しているファイルを見ます）");
  process.exit(2);
}
if (probe.status !== 0 || probe.stdout.trim() !== "true") {
  console.error("❌ git のリポジトリの外で実行されました");
  console.error("   → プロジェクトのフォルダ（CLAUDE.md がある場所）で実行してください");
  process.exit(2);
}

/** git が追跡していて、いまディスクにもあるファイル（消したのに stage していないものは「無い」と扱う）。 */
const trackedList = listFiles([]).filter((f) => existsSync(f));
const tracked = new Set(trackedList);

const docs = listFiles(TARGETS).filter((f) => !EXCLUDED.some((re) => re.test(f)) && tracked.has(f));

if (docs.length === 0) {
  const present = ["CLAUDE.md", ".claude/rules", "docs"].filter((p) => existsSync(p));
  console.error("❌ 検査する文書が git に 1 件もありません（対象: CLAUDE.md・.claude/rules/ の .md・docs/ の .md）");
  console.error("   この検査は git に追加したファイルだけを見ます。作ったばかりのファイルはまだ数えられません");
  if (present.length > 0) {
    console.error(`   → 先に \`git add ${present.join(" ")}\` のようにパスを指定して追加してから、もう一度実行してください`);
  } else {
    console.error("   → CLAUDE.md も docs/ も見つかりません。プロジェクトのフォルダで実行しているか、/docdd:init を済ませたかを確認してください");
  }
  process.exit(1);
}

const OK = { status: "ok" };

/** 大文字・小文字を無視すると一致する、追跡中のファイルやフォルダ（綴りの違うものだけ）。 */
function caseVariants(p) {
  const want = p.toLowerCase().split("/");
  const found = new Set();
  for (const f of trackedList) {
    const segs = f.split("/");
    if (segs.length < want.length) continue;
    if (want.every((w, i) => segs[i].toLowerCase() === w)) found.add(segs.slice(0, want.length).join("/"));
  }
  found.delete(p);
  return [...found];
}

/** 追跡中の一覧に無いパスを、ディスクと git の状態で分類する。 */
function onDisk(candidates) {
  for (const p of [...new Set(candidates)]) {
    // 綴りの違いは existsSync より先に見る（macOS では「ある」になり、git add しても直らない）。
    const variants = caseVariants(p);
    if (variants.length > 0) return { status: "case", path: p, variants };
    if (!existsSync(p)) continue;
    // 実行場所より上（../）にあって追跡されているもの。
    const ls = spawnSync("git", ["-c", "core.quotepath=false", "ls-files", "-z", "--", p], { encoding: "utf8" });
    if (ls.status === 0 && ls.stdout.length > 0) return OK;
    // .gitignore 済み: 手元にはあるが、clone した先や CI には無い。失敗にはせず知らせる。
    if (spawnSync("git", ["check-ignore", "-q", "--", p]).status === 0) return { status: "ignored", path: p };
    return { status: "untracked", path: p };
  }
  return { status: "missing" };
}

function resolvePathRef(doc, ref) {
  const docDir = path.posix.dirname(doc);
  if (ref.startsWith("../")) {
    const p = path.posix.normalize(path.posix.join(docDir, ref));
    return tracked.has(p) ? OK : onDisk([p]);
  }
  const bare = ref.replace(/^(?:\.\/)+/, "");
  const fromDoc = path.posix.normalize(path.posix.join(docDir, bare));
  if (tracked.has(bare) || tracked.has(fromDoc)) return OK;
  /*
    docs は先頭のフォルダ（`src/` など）を省いて書くことがあるので、末尾一致も認める。
    ただし候補が複数あると、どれを指すのか読む人に分からない。失敗にはせず「曖昧」と知らせる。
  */
  const candidates = trackedList.filter((f) => f.endsWith(`/${bare}`));
  if (candidates.length === 1) return OK;
  if (candidates.length > 1) return { status: "ambiguous", candidates };
  return onDisk([bare, fromDoc]);
}

function resolveLink(doc, target) {
  let t = target.replace(/[?#].*$/, "");
  try {
    t = decodeURIComponent(t);
  } catch {
    // %xx が壊れていればそのまま探す。
  }
  const p = path.posix.normalize(path.posix.join(path.posix.dirname(doc), t)).replace(/\/+$/, "") || ".";
  if (p === "." || tracked.has(p)) return { ...OK, path: p };
  if (trackedList.some((f) => f.startsWith(`${p}/`))) return { ...OK, path: p };
  return { path: p, ...onDisk([p]) };
}

const missing = [];
const warnings = [];
let checked = 0;

function record(at, ref, result) {
  const shown = result.path && result.path !== ref ? `${ref}（${result.path} を探した）` : ref;
  switch (result.status) {
    case "ok":
      return;
    case "ambiguous": {
      const list = result.candidates.slice(0, 3).join(", ") + (result.candidates.length > 3 ? " …" : "");
      warnings.push(`${at}  →  ${ref}（曖昧: 候補 ${result.candidates.length} 件 ${list}。どれか分かるようにパスを長く書く）`);
      return;
    }
    case "ignored":
      warnings.push(`${at}  →  ${ref}（ファイルはあるが .gitignore で git の管理外。clone した先や CI には無い）`);
      return;
    case "case":
      missing.push(`${at}  →  ${ref}（大文字・小文字が違う: 正しくは ${result.variants.join(" か ")}）`);
      return;
    case "untracked":
      missing.push(`${at}  →  ${ref}（ファイルはあるが git に追加されていない。\`git add ${result.path}\` してから）`);
      return;
    default:
      missing.push(`${at}  →  ${shown}`);
  }
}

for (const doc of docs) {
  const source = readFileSync(doc, "utf8");
  const rawLines = source.split(/\r?\n/);
  scanMarkdown(source).forEach((segs, i) => {
    // 「例」の字を含む行は書き方の見本。実在しないファイル名を書いてよい。
    if (rawLines[i].includes("例")) return;
    const at = `${doc}:${i + 1}`;
    for (const seg of segs) {
      if (seg.kind === "code") {
        const m = PATH_REF.exec(seg.inner.trim());
        if (!m || isPattern(m[1])) continue;
        checked += 1;
        record(at, m[1], resolvePathRef(doc, m[1]));
      } else if (seg.kind === "text") {
        for (const link of seg.raw.matchAll(LINK)) {
          checked += 1;
          record(at, link[1], resolveLink(doc, link[1]));
        }
      }
    }
  });
}

if (warnings.length > 0) {
  console.warn(`⚠️ 確認してほしい参照が ${warnings.length} 件あります（失敗にはしません）`);
  for (const w of warnings) console.warn(`   ${w}`);
  console.warn("");
}

if (missing.length > 0) {
  console.error(`❌ 無いファイルを指す記述が ${missing.length} 件あります（${checked} 件を検査）\n`);
  for (const m of missing) console.error(`   ${m}`);
  console.error("\n   → 移動・改名したなら正しいパスへ、消したなら記述ごと見直してください");
  console.error("   → 書き方の見本として書いた行なら、その行に「例」の字を入れると検査しません");
  process.exit(1);
}

if (checked === 0) {
  console.log(`✅ ファイルを指す記述は 0 件でした（${docs.length} 件の文書を見ました）`);
  console.log(`   検査するのは、バッククォートで囲んだパス（拡張子 ${EXTS.join("・")}）と、](./…) ](../…) の相対リンクです`);
} else {
  console.log(`✅ ファイルを指す記述は ${checked} 件すべて実在しました（${docs.length} 件の文書を検査）`);
}
