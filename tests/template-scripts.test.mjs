// plugins/docdd/templates/scripts の検査スクリプトを、使い捨ての git リポジトリで実行して
// 終了コードと文面を固定する（依存なし・Node 18 以上）。
//
//   node --test tests/template-scripts.test.mjs
//
// テンプレートの docs・CLAUDE.md はコピーしない（中身が変わってもこのテストが壊れないように、
// 各テストが最小の文書を自分で書く）。audit-check.mjs だけは「scripts/ の隣に allowlist、1 つ上に lock」
// という置き方そのものを検査するため、スクリプト 1 本を使い捨てのリポジトリへ置いて実行する。
// 通信が要るケース（npm audit の結果で決まるもの）は書かない。
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "plugins/docdd/templates/scripts");

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" };
for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_AUTHOR_DATE", "GIT_COMMITTER_DATE"]) {
  delete ENV[key];
}

const made = [];
process.on("exit", () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function git(cwd, args, date) {
  const env = date ? { ...ENV, GIT_AUTHOR_DATE: `${date}T12:00:00`, GIT_COMMITTER_DATE: `${date}T12:00:00` } : ENV;
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
}

function commit(dir, date, message = "test") {
  git(dir, ["commit", "-q", "-m", message], date);
}

/** mkdtemp → git init → 名前とメール → 文書を書く → git add（→ commit）。 */
function repo(files = {}, { add = true, commitDate = "2026-01-15" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "docdd-scripts-"));
  made.push(dir);
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.name", "docdd test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  write(dir, files);
  if (add && Object.keys(files).length > 0) git(dir, ["add", "--", ...Object.keys(files)]);
  if (commitDate) commit(dir, commitDate);
  return dir;
}

function run(script, cwd, { scriptPath, nodeArgs = [], env = {} } = {}) {
  const r = spawnSync(process.execPath, [...nodeArgs, scriptPath ?? path.join(SCRIPTS, script)], {
    cwd,
    env: { ...ENV, ...env },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/** 冒頭表・本文・変更履歴を持つ最小の PRD。更新日の行は 6 行目。 */
function prd({
  version = "v0.1",
  date = "2026-01-15",
  delimiter = "|---|---|---|",
  history = "| v0.1 | 2026-01-15 | 初版 |",
  header = "| バージョン | 日付 | 内容 |",
} = {}) {
  return [
    "# PRD：テスト",
    "",
    "| 項目 | 内容 |",
    "|---|---|",
    `| バージョン | ${version} |`,
    `| 更新日 | ${date} |`,
    "",
    "## 1. 何を作るか",
    "",
    "テスト用の文書。",
    "",
    "## 6. 変更履歴",
    "",
    header,
    delimiter,
    history,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

test("共通: 4 本とも先頭 3 行以内に docdd-kit の版の刻印がある", () => {
  for (const name of ["check-doc-dates.mjs", "check-doc-refs.mjs", "check-doc-placeholders.mjs", "audit-check.mjs"]) {
    const head = readFileSync(path.join(SCRIPTS, name), "utf8").split("\n").slice(0, 3).join("\n");
    assert.match(head, /docdd-kit v[0-9]+\.[0-9]+\.[0-9]+/, name);
  }
});

test("共通: Markdown の読み取り部分は check-doc-*.mjs の 3 本で同じ中身", () => {
  const block = (name) => {
    const text = readFileSync(path.join(SCRIPTS, name), "utf8");
    const m = /\/\/ ---- docdd:scan-markdown begin[\s\S]*?\/\/ ---- docdd:scan-markdown end ----/.exec(text);
    assert.ok(m, `${name} に scan-markdown の区間が無い`);
    return m[0];
  };
  const dates = block("check-doc-dates.mjs");
  assert.equal(block("check-doc-refs.mjs"), dates);
  assert.equal(block("check-doc-placeholders.mjs"), dates);
});

// ---------------------------------------------------------------------------
// check-doc-refs.mjs
// ---------------------------------------------------------------------------

const REFS = "check-doc-refs.mjs";
const BASIC_DOCS = {
  "CLAUDE.md": "- 仕様の正本は `docs/PRD.md`。\n- 地図は [PRD](./docs/PRD.md)。\n",
  "docs/PRD.md": "# PRD\n",
};

test("refs: 文書を git に追加していなければ、git add の次の一手を出して exit 1", () => {
  const dir = repo(BASIC_DOCS, { add: false, commitDate: null });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /git に 1 件もありません/);
  assert.match(r.out, /git add CLAUDE\.md docs/);
});

test("refs: stage した後は exit 0（コミット前でもよい）", () => {
  const dir = repo(BASIC_DOCS, { commitDate: null });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /2 件すべて実在しました/);
});

test("refs: 存在しない .py・.md と、切れた相対リンクを行番号つきで列挙して exit 1", () => {
  const dir = repo({
    "CLAUDE.md": "`app/missing.py` を読む。\n",
    "docs/PRD.md": "# PRD\n",
    "docs/README.md": [
      "- `docs/nope.md` を見る",
      "- [要件](./requirements/99_missing.md)",
      "- [PRD](./PRD.md) と [ガイド](../CLAUDE.md) はある",
      "",
    ].join("\n"),
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /3 件あります/);
  assert.match(r.out, /CLAUDE\.md:1 {2}→ {2}app\/missing\.py/);
  assert.match(r.out, /docs\/README\.md:1 {2}→ {2}docs\/nope\.md/);
  assert.match(r.out, /docs\/README\.md:2 {2}→ {2}\.\/requirements\/99_missing\.md（docs\/requirements\/99_missing\.md を探した）/);
  assert.doesNotMatch(r.out, /PRD\.md（|CLAUDE\.md（/);
});

test("refs: 「例」を含む行・HTML コメント・コードブロックの中は検査しない", () => {
  const dir = repo({
    "CLAUDE.md": [
      "例: `app/nothing.py` のように書く",
      "<!-- `lib/gone.ts` を見る -->",
      "<!--",
      "[消えた](./docs/gone.md)",
      "-->",
      "```",
      "`src/none.ts`",
      "```",
      "本物は `docs/PRD.md`",
      "",
    ].join("\n"),
    "docs/PRD.md": "# PRD\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 件すべて実在しました/);
});

test("refs: 実在して .gitignore 済みのファイルは警告だけで exit 0", () => {
  const dir = repo({ ".gitignore": ".mcp.json\n", "CLAUDE.md": "MCP の設定は `.mcp.json`。\n" });
  write(dir, { ".mcp.json": "{}\n" });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\.mcp\.json（ファイルはあるが \.gitignore で git の管理外/);
});

test("refs: 実在するが git に追加していないファイルは、git add を促して exit 1", () => {
  const dir = repo({ "CLAUDE.md": "検査は `scripts/new.mjs`。\n" });
  write(dir, { "scripts/new.mjs": "\n" });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /git add scripts\/new\.mjs/);
});

test("refs: 大文字・小文字だけが違う参照は、正しい綴りを出して exit 1（git add は勧めない）", () => {
  const dir = repo({
    "CLAUDE.md": "- 正本は `docs/prd.md`\n- 地図は [PRD](./docs/prd.md)\n- 文書は [docs](./Docs/)\n",
    "docs/PRD.md": "# PRD\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /3 件あります/);
  assert.match(r.out, /CLAUDE\.md:1 {2}→ {2}docs\/prd\.md（大文字・小文字が違う: 正しくは docs\/PRD\.md）/);
  assert.match(r.out, /CLAUDE\.md:2 {2}→ {2}\.\/docs\/prd\.md（大文字・小文字が違う: 正しくは docs\/PRD\.md）/);
  assert.match(r.out, /CLAUDE\.md:3 {2}→ {2}\.\/Docs\/（大文字・小文字が違う: 正しくは docs）/);
  assert.doesNotMatch(r.out, /git add/);
});

test("refs: 末尾一致の候補が複数あるときは「曖昧」の警告だけで exit 0", () => {
  const dir = repo({
    "CLAUDE.md": "画面は `page.tsx`。\n",
    "app/a/page.tsx": "\n",
    "app/b/page.tsx": "\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /曖昧: 候補 2 件/);
});

test("refs: .claude/rules/ の .md も検査する", () => {
  const dir = repo({ ".claude/rules/docdd-kit.md": "流れは `docs/gone.md`。\n" });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\.claude\/rules\/docdd-kit\.md:1 {2}→ {2}docs\/gone\.md/);
});

test("refs: 取り込んだ原文と見本は除外し、参照が 0 件なら何を探したかを出して exit 0", () => {
  const dir = repo({
    "CLAUDE.md": "# ガイド\n",
    "docs/_imported/old-spec.md": "`src/legacy.ts`\n",
    "docs/requirements/00_template.md": "`x/none.md`\n",
    "docs/decisions/0000-template.md": "`y/none.md`\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0 件でした/);
  assert.match(r.out, /相対リンク/);
});

// ---------------------------------------------------------------------------
// check-doc-dates.mjs
// ---------------------------------------------------------------------------

const DATES = "check-doc-dates.mjs";

test("dates: コミットが 1 件も無ければ exit 1", () => {
  const dir = repo({ "docs/PRD.md": prd() }, { commitDate: null });
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /まだコミットが1件もありません/);
});

test("dates: 整った文書だけなら exit 0、更新日の無い文書は「対象外」に数える", () => {
  const dir = repo({ "docs/PRD.md": prd(), "docs/README.md": "# 地図\n" });
  const r = run(DATES, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /更新日は 1 件すべて最新でした（version と変更履歴の一致も 1 件確認）/);
  assert.match(r.out, /対象外: 1 件/);
});

test("dates: 更新日が日付でなければ「未記入: ファイル:行」と列挙して exit 1", () => {
  const dir = repo({ "docs/PRD.md": prd({ date: "{{YYYY-MM-DD}}" }) });
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /未記入: docs\/PRD\.md:6（今日の日付に。いまの値: \{\{YYYY-MM-DD\}\}）/);
});

test("dates: 冒頭の表が無い requirements 文書を列挙して exit 1", () => {
  const dir = repo({
    "docs/PRD.md": prd(),
    "docs/requirements/06_screens.md": "# 画面\n\n## S-01 一覧\n",
    "docs/requirements/README.md": "# 分け方\n",
  });
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/requirements\/06_screens\.md（バージョン・更新日の行がありません）/);
  assert.match(r.out, /冒頭に \| バージョン \| vX \| と \| 更新日 \| 日付 \| の表を足す/);
  assert.doesNotMatch(r.out, /requirements\/README\.md/);
});

test("dates: 変更履歴を新しい順に書いても exit 0", () => {
  const dir = repo({
    "docs/PRD.md": prd({ version: "v0.2", history: "| v0.2 | 2026-01-15 | 機能追加 |\n| v0.1 | 2026-01-10 | 初版 |" }),
  });
  const r = run(DATES, dir);
  assert.equal(r.code, 0, r.out);
});

test("dates: version は数値で比べる（v1.10 は v1.9 より新しい）", () => {
  const history = "| v1.9 | 2026-01-10 | 前の版 |\n| v1.10 | 2026-01-15 | 今の版 |";
  const ok = run(DATES, repo({ "docs/PRD.md": prd({ version: "v1.10", history }) }));
  assert.equal(ok.code, 0, ok.out);
  const ng = run(DATES, repo({ "docs/PRD.md": prd({ version: "v1.9", history }) }));
  assert.equal(ng.code, 1, ng.out);
  assert.match(ng.out, /冒頭 v1\.9 に対し変更履歴の最新は v1\.10/);
});

test("dates: 寄せ指定つきの区切り行 |:---| も表の区切りと認める", () => {
  const dir = repo({ "docs/PRD.md": prd({ delimiter: "|:---|:---:|---:|" }) });
  const r = run(DATES, dir);
  assert.equal(r.code, 0, r.out);
});

test("dates: 変更履歴の直前 2 行に表ヘッダが無ければ exit 1", () => {
  const dir = repo({ "docs/PRD.md": prd({ header: "", delimiter: "" }) });
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /変更履歴の表ヘッダがありません/);
});

test("dates: PRD を docs/spec/ へ移しても、変更履歴の見出しで正本として検査が続く", () => {
  const dir = repo({ "docs/PRD.md": prd() });
  mkdirSync(path.join(dir, "docs/spec"), { recursive: true });
  git(dir, ["mv", "docs/PRD.md", "docs/spec/PRD.md"]);
  commit(dir, "2026-01-15", "move");
  const moved = run(DATES, dir);
  assert.equal(moved.code, 0, moved.out);
  assert.match(moved.out, /version と変更履歴の一致も 1 件確認/);

  write(dir, { "docs/spec/PRD.md": prd({ version: "v0.2" }) });
  git(dir, ["add", "--", "docs/spec/PRD.md"]);
  commit(dir, "2026-01-15", "bump");
  const drifted = run(DATES, dir);
  assert.equal(drifted.code, 1, drifted.out);
  assert.match(drifted.out, /docs\/spec\/PRD\.md\n\s+冒頭 v0\.2 に対し変更履歴の最新は v0\.1/);
});

test("dates: 内容を変えたコミットより更新日が古ければ「置き去り」で exit 1", () => {
  const dir = repo({ "docs/PRD.md": prd({ date: "2026-01-01" }) }, { commitDate: "2026-01-15" });
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/PRD\.md:6\n\s+記載: 2026-01-01 \/ 最後に内容が変わったコミット: 2026-01-15/);
});

test("dates: 更新日の行だけを変えたコミットは内容の変更に数えない", () => {
  const dir = repo({ "docs/PRD.md": prd({ date: "2026-01-15" }) }, { commitDate: "2026-01-15" });
  write(dir, { "docs/PRD.md": prd({ date: "2026-01-20" }) });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-02-01", "date only");
  const r = run(DATES, dir);
  assert.equal(r.code, 0, r.out);
});

test("dates: コードブロック内の見本の表と、見本ファイル（00_template・0000-template）は読まない", () => {
  const dir = repo({
    "docs/PRD.md": prd(),
    "docs/README.md": "# 地図\n\n```markdown\n| 項目 | 内容 |\n|---|---|\n| 更新日 | {{YYYY-MM-DD}} |\n```\n",
    "docs/requirements/00_template.md": "# 見本\n\n| バージョン | v1.0 |\n| 更新日 | {{YYYY-MM-DD}} |\n",
    "docs/decisions/0000-template.md": "# ADR-0000\n\n- 日付: {{YYYY-MM-DD}}\n",
    "docs/_imported/old.md": "| 更新日 | 昔 |\n",
  });
  const r = run(DATES, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /対象外: 1 件/);
});

test("dates: docs/ の文書が 1 件も無ければ、次の一手（docs/PRD.md の確認）を出して exit 1", () => {
  const dir = repo({ "README.md": "# readme\n" });
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/PRD\.md/);
});

// ---------------------------------------------------------------------------
// check-doc-placeholders.mjs
// ---------------------------------------------------------------------------

const PLACEHOLDERS = "check-doc-placeholders.mjs";

test("placeholders: 残った {{…}} を「ファイル:行  {{トークン}}」で列挙して exit 1（tasks/ も対象）", () => {
  const dir = repo({
    "CLAUDE.md": "# {{プロジェクト名}} 開発ガイド\n",
    "tasks/REFACTOR_PLAN.md": "# 計画\n\n更新日: {{YYYY-MM-DD}}\n",
  });
  const r = run(PLACEHOLDERS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /2 件残っています/);
  assert.match(r.out, /CLAUDE\.md:1 {2}\{\{プロジェクト名\}\}/);
  assert.match(r.out, /tasks\/REFACTOR_PLAN\.md:3 {2}\{\{YYYY-MM-DD\}\}/);
});

test("placeholders: インラインコード・コードブロック・HTML コメント・見本ファイルの中は数えない", () => {
  const dir = repo({
    "CLAUDE.md": [
      "# 開発ガイド",
      "",
      "二重波かっこ（`{{…}}`）のままの行は未記入。",
      "```",
      "| 型検査 | {{型検査}} |",
      "```",
      "<!-- {{コメントの中}} -->",
      "<!--",
      "{{複数行コメントの中}}",
      "-->",
      "",
    ].join("\n"),
    "docs/requirements/00_template.md": "# {{文書名}}\n",
  });
  const r = run(PLACEHOLDERS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /残っていませんでした/);
});

test("placeholders: 文書を git に追加していなければ、git add の次の一手を出して exit 1", () => {
  const dir = repo({ "CLAUDE.md": "# ガイド\n" }, { add: false, commitDate: null });
  const r = run(PLACEHOLDERS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /git add CLAUDE\.md/);
});

// ---------------------------------------------------------------------------
// audit-check.mjs（npm audit を呼ぶ前に決まるケースだけ）
// ---------------------------------------------------------------------------

const LOCK_V3 = `${JSON.stringify({ name: "fixture", lockfileVersion: 3, requires: true, packages: { "": { name: "fixture" } } }, null, 2)}\n`;
const EXPIRED = `${JSON.stringify({ lodash: { why: "テスト用の据え置き", until: "2000-01-01" } }, null, 2)}\n`;

/** scripts/audit-check.mjs を置いたプロジェクト（`at` はスクリプトを置くフォルダ）。 */
function auditProject(files, at = "scripts") {
  const dir = repo(files, { add: false, commitDate: null });
  mkdirSync(path.join(dir, at), { recursive: true });
  copyFileSync(path.join(SCRIPTS, "audit-check.mjs"), path.join(dir, at, "audit-check.mjs"));
  return { dir, script: path.join(dir, at, "audit-check.mjs") };
}

test("audit: package-lock.json がどこにも無ければ exit 2（workspaces の案内つき）", () => {
  const { dir, script } = auditProject({ "package.json": "{}\n" });
  const r = run("", dir, { scriptPath: script });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /package-lock\.json がありません/);
  assert.match(r.out, /npm workspaces/);
});

test("audit: lockfileVersion 1 の古い lock は作り直しを案内して exit 2", () => {
  const { dir, script } = auditProject({ "package-lock.json": '{ "lockfileVersion": 1, "dependencies": {} }\n' });
  const r = run("", dir, { scriptPath: script });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /古い形式です（lockfileVersion 1）/);
  assert.match(r.out, /npm install/);
});

test("audit: allowlist の until を過ぎた据え置きは「据え置き期限切れ」で exit 1", () => {
  const { dir, script } = auditProject({ "package-lock.json": LOCK_V3, "scripts/audit-allowlist.json": EXPIRED });
  const r = run("", dir, { scriptPath: script });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /据え置き期限切れ/);
  assert.match(r.out, /lodash（期限 2000-01-01。理由: テスト用の据え置き）/);
});

test("audit: scripts/ の隣に lock が無ければ git の一番上の package-lock.json を使う", () => {
  const { dir, script } = auditProject(
    { "package-lock.json": LOCK_V3, "apps/web/scripts/audit-allowlist.json": EXPIRED },
    "apps/web/scripts",
  );
  const r = run("", path.join(dir, "apps/web"), { scriptPath: script });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /git の一番上の/);
  assert.match(r.out, /据え置き期限切れ/);
});

test("audit: allowlist の書き方が違えば exit 2（until が日付でない・why が無い）", () => {
  const badUntil = auditProject({
    "package-lock.json": LOCK_V3,
    "scripts/audit-allowlist.json": '{ "lodash": { "why": "理由", "until": "来月" } }\n',
  });
  const r1 = run("", badUntil.dir, { scriptPath: badUntil.script });
  assert.equal(r1.code, 2, r1.out);
  assert.match(r1.out, /until は YYYY-MM-DD の日付で/);

  const noWhy = auditProject({
    "package-lock.json": LOCK_V3,
    "scripts/audit-allowlist.json": '{ "lodash": { "until": "2999-01-01" } }\n',
  });
  const r2 = run("", noWhy.dir, { scriptPath: noWhy.script });
  assert.equal(r2.code, 2, r2.out);
  assert.match(r2.out, /なぜ今直さないか/);
});

const fetchCanBeHidden =
  process.platform !== "win32" &&
  spawnSync(process.execPath, ["--no-experimental-fetch", "-e", "process.exit(typeof fetch === 'function' ? 1 : 0)"])
    .status === 0;

test(
  "audit: npm が使えず fetch も無い Node では「Node.js 18 以上が必要」で exit 2（期限なしの据え置きは警告）",
  { skip: fetchCanBeHidden ? false : "この Node では fetch を隠せない" },
  () => {
    const { dir, script } = auditProject({
      "package-lock.json": LOCK_V3,
      "scripts/audit-allowlist.json": '{ "lodash": "理由だけの古い書き方" }\n',
    });
    const emptyBin = path.join(dir, "empty-bin");
    mkdirSync(emptyBin);
    const r = run("", dir, { scriptPath: script, nodeArgs: ["--no-experimental-fetch"], env: { PATH: emptyBin } });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /期限（until）がありません/);
    assert.match(r.out, /Node\.js 18 以上が必要です（いまの版: v/);
  },
);
