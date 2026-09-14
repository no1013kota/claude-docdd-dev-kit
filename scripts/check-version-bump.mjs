#!/usr/bin/env node
// 配布リポジトリ用の検査（プラグインには同梱しない）。`npm run check` から呼ぶ。Node 18 以上・依存なし。
// main に入れた時点で配布される。plugin.json に版を書いているので、入れている人は版が上がったときだけ更新を受け取る
// （https://code.claude.com/docs/en/plugins-reference の Version management）。
// そこで、最新のタグ docdd--vX.Y.Z（版の大小で最新）と今の中身を比べ、plugins/docdd の中身が変わったのに
// plugins/docdd/.claude-plugin/plugin.json の version がタグの版のままなら exit 1 にする。
// - 版を上げなくてよい変更: plugins/docdd/README.md・plugins/docdd/CHANGELOG.md・plugins/docdd/evals/ の下
// - 比べる相手は HEAD。手元では、まだコミットしていない変更（stage 済み・作業中・git にまだ無いファイル）も含める
// - version がタグの版より小さいときも exit 1（版は下げない）
// - ただし、そのタグが HEAD の履歴にまだ入っていない（main から遅れたブランチなど）なら、版を下げたのではない。
//   HEAD に入っている中で最新のタグ（git tag --merged HEAD）と比べ直し、そう出す。
//   HEAD にタグが 1 つも無ければ exit 1 で、main の取り込みを案内する
// - git が無い・git のリポジトリの外・docdd--v* のタグが無い（浅い clone など）・タグのコミットが読めない（浅い clone）
//   ときは「飛ばした」と出して exit 0
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_DIR = "plugins/docdd";
const PLUGIN_JSON = `${PLUGIN_DIR}/.claude-plugin/plugin.json`;
const TAG_PREFIX = "docdd--v";
const NO_BUMP_FILES = [`${PLUGIN_DIR}/README.md`, `${PLUGIN_DIR}/CHANGELOG.md`];
const NO_BUMP_DIRS = [`${PLUGIN_DIR}/evals/`];
const MAX_LIST = 20;
const SHALLOW_HINT = "浅い clone ではタグやその時点のコミットが無いことがある。CI では actions/checkout に fetch-depth: 0 を付ける";

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return {
    ok: !r.error && r.status === 0,
    out: r.stdout ?? "",
    err: r.error ? r.error.message : (r.stderr ?? "").trim(),
  };
}

function skip(reason) {
  console.log(`check-version-bump 飛ばした — ${reason}`);
  process.exit(0);
}

function fail(head, details = []) {
  console.error(`check-version-bump FAILED — ${head}`);
  for (const d of details) console.error(`  ${d}`);
  process.exit(1);
}

const parseVersion = (s) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s ?? "");
  return m ? m.slice(1).map(Number) : null;
};
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// 1. plugin.json の版（作業中の中身。CI では HEAD と同じ）
let version;
try {
  version = JSON.parse(fs.readFileSync(path.join(ROOT, PLUGIN_JSON), "utf8")).version;
} catch (e) {
  fail(`${PLUGIN_JSON} が読めない（${e.message}）`);
}
const current = parseVersion(version);
if (!current) fail(`${PLUGIN_JSON} の version が X.Y.Z の形でない（いまの値: ${version ?? "なし"}）`);

// 2. git と最新のタグ
const inside = git(["rev-parse", "--is-inside-work-tree"]);
if (!inside.ok || inside.out.trim() !== "true") skip(`git が無いか、git のリポジトリの中ではない（${inside.err || "作業ツリーではない"}）`);
const shallow = git(["rev-parse", "--is-shallow-repository"]).out.trim() === "true";
function listTags(extra = []) {
  const r = git(["tag", "--list", ...extra, `${TAG_PREFIX}*`]);
  if (!r.ok) fail(`git tag が失敗した（${r.err}）`);
  return r.out
    .split(/\r?\n/)
    .filter((name) => name.startsWith(TAG_PREFIX))
    .map((name) => ({ name, v: parseVersion(name.slice(TAG_PREFIX.length)) }))
    .filter((t) => t.v)
    .sort((a, b) => compare(b.v, a.v));
}
const tags = listTags();
if (!tags.length) {
  skip(`${TAG_PREFIX}X.Y.Z のタグが無い（${shallow ? SHALLOW_HINT : "まだリリースしていないか、タグを取っていない。git fetch --tags で取れる"}）`);
}
let latest = tags[0];
let label = "最新のタグ";
// 版が最新のタグより小さくても、そのタグが HEAD の履歴に無ければ、main から遅れているだけのことがある
if (compare(current, latest.v) < 0) {
  const merged = listTags(["--merged", "HEAD"]);
  if (!merged.some((t) => t.name === latest.name)) {
    if (shallow) skip(`最新のタグ ${latest.name} が HEAD の履歴に見つからない（${SHALLOW_HINT}）`);
    if (!merged.length) {
      fail(`${PLUGIN_JSON} の version（${version}）が最新のタグ ${latest.name} より小さく、そのタグは HEAD にまだ入っていない`, [
        "main から遅れたブランチなら、main を取り込んでから確かめる。",
        "版を下げたのなら、最新のタグより大きい版にする（main に入れた時点で配布される。RELEASING.md）。",
      ]);
    }
    console.log(
      `check-version-bump メモ — 最新のタグ ${latest.name} は、HEAD にまだ入っていない（main から遅れたブランチなど）。` +
        `HEAD に入っている中で最新の ${merged[0].name} と比べる。main を取り込むと ${latest.name} と比べる。`,
    );
    latest = merged[0];
    label = "HEAD に入っている最新のタグ";
  }
}
const tagCommit = git(["rev-parse", "--verify", "--quiet", `refs/tags/${latest.name}^{commit}`]);
if (!tagCommit.ok) skip(`タグ ${latest.name} のコミットが読めない（${shallow ? SHALLOW_HINT : "git fetch --tags で取り直す"}）`);

// 3. 版の大小
const order = compare(current, latest.v);
if (order > 0) {
  console.log(`check-version-bump OK — ${PLUGIN_JSON} の version ${version} は、${label} ${latest.name} より新しい。`);
  process.exit(0);
}
if (order < 0) {
  fail(`${PLUGIN_JSON} の version（${version}）が、${label} ${latest.name} より小さい`, [
    "版は下げない。main に入れた時点で配布されるので、最新のタグより大きい版にする（RELEASING.md）。",
  ]);
}

// 4. 同じ版のまま、plugins/docdd の中身が変わっていないか
const diff = git(["diff", "--name-only", "--no-renames", "--relative", "-z", tagCommit.out.trim(), "--", PLUGIN_DIR]);
if (!diff.ok) fail(`git diff が失敗した（${diff.err}）`);
const untracked = git(["ls-files", "--others", "--exclude-standard", "-z", "--", PLUGIN_DIR]);
if (!untracked.ok) fail(`git ls-files が失敗した（${untracked.err}）`);
const changed = [...new Set([...diff.out.split("\0"), ...untracked.out.split("\0")].filter(Boolean))].sort();
const needsBump = (p) => !NO_BUMP_FILES.includes(p) && !NO_BUMP_DIRS.some((d) => p.startsWith(d));
const counted = changed.filter(needsBump);
const notCounted = changed.length - counted.length;

if (!counted.length) {
  console.log(
    `check-version-bump OK — ${label} ${latest.name} から、版を上げる必要のある変更は無い` +
      `（plugins/docdd/README.md・CHANGELOG.md・evals/ だけの変更は数えない。数えなかった変更 ${notCounted} 件）。`,
  );
  process.exit(0);
}

fail(`${label} ${latest.name} から plugins/docdd の中身が変わったのに、${PLUGIN_JSON} の version が ${version} のまま`, [
  "main に入れた時点で配布されます。入れている人は版が上がったときだけ更新を受け取るので、version を上げ、CHANGELOG.md の先頭に新しい版を書いてください（RELEASING.md）。",
  "版を上げなくてよいのは plugins/docdd/README.md・CHANGELOG.md・evals/ だけの変更です。",
  `版を上げる必要のある変更（${counted.length} 件）:`,
  ...counted.slice(0, MAX_LIST).map((p) => `  - ${p}`),
  ...(counted.length > MAX_LIST ? [`  - ほか ${counted.length - MAX_LIST} 件`] : []),
]);
