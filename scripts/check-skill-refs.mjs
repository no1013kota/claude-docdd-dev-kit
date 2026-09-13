#!/usr/bin/env node
// 配布リポジトリ用の検査（プラグインには同梱しない）。`npm run check` から呼ぶ。Node 18 以上・依存なし。
// 1. README 2 本・plugins/docdd/templates・skills・examples に出てくる /docdd:<名前> が、
//    plugins/docdd/skills/<名前>/SKILL.md として実在するか
// 2. スキル共通の前置き（前置き A・B）が、決まったスキルの frontmatter の直後に一字一句そのままあるか
// 3. SKILL.md の frontmatter: name がフォルダ名と同じ／model: が無い／
//    init・release・update-kit に disable-model-invocation: true がある／allowed-tools に runner 単体が無い
//    （allowed-tools は 1 行の文字列でも、YAML のリスト「  - Bash(…)」でも読む）
// 問題があれば日本語で列挙して exit 1。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(ROOT, "plugins", "docdd");
const SKILLS_DIR = path.join(PLUGIN, "skills");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

const SCAN = [
  path.join(ROOT, "README.md"),
  path.join(PLUGIN, "README.md"),
  path.join(PLUGIN, "templates"),
  SKILLS_DIR,
  path.join(PLUGIN, "examples"),
];
const REF = /\/docdd:([a-z0-9-]+)/g;

// 実装仕様 §6 の前置き（完全一致で使う）。「最初に…」の行の直後に、手動専用のスキル（init・release・update-kit）の 1 行を足した
const PREAMBLE_A = [
  "> **前提（docdd）**",
  "> - 最初に `tasks/BACKLOG.md` と、`CLAUDE.md` の「検証コマンド」表があるかを確かめる。どちらかが無ければファイルを作らず、「先に `/docdd:init` を実行してください」と伝えて止まる。",
  "> - `/docdd:init`・`/docdd:release`・`/docdd:update-kit` は運営者が自分で打つコマンドで、Claude のスキル一覧には出ない。一覧に無いことを不具合として伝えない。止まるときは要望の中身の検討を始めない。",
  "> - 表の場所: 「検証コマンド」「反映コマンド」「スキルへの追加指示」は `CLAUDE.md`、「変更影響 → 必須の検証」・Definition of Done・規約は `.claude/rules/docdd-kit.md`（v0.1 系で導入したプロジェクトでは全部 `CLAUDE.md` にある。`/docdd:update-kit` で移せる）。",
  "> - `CLAUDE.md`「スキルへの追加指示」にこのスキルの行があれば、本文より優先する。",
  "> - 表の値が「無い」の行は飛ばし、二重波かっこ（`{{…}}`）のままの行は未記入として実行しない。どちらも理由を報告する（黙って省略しない）。",
  "> - 課金・AI・ジョブ・決済など、このプロジェクトに無い機能についての手順は飛ばして「該当なし」と報告する。要決定には積まない。",
].join("\n");
const PREAMBLE_B = [
  "> **前提（docdd）**",
  "> - 最初に `tasks/BACKLOG.md` と、`CLAUDE.md` の「検証コマンド」表があるかを確かめる。どちらかが無ければファイルを作らず、「先に `/docdd:init` を実行してください」と伝えて止まる。",
  "> - `/docdd:init`・`/docdd:release`・`/docdd:update-kit` は運営者が自分で打つコマンドで、Claude のスキル一覧には出ない。一覧に無いことを不具合として伝えない。止まるときは要望の中身の検討を始めない。",
  "> - `CLAUDE.md`「スキルへの追加指示」にこのスキルの行があれば、本文より優先する。",
].join("\n");

const USES_A = ["dev-loop", "doc-sync", "verify-integration", "verify-e2e", "ui-polish", "refactor", "speed-up", "security-audit", "maintenance", "release"];
const USES_B = ["add-task", "tasks-from-prd"];
const NO_PREAMBLE = ["init", "update-kit", "playwright-cli"];
const MANUAL_ONLY = ["init", "release", "update-kit"];
const OLD_PREAMBLE = "前提（プラグイン版）";
// runner 単体のルール（そのスキルを呼んだターンの間、中で動く何でもが確認なしで通る）
const RUNNER_ONLY = [
  /^(npx|npm|pnpm|yarn|bun|bunx|uvx|pipx|deno|node|python3?|docker)\s*(:\*|\*)$/,
  /^(bash|sh|zsh)\s+-c\s*(:\*|\*)/,
  /^docker\s+(exec|run)\s*(:\*|\*)$/,
];

const problems = [];

function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  if (fs.statSync(p).isFile()) {
    out.push(p);
    return out;
  }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    walk(path.join(p, e.name), out);
  }
  return out;
}

function parseSkill(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const fm = {};
  const unquote = (v) => v.trim().replace(/^(["'])(.*)\1$/, "$2");
  let listKey = null;
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) {
      fm[m[1]] = unquote(m[2]);
      listKey = fm[m[1]] === "" ? m[1] : null;
      continue;
    }
    // 値が空のキーの直後の「- 値」の行（YAML のリスト）は、空白でつないで 1 つの値にする。
    // allowed-tools をリストで書いても runner 単体の検査をすり抜けないように。
    const item = listKey ? line.match(/^\s*-\s+(.*)$/) : null;
    if (item) fm[listKey] = `${fm[listKey]} ${unquote(item[1])}`.trim();
    else if (line.trim() !== "") listKey = null;
  }
  const body = lines.slice(end + 1);
  let i = 0;
  while (i < body.length && body[i].trim() === "") i++;
  const block = [];
  while (i < body.length && body[i].startsWith(">")) block.push(body[i++]);
  return { fm, preamble: block.join("\n") };
}

function firstDiff(actual, expected) {
  const a = actual.split("\n");
  const e = expected.split("\n");
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    if (a[i] !== e[i]) return `${i + 1} 行目（期待: ${e[i] ?? "（行なし）"} ／ 実際: ${a[i] ?? "（行なし）"}）`;
  }
  return "";
}

// 1. /docdd:<名前> の実在
let refCount = 0;
const refNames = new Set();
const refFiles = new Set();
for (const file of SCAN.flatMap((p) => walk(p))) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(REF)) {
      refCount++;
      refNames.add(m[1]);
      refFiles.add(file);
      if (!fs.existsSync(path.join(SKILLS_DIR, m[1], "SKILL.md"))) {
        problems.push(`存在しないスキルへの参照: ${rel(file)}:${idx + 1}  /docdd:${m[1]}（plugins/docdd/skills/${m[1]}/SKILL.md が無い。名前を直すか、スキルを足す）`);
      }
    }
  });
}

// 2・3. SKILL.md ごとの検査
const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const known = new Set([...USES_A, ...USES_B, ...NO_PREAMBLE]);
for (const name of known) {
  if (!skillDirs.includes(name)) problems.push(`スキルが見当たらない: plugins/docdd/skills/${name}/（消したなら scripts/check-skill-refs.mjs の一覧からも外す）`);
}
let countA = 0;
let countB = 0;
for (const name of skillDirs) {
  const file = path.join(SKILLS_DIR, name, "SKILL.md");
  const where = rel(file);
  if (!fs.existsSync(file)) {
    problems.push(`SKILL.md が無い: ${where}`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const parsed = parseSkill(text);
  if (!parsed) {
    problems.push(`frontmatter が読めない: ${where}（1 行目と閉じの行を --- にする）`);
    continue;
  }
  const { fm, preamble } = parsed;
  if (fm.name !== name) problems.push(`name がフォルダ名と違う: ${where}（name: ${fm.name ?? "なし"}）`);
  if ("model" in fm) problems.push(`model: がある: ${where}（消す。既定でセッションのモデルを使う）`);
  if (MANUAL_ONLY.includes(name) && fm["disable-model-invocation"] !== "true") {
    problems.push(`disable-model-invocation: true が無い: ${where}（自分で打ったときだけ動くスキル）`);
  }
  if (fm["allowed-tools"]) {
    for (const m of fm["allowed-tools"].matchAll(/(Bash|PowerShell)\(([^)]*)\)/g)) {
      const inner = m[2].trim();
      if (RUNNER_ONLY.some((re) => re.test(inner))) {
        problems.push(`allowed-tools に runner 単体がある: ${where}  ${m[0]}（runner と内側のコマンドの組で書く。例: Bash(npx playwright-cli *)）`);
      }
    }
  }
  if (text.includes(OLD_PREAMBLE)) problems.push(`旧い前置き「${OLD_PREAMBLE}」が残っている: ${where}`);
  if (USES_A.includes(name)) {
    if (preamble === PREAMBLE_A) countA++;
    else problems.push(`前置き A と一致しない: ${where}  ${firstDiff(preamble, PREAMBLE_A)}`);
  } else if (USES_B.includes(name)) {
    if (preamble === PREAMBLE_B) countB++;
    else problems.push(`前置き B と一致しない: ${where}  ${firstDiff(preamble, PREAMBLE_B)}`);
  } else if (NO_PREAMBLE.includes(name)) {
    if (preamble.startsWith("> **前提（docdd）**")) problems.push(`前置きを付けない決まりのスキルに前置きがある: ${where}`);
  } else {
    problems.push(`前置きの分類が決まっていない: ${where}（scripts/check-skill-refs.mjs の USES_A／USES_B／NO_PREAMBLE のどれかに足す）`);
  }
}

if (problems.length) {
  console.error(`check-skill-refs FAILED — 直すところが ${problems.length} 件あります`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `check-skill-refs OK — /docdd: の参照 ${refCount} 件（${refNames.size} 種・${refFiles.size} ファイル）はすべて実在。` +
    `前置き A ${countA} 本・B ${countB} 本は仕様どおり。SKILL.md ${skillDirs.length} 本の frontmatter に問題なし。`,
);
