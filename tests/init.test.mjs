// plugins/docdd/scripts/init.mjs（/docdd:init と /docdd:update-kit の処理）のテスト。依存なし・Node 18 以上。
//
//   node --test tests/init.test.mjs
//
// 使い捨ての git リポジトリを os.tmpdir() に作り、init.mjs をそのフォルダ（cwd）で実行する。
// 置いた雛形の検査スクリプト（templates/scripts）も実際に回し、「導入 → 検査 → コミット」が通ることを固定する。
// 通信は使わない。「空の Node プロジェクト」は npm init -y の出力と同じ package.json を直接書く（npm の起動と通信を避けるため）。
// v0.1.4 の雛形を使うテストは、このリポジトリの履歴（f08d4e5）が無い浅い clone では飛ばす。
// 雛形を CRLF で checkout した環境（Windows の core.autocrlf=true）でも通るよう、雛形から期待値を作るときは改行を LF に揃える。
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INIT = path.join(ROOT, "plugins/docdd/scripts/init.mjs");
const TEMPLATES = path.join(ROOT, "plugins/docdd/templates");
const PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "plugins/docdd/.claude-plugin/plugin.json"), "utf8")).version;
  } catch {
    return "0.2.0";
  }
})();
const V014 = "f08d4e5";
const V0132 = "docdd--v0.13.2";

// GIT_CONFIG_GLOBAL に os.devNull を渡すと、Git for Windows は「\\.\nul」を設定ファイルとして読めずに止まる。空のファイルを渡す
const EMPTY_GITCONFIG = path.join(fs.mkdtempSync(path.join(tmpdir(), "docdd-gitconfig-")), "config");
fs.writeFileSync(EMPTY_GITCONFIG, "");
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG, GIT_CONFIG_NOSYSTEM: "1", NPM_CONFIG_UPDATE_NOTIFIER: "false" };
for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_AUTHOR_DATE", "GIT_COMMITTER_DATE"]) delete ENV[key];

const made = [];
process.on("exit", () => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function git(cwd, args) {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));

/** mkdtemp →（git init → 名前とメール）→ ファイル →（コミット）。 */
function project({ files = {}, identity = true, withGit = true, commit = false } = {}) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "docdd-init-"));
  made.push(dir);
  if (withGit) {
    git(dir, ["init", "-q"]);
    git(dir, ["config", "commit.gpgsign", "false"]);
    if (identity) {
      git(dir, ["config", "user.name", "docdd test"]);
      git(dir, ["config", "user.email", "test@example.com"]);
    }
  }
  write(dir, files);
  if (commit) {
    git(dir, ["add", "--", ...Object.keys(files)]);
    git(dir, ["-c", "user.name=seed", "-c", "user.email=seed@example.com", "commit", "-q", "-m", "seed"]);
  }
  return dir;
}

/** init.mjs を --json で実行する。 */
function init(cwd, ...args) {
  const r = spawnSync(process.execPath, [INIT, ...args, "--json"], { cwd, env: ENV, encoding: "utf8" });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // 出力が JSON でなければ null のまま（assert で文面を見せる）
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

/** 置いた雛形の検査スクリプトを実行する。 */
function check(cwd, name) {
  return spawnSync(process.execPath, [`scripts/${name}.mjs`], { cwd, env: ENV, encoding: "utf8" });
}

function stage(cwd, paths) {
  if (paths.length) git(cwd, ["add", "--", ...paths]);
}

function listTemplates(dir = TEMPLATES, prefix = "") {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...listTemplates(path.join(dir, ent.name), rel));
    else if (rel !== "package.scripts.json" && ent.name !== ".DS_Store") out.push(rel);
  }
  return out.sort();
}

/** プロジェクトの全ファイルの sha256（.git を除く）。冪等性の確認に使う。 */
function snapshot(dir) {
  const out = {};
  const walk = (d, prefix) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === ".git") continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(d, ent.name), rel);
      else out[rel] = sha(fs.readFileSync(path.join(d, ent.name)));
    }
  };
  walk(dir, "");
  return out;
}

const SCRIPTS_TO_ADD = JSON.parse(fs.readFileSync(path.join(TEMPLATES, "package.scripts.json"), "utf8"));

// `npm init -y`（npm 10）が書く package.json と同じ中身。
const NPM_INIT_PACKAGE = `{
  "name": "demo",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
`;

const BUILTIN_CLAUDE_MD = `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- \`npm run dev\` starts the dev server
`;

function tablesBlock() {
  // append は既存の AGENTS.md の改行（ここでは LF）に揃えて足すので、雛形が CRLF で checkout されていても LF で比べる
  const t = fs.readFileSync(path.join(TEMPLATES, "AGENTS.md"), "utf8").replace(/\r\n/g, "\n");
  return t.slice(t.indexOf("<!-- docdd:tables:begin -->"), t.indexOf("<!-- docdd:tables:end -->") + "<!-- docdd:tables:end -->".length);
}

/** v0.1.4 の雛形で導入し、v0.1 の init が埋めたあとの姿に近づけたファイル一式。履歴（f08d4e5）が無ければ null。 */
function v014Files() {
  const has = spawnSync("git", ["-C", ROOT, "cat-file", "-e", `${V014}^{commit}`], { env: ENV });
  if (has.status !== 0) return null;
  const files = {};
  const list = git(ROOT, ["ls-tree", "-r", "--name-only", V014, "plugins/docdd/templates"]).split("\n").filter(Boolean);
  for (const f of list) {
    const rel = f.replace("plugins/docdd/templates/", "");
    if (rel === "package.scripts.json") continue;
    files[rel] = execFileSync("git", ["-C", ROOT, "show", `${V014}:${f}`], { env: ENV });
  }
  const fill = (s) =>
    s
      .toString("utf8")
      .replace("<プロジェクト名>", "よみログ")
      .replace("`<型検査。例: npm run typecheck。無ければ「無い」>`", "`npm run typecheck`")
      .replaceAll("<YYYY-MM-DD>", "2026-01-15");
  for (const rel of ["CLAUDE.md", "docs/PRD.md", "docs/operations/development-and-testing.md", "tasks/REFACTOR_PLAN.md"]) files[rel] = fill(files[rel]);
  files["package.json"] = '{\n  "name": "yomi",\n  "scripts": {\n    "check:doc-dates": "node scripts/check-doc-dates.mjs",\n    "check:doc-refs": "node scripts/check-doc-refs.mjs",\n    "audit:check": "node scripts/audit-check.mjs"\n  }\n}\n';
  return files;
}

/** templates/.gitignore の塊（「# docdd: 」で始まる見出しと、その下の行）。 */
function gitignoreTemplateBlocks() {
  const blocks = [];
  for (const l of fs.readFileSync(path.join(TEMPLATES, ".gitignore"), "utf8").split(/\r?\n/).map((s) => s.trim())) {
    if (l.startsWith("# docdd:")) blocks.push({ header: l, lines: [] });
    else if (l && !l.startsWith("#")) blocks[blocks.length - 1].lines.push(l);
  }
  return blocks;
}

/** .gitignore が無いときに置く中身（塊を空行 1 行で区切る）。 */
const gitignoreText = (blocks) => `${blocks.map((b) => [b.header, ...b.lines].join("\n")).join("\n\n")}\n`;

/** 既存の .gitignore に足すときの並び（塊の中で、肯定の行のあとに否定の行）。 */
const appendOrder = (lines) => [...lines.filter((l) => !l.startsWith("!")), ...lines.filter((l) => l.startsWith("!"))];

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** LF だけの改行（CRLF でない \n）の数。 */
const bareLf = (s) => s.split("\n").length - 1 - (s.match(/\r\n/g) || []).length;

// ---------------------------------------------------------------------------------------------

test("既存の BACKLOG とアーカイブ: 番号はアーカイブも含めた続きで、終えてアーカイブへ移した「アプリの土台を作る」は足し直さない", () => {
  const backlog = "# 開発バックログ\n\n## タスク\n\n### T-05: ログインできる `doing`\n- 参照: PRD A-1\n\n## 要決定・外部準備（ユーザー作業）\n";
  const archive = "# アーカイブ\n\n## 決定済みの要決定・外部準備\n\n## 完了したタスク\n\n### T-01: アプリの土台を作る `done`\n- メモ: 済み\n\n### T-09: 古い機能 `dropped`\n- 理由: 不要\n";
  const dir = project({ files: { "tasks/BACKLOG.md": backlog, "tasks/archive/BACKLOG-done.md": archive, "package.json": '{\n  "name": "x"\n}\n' } });
  const a = init(dir, "apply", "--tasks", "scaffold,test-infra");
  assert.equal(a.status, 0, a.stdout);
  assert.deepEqual(a.json.tasks, [
    { kind: "scaffold", id: "T-01", title: "アプリの土台を作る", action: "exists" },
    { kind: "test-infra", id: "T-10", title: "テスト基盤の導入", action: "added" },
  ]);
  const text = read(dir, "tasks/BACKLOG.md");
  assert.doesNotMatch(text, /アプリの土台を作る/);
  assert.match(text, /^### T-10: テスト基盤の導入 `todo`$/m);
  assert.equal(read(dir, "tasks/archive/BACKLOG-done.md"), archive, "既にあるアーカイブは置き換えない");
});

test("置いた backlog-archive.mjs: 雛形のままの BACKLOG では移すものが無く、done にしたタスクを移せる", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  const a = init(dir, "apply", "--tasks", "scaffold");
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(JSON.parse(read(dir, "package.json")).scripts["backlog:archive"], "node scripts/backlog-archive.mjs");
  const runArchive = (...args) => spawnSync(process.execPath, ["scripts/backlog-archive.mjs", ...args], { cwd: dir, env: ENV, encoding: "utf8" });
  assert.equal(runArchive("--check").status, 0, "雛形の見本（コードブロックの中）は移さない");
  write(dir, { "tasks/BACKLOG.md": read(dir, "tasks/BACKLOG.md").replace("### T-01: アプリの土台を作る `todo`", "### T-01: アプリの土台を作る `done`") });
  const r = runArchive();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(read(dir, "tasks/BACKLOG.md"), /### T-01: アプリの土台を作る/);
  assert.match(read(dir, "tasks/archive/BACKLOG-done.md"), /### T-01: アプリの土台を作る `done`/);
});

test("空の Node プロジェクト: status → apply → git add → 検査 → dates → precommit → commit → 検査、2 回目の apply は何も変えない", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });

  const st = init(dir, "status");
  assert.equal(st.status, 0, st.stderr);
  assert.equal(st.json.state, "not-installed");
  assert.equal(st.json.atGitRoot, true);
  assert.equal(st.json.packageManager, "npm");
  assert.equal(st.json.scaffold.present, true);
  const unit = st.json.inferred.find((r) => r.row === "単体・DBテスト");
  assert.equal(unit.value, "無い", "npm init の既定の test は「無い」扱い");
  assert.equal(st.json.inferred.find((r) => r.row === "テスト用 DB").value, null);
  assert.equal(st.json.inferred.find((r) => r.row === "依存の脆弱性").value, "node scripts/audit-check.mjs", "lock がまだ無い npm でも audit-check を使う");
  assert.equal(st.json.agentsMd.exists, false);

  const a = init(dir, "apply", "--fill-inferred", "--tasks", "test-infra");
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.deepEqual([...a.json.created].sort(), listTemplates(), "package.scripts.json 以外の雛形を全部置く");
  assert.equal(exists(dir, "package.scripts.json"), false);
  assert.deepEqual(a.json.modified.map((m) => m.path), ["package.json"]);

  // package.json: 元のインデント（2 スペース）・キーの並び・末尾改行を保って scripts に雛形の行（package.scripts.json）を足す
  const expected = NPM_INIT_PACKAGE.replace(
    '"test": "echo \\"Error: no test specified\\" && exit 1"',
    ['"test": "echo \\"Error: no test specified\\" && exit 1"', ...Object.entries(SCRIPTS_TO_ADD).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)].join(",\n"),
  );
  assert.equal(read(dir, "package.json"), expected);

  // manifest
  const man = JSON.parse(read(dir, ".docdd/manifest.json"));
  assert.equal(man.kitVersion, PLUGIN_VERSION);
  assert.equal(man.files["scripts/check-doc-refs.mjs"].owner, "kit");
  assert.equal(man.files["scripts/check-doc-refs.mjs"].sha256, sha(fs.readFileSync(path.join(TEMPLATES, "scripts/check-doc-refs.mjs"))));
  assert.equal(man.files["CLAUDE.md"].owner, "kit");
  assert.equal(man.files["docs/requirements/00_template.md"].owner, "sample");
  assert.equal(man.files["docs/PRD.md"].owner, "user");

  // toStage: 置いたもの＋変えた package.json＋manifest
  for (const p of [...a.json.created, "package.json", ".docdd/manifest.json"]) assert.ok(a.json.toStage.includes(p), `toStage に ${p}`);

  // --fill-inferred と --tasks
  const claude = read(dir, "AGENTS.md");
  assert.match(claude, /^\| 単体・DBテスト \| 無い \|$/m);
  assert.match(claude, /^\| 依存の脆弱性 \| `node scripts\/audit-check\.mjs` \|$/m, "lock がまだ無い npm でも推定する（lock が無ければスクリプトが npm install を案内する）");
  assert.match(claude, /^\| lint \| 無い \|$/m, "package.json はあるが script が無い行は「無い」");
  assert.match(claude, /^\| テスト用 DB \| \{\{テスト用 DB\}\} \|$/m, "推定できない行は {{…}} のまま");
  const backlog = read(dir, "tasks/BACKLOG.md");
  assert.match(backlog, /^### T-01: テスト基盤の導入 `todo`$/m);
  assert.match(backlog, /参照: docs\/operations\/development-and-testing\.md §4 \/ 依存: なし \/ サイズ: S/);
  assert.ok(backlog.indexOf("### T-01: テスト基盤の導入") > backlog.indexOf("## タスク"));
  assert.ok(backlog.indexOf("### T-01: テスト基盤の導入") < backlog.indexOf("## 要決定・外部準備"));

  stage(dir, a.json.toStage);
  const refs = check(dir, "check-doc-refs");
  assert.equal(refs.status, 0, refs.stdout + refs.stderr);

  const d = init(dir, "dates");
  assert.equal(d.status, 0, d.stdout);
  assert.deepEqual(d.json.changed.map((c) => c.file).sort(), ["docs/PRD.md", "docs/operations/development-and-testing.md"]);
  assert.ok(read(dir, "docs/requirements/00_template.md").includes("{{YYYY-MM-DD}}"), "見本の日付は埋めない");
  assert.ok(read(dir, "docs/decisions/0000-template.md").includes("{{YYYY-MM-DD}}"), "見本の日付は埋めない");
  assert.ok(!read(dir, "docs/PRD.md").includes("{{YYYY-MM-DD}}"));
  stage(dir, d.json.toStage);

  const pc = init(dir, "precommit");
  assert.equal(pc.status, 0, pc.stdout);
  assert.equal(pc.json.ok, true);
  assert.deepEqual(pc.json.identity, { name: "docdd test", email: "test@example.com" });

  git(dir, ["commit", "-q", "-m", "chore: docdd キットを導入"]);
  const dates = check(dir, "check-doc-dates");
  assert.equal(dates.status, 0, dates.stdout + dates.stderr);

  const ph = check(dir, "check-doc-placeholders");
  assert.equal(ph.status, 1, "未記入の欄が残っているので 1");
  const phOut = ph.stdout + ph.stderr;
  assert.match(phOut, /AGENTS\.md:1 +\{\{プロジェクト名\}\}/);
  assert.match(phOut, /docs\/PRD\.md:\d+ +\{\{機能名\}\}/);
  assert.doesNotMatch(phOut, /CLAUDE\.md:\d+ +\{\{型検査\}\}/, "推定で埋めた行は残らない");
  assert.doesNotMatch(phOut, /\{\{YYYY-MM-DD\}\}/, "dates で埋めた");

  const after = init(dir, "status");
  assert.equal(after.json.state, "partial", "未記入の欄が残っているので partial");
  assert.equal(after.json.manifest.tracked, true);

  // 2 回目: 何も上書き・追記しない
  const before = snapshot(dir);
  const again = init(dir, "apply", "--fill-inferred", "--tasks", "test-infra");
  assert.equal(again.status, 0, again.stdout);
  assert.deepEqual(again.json.created, []);
  assert.deepEqual(again.json.modified, []);
  assert.equal(again.json.manifest.written, false);
  assert.deepEqual(again.json.tasks, [{ kind: "test-infra", id: "T-01", title: "テスト基盤の導入", action: "exists" }]);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(git(dir, ["status", "--porcelain"]), "");
});

test("package.json: 4 スペース・scripts 無し・末尾改行なし／タブ・既存の script は変えない", () => {
  const four = '{\n    "name": "four",\n    "private": true\n}';
  const dir = project({ files: { "package.json": four } });
  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  const scripts = Object.entries(SCRIPTS_TO_ADD).map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  assert.equal(read(dir, "package.json"), `{\n    "name": "four",\n    "private": true,\n    "scripts": {\n${scripts}\n    }\n}`);
  assert.equal(a.json.packageJson.reformatted, false);

  const tab = '{\n\t"name": "tab",\n\t"scripts": {\n\t\t"check:doc-refs": "echo mine",\n\t\t"files": ["a", "b"]\n\t},\n\t"keywords": ["x", "y"]\n}\n';
  const dir2 = project({ files: { "package.json": tab } });
  const b = init(dir2, "apply");
  assert.equal(b.status, 0, b.stdout);
  const added = Object.entries(SCRIPTS_TO_ADD).filter(([k]) => k !== "check:doc-refs");
  assert.deepEqual(b.json.packageJson.added, added.map(([k]) => k));
  assert.deepEqual(b.json.packageJson.alreadyPresent, ["check:doc-refs"]);
  assert.equal(
    read(dir2, "package.json"),
    `{\n\t"name": "tab",\n\t"scripts": {\n\t\t"check:doc-refs": "echo mine",\n\t\t"files": ["a", "b"]${added.map(([k, v]) => `,\n\t\t${JSON.stringify(k)}: ${JSON.stringify(v)}`).join("")}\n\t},\n\t"keywords": ["x", "y"]\n}\n`,
  );
});

test("package.json の無いプロジェクト: 検証表は未記入のまま・scripts は足さない・settings を置かなくても参照の検査は通る", () => {
  const dir = project({ files: { "README.md": "# memo\n" } });
  const st = init(dir, "status");
  assert.equal(st.json.scaffold.present, false, "package.json もソースも無い＝土台が無い");
  assert.ok(st.json.inferred.every((r) => r.value === null), "推定できる材料が無い");

  const a = init(dir, "apply", "--fill-inferred", "--settings", "no", "--tasks", "scaffold,test-infra");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(exists(dir, "package.json"), false);
  assert.equal(a.json.packageJson.exists, false);
  assert.ok(!a.json.toStage.includes("package.json"));
  assert.deepEqual(a.json.filled, []);
  assert.match(read(dir, "AGENTS.md"), /^\| 型検査 \| \{\{型検査\}\} \|$/m);
  assert.equal(exists(dir, ".claude/settings.json"), false);
  assert.equal(a.json.settings.action, "declined");
  assert.equal(read(dir, ".mcp.json"), '{\n  "mcpServers": {}\n}\n', "Next.js ではないので空");

  const backlog = read(dir, "tasks/BACKLOG.md");
  assert.match(backlog, /^### T-01: アプリの土台を作る `todo`$/m);
  assert.match(backlog, /^### T-02: テスト基盤の導入 `todo`$/m);
  assert.match(backlog, /依存: T-01 \/ サイズ: S/);
  assert.ok(backlog.indexOf("### T-01: アプリの土台を作る") < backlog.indexOf("### T-02: テスト基盤の導入"));
  assert.ok(backlog.includes("### T-NN: <基盤・環境のタスク名> `todo`"), "運用ルールのコードブロックの見本は変えない（実タスクと番号が重ならない T-NN）");

  stage(dir, a.json.toStage);
  const refs = check(dir, "check-doc-refs");
  assert.equal(refs.status, 0, refs.stdout + refs.stderr);
});

test("既存の BACKLOG: 実タスクの番号の続きで、最初のタスクの前に足す", () => {
  const backlog = "# 開発バックログ\n\n## タスク\n\n### T-05: ログインできる `doing`\n- 参照: PRD A-1\n\n## 要決定・外部準備（ユーザー作業）\n";
  const dir = project({ files: { "tasks/BACKLOG.md": backlog, "package.json": '{\n  "name": "x"\n}\n' } });
  const a = init(dir, "apply", "--tasks", "test-infra");
  assert.equal(a.status, 0, a.stdout);
  assert.deepEqual(a.json.tasks, [{ kind: "test-infra", id: "T-06", title: "テスト基盤の導入", action: "added" }]);
  const text = read(dir, "tasks/BACKLOG.md");
  assert.ok(text.indexOf("### T-06: テスト基盤の導入") < text.indexOf("### T-05: ログインできる"));
  assert.ok(text.startsWith("# 開発バックログ\n\n## タスク\n\n### T-06"));
  assert.ok(a.json.modified.some((m) => m.path === "tasks/BACKLOG.md"));
});

test("既存の CLAUDE.md（組み込み /init 風）: AGENTS.md を置き、CLAUDE.md には @AGENTS.md の 1 行だけ足す（元の中身は残す）", () => {
  const pointer = fs.readFileSync(path.join(TEMPLATES, "CLAUDE.md"), "utf8");
  const dir = project({ files: { "CLAUDE.md": BUILTIN_CLAUDE_MD, "package.json": '{\n  "name": "x"\n}\n' } });
  const st = init(dir, "status");
  assert.equal(st.json.agentsMd.exists, true, "AGENTS.md が無ければ、移行の判定のために CLAUDE.md を見る");
  assert.equal(st.json.agentsMd.file, "CLAUDE.md");
  assert.equal(st.json.agentsMd.builtinInit, true);
  assert.equal(st.json.agentsMd.hasMarkers, false);

  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(read(dir, "AGENTS.md"), fs.readFileSync(path.join(TEMPLATES, "AGENTS.md"), "utf8"), "AGENTS.md は雛形のまま置く");
  assert.equal(read(dir, "CLAUDE.md"), `${BUILTIN_CLAUDE_MD}\n${pointer}`, "元の CLAUDE.md は消さず、読み込む 1 行を足す");
  assert.ok(a.json.toStage.includes("CLAUDE.md"));
  assert.ok(a.json.toStage.includes("AGENTS.md"));

  const again = init(dir, "apply", "--settings", "no");
  assert.equal(again.json.agentsMd.action, "unchanged", "マーカーがあれば二重に足さない");
  assert.equal(read(dir, "CLAUDE.md"), `${BUILTIN_CLAUDE_MD}\n${pointer}`, "1 行を二重に足さない");

  // AGENTS.md が既にあるプロジェクト（キットのものではない）
  const dir2 = project({ files: { "AGENTS.md": BUILTIN_CLAUDE_MD } });
  const ap = init(dir2, "apply", "--agents-md", "append", "--settings", "no");
  assert.equal(ap.status, 0, ap.stdout);
  assert.equal(read(dir2, "AGENTS.md"), `${BUILTIN_CLAUDE_MD}\n${tablesBlock()}\n`);
  assert.equal(ap.json.agentsMd.action, "appended");
  assert.equal(read(dir2, "CLAUDE.md"), pointer, "CLAUDE.md は読み込む 1 行だけ置く");

  const dir3 = project({ files: { "AGENTS.md": BUILTIN_CLAUDE_MD } });
  const r = init(dir3, "apply", "--agents-md", "replace", "--settings", "no");
  assert.equal(r.status, 0, r.stdout);
  assert.equal(read(dir3, "AGENTS.md"), fs.readFileSync(path.join(TEMPLATES, "AGENTS.md"), "utf8"));
  assert.equal(read(dir3, "AGENTS.md.bak"), BUILTIN_CLAUDE_MD);
  assert.deepEqual(r.json.backups, ["AGENTS.md.bak"]);
  assert.ok(!r.json.toStage.some((p) => p.startsWith("AGENTS.md.bak")), ".bak は stage しない");
  assert.equal(JSON.parse(read(dir3, ".docdd/manifest.json")).files["AGENTS.md"].owner, "user");

  const dir4 = project({ files: { "AGENTS.md": BUILTIN_CLAUDE_MD } });
  const k = init(dir4, "apply", "--agents-md", "keep", "--settings", "no");
  assert.equal(read(dir4, "AGENTS.md"), BUILTIN_CLAUDE_MD);
  assert.equal(k.json.agentsMd.action, "kept");
  assert.ok(k.json.warnings.some((w) => w.includes("検証コマンド")));
});

test("既存の .claude/settings.json と .mcp.json は上書きもマージもせず、差分を返す", () => {
  const settings = '{ "permissions": { "allow": ["Bash(ls:*)"] } }\n';
  const mcp = '{ "mcpServers": { "mine": { "command": "x" } } }\n';
  const pkg = '{\n  "name": "web",\n  "dependencies": { "next": "15.0.0" }\n}\n';
  const dir = project({ files: { ".claude/settings.json": settings, ".mcp.json": mcp, "package.json": pkg } });

  const st = init(dir, "status");
  assert.equal(st.json.settings.exists, true);
  assert.ok(st.json.settings.missingDeny.includes("Bash(sudo:*)"));
  assert.ok(st.json.settings.missingDeny.includes("Read(./.env)"));
  assert.equal(st.json.settings.currentDefaultMode, null, "既存に始まりのモードの指定が無い");
  for (const key of ["defaultMode", "missingMarketplace", "missingEnabledPlugin"]) assert.ok(!(key in st.json.settings), `settings.${key} は返さない`);
  assert.deepEqual(st.json.mcp.missingServers, ["shadcn", "next-devtools"]);

  const a = init(dir, "apply", "--settings", "yes");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(read(dir, ".claude/settings.json"), settings);
  assert.equal(read(dir, ".mcp.json"), mcp);
  assert.equal(a.json.settings.action, "skipped");
  assert.ok(a.json.settings.diff.missingAsk.includes("Bash(git push *)"));
  assert.equal(a.json.mcp.action, "skipped");
  assert.deepEqual(a.json.mcp.missingServers, ["shadcn", "next-devtools"]);
  assert.ok(!a.json.created.includes(".claude/settings.json"));
});

test("雛形の .claude/settings.json は始まりのモード・入手先・有効化を決めない。既存の defaultMode は currentDefaultMode で報告するだけで消さない", () => {
  const templateText = fs.readFileSync(path.join(TEMPLATES, ".claude/settings.json"), "utf8");
  const t = JSON.parse(templateText);
  assert.equal(t.permissions.defaultMode, undefined, "Pro・Max・Team の auto モードを上書きしない");
  assert.equal(t.extraKnownMarketplaces, undefined, "入手先の名前を決め打ちしない");
  assert.equal(t.enabledPlugins, undefined);
  for (const key of ["allow", "ask", "deny"]) assert.ok(Array.isArray(t.permissions[key]) && t.permissions[key].length > 0, `permissions.${key} は残す`);

  const fresh = project({ files: { "package.json": '{\n  "name": "x"\n}\n' } });
  const a = init(fresh, "apply", "--settings", "yes");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(a.json.settings.action, "created");
  assert.equal(read(fresh, ".claude/settings.json"), templateText);
  const same = init(fresh, "status").json.settings;
  assert.deepEqual([same.sameAsTemplate, same.currentDefaultMode, same.missingAllow, same.missingAsk, same.missingDeny], [true, null, [], [], []]);

  const settings = `${JSON.stringify({ permissions: { defaultMode: "acceptEdits", allow: t.permissions.allow, ask: t.permissions.ask, deny: t.permissions.deny } }, null, 2)}\n`;
  const dir = project({ files: { ".claude/settings.json": settings, "package.json": '{\n  "name": "x"\n}\n' } });
  const st = init(dir, "status").json.settings;
  assert.deepEqual([st.currentDefaultMode, st.missingAllow, st.missingAsk, st.missingDeny], ["acceptEdits", [], [], []]);
  const b = init(dir, "apply", "--settings", "yes");
  assert.equal(b.status, 0, b.stdout);
  assert.equal(b.json.settings.action, "skipped");
  assert.equal(b.json.settings.diff.currentDefaultMode, "acceptEdits");
  assert.equal(read(dir, ".claude/settings.json"), settings, "既存の defaultMode は消さない");
  assert.equal(init(dir, "update").json.files.find((f) => f.path === ".claude/settings.json").settings.currentDefaultMode, "acceptEdits");
});

test("apply を add せずにもう一度実行しても、toStage に .gitignore と package.json が残る（.gitignore の例外の行を足す流れ）。コミット後は、キットと関係ない package.json の変更を stage しない", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE, ".gitignore": "node_modules/\n.claude/\n" }, commit: true });
  const first = init(dir, "apply", "--fill-inferred");
  assert.equal(first.status, 0, first.stdout);
  assert.deepEqual(first.json.ignored, [".claude/settings.json"]);
  for (const p of [".gitignore", "package.json"]) assert.ok(first.json.toStage.includes(p), `1 回目の toStage に ${p}`);

  // add せずにもう一度 apply しても残る
  const rerun = init(dir, "apply", "--fill-inferred");
  for (const p of [".gitignore", "package.json"]) assert.ok(rerun.json.toStage.includes(p), `2 回目の toStage に ${p}`);

  // init/SKILL.md 手順 3-1: .claude/ を .claude/* と例外の 2 行に直し、apply をもう一度実行する
  write(dir, { ".gitignore": read(dir, ".gitignore").replace(".claude/\n", ".claude/*\n!.claude/rules/\n!.claude/settings.json\n") });
  const second = init(dir, "apply", "--fill-inferred");
  assert.deepEqual(second.json.ignored, []);
  for (const p of [".gitignore", "package.json", ".claude/settings.json"]) assert.ok(second.json.toStage.includes(p), `toStage に ${p}`);
  stage(dir, second.json.toStage);
  const d = init(dir, "dates");
  stage(dir, d.json.toStage);
  assert.equal(init(dir, "precommit").json.ok, true);
  git(dir, ["commit", "-q", "-m", "chore: docdd キットを導入"]);
  assert.equal(git(dir, ["status", "--porcelain"]), "", "コミットし残したファイルが無い");
  assert.match(git(dir, ["show", "HEAD:.gitignore"]), /^\.env$/m, "コミットした .gitignore に .env の除外がある");
  const committedScripts = JSON.parse(git(dir, ["show", "HEAD:package.json"])).scripts;
  for (const k of Object.keys(SCRIPTS_TO_ADD)) assert.ok(k in committedScripts, `コミットした package.json に ${k}`);

  // コミットのあと: 依存の追加だけの package.json と、変えていない .gitignore は stage しない
  write(dir, { "package.json": read(dir, "package.json").replace('"license": "ISC"', '"license": "ISC",\n  "dependencies": {\n    "zod": "^3.0.0"\n  }') });
  const later = init(dir, "apply", "--fill-inferred");
  assert.equal(later.status, 0, later.stdout);
  assert.ok(!later.json.toStage.includes("package.json"), later.json.toStage.join(" "));
  assert.ok(!later.json.toStage.includes(".gitignore"), later.json.toStage.join(" "));
});

test("既存の .gitignore: 足りない行だけを塊ごとに「# docdd: 共通」「# docdd: Web（…）」の見出しの下へ足し、2 回目は変えない", () => {
  const original = "node_modules/\n.env\n/custom-output\n";
  const dir = project({ files: { ".gitignore": original } });
  const blocks = gitignoreTemplateBlocks();
  assert.deepEqual(blocks.map((b) => b.header), ["# docdd: 共通", "# docdd: Web（Node.js・ビルド出力・Playwright）", "# docdd: Python"], "見出しは完全一致で、この順");
  // 否定の行（!.env.example）は、同じ塊で足した行より後ろに置く（.gitignore は後ろの行が勝つ）
  const [common, web] = blocks.map((b) => appendOrder(b.lines.filter((l) => l !== "node_modules/" && l !== ".env")));
  const expected = `${original}\n${blocks[0].header}\n${common.join("\n")}\n\n${blocks[1].header}\n${web.join("\n")}\n`;

  const a = init(dir, "apply");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(a.json.gitignore.action, "appended");
  assert.equal(read(dir, ".gitignore"), expected, "package.json も Web 以外の目印も無い（web=null）ので共通と Web の塊。Python は検出していないので足さない");
  assert.deepEqual(a.json.gitignore.addedLines, [...common, ...web]);
  assert.ok(a.json.toStage.includes(".gitignore"));

  const again = init(dir, "apply");
  assert.equal(again.json.gitignore.action, "unchanged");
  assert.equal(read(dir, ".gitignore"), expected);

  // 見出しだけ残して行が消えていたら、その塊の見出しの下へ戻す（肯定の行を足すので、否定の行もその後ろにもう一度書く）
  write(dir, { ".gitignore": `${original}\n${blocks[0].header}\n${common.slice(1).join("\n")}\n\n${blocks[1].header}\n${web.join("\n")}\n` });
  init(dir, "apply");
  assert.equal(read(dir, ".gitignore"), `${original}\n${blocks[0].header}\n${common.slice(1).join("\n")}\n${common[0]}\n!.env.example\n\n${blocks[1].header}\n${web.join("\n")}\n`);
});

test("precommit: .env の除外漏れ・stage された .env とログイン状態・名前とメールの未設定を問題として返す", () => {
  const dir = project({ files: { "README.md": "# x\n", ".env": "SECRET=1\n" }, identity: false });
  git(dir, ["add", "--", "README.md"]);
  const a = init(dir, "precommit");
  assert.equal(a.status, 1);
  const codes = a.json.problems.map((p) => p.code);
  assert.ok(codes.includes("env-not-ignored"), JSON.stringify(a.json.problems));
  assert.ok(codes.includes("no-identity"));

  const dir2 = project({ files: { ".gitignore": ".env\n.env.*\n!.env.example\n", ".env": "SECRET=1\n", "playwright/.auth/user.json": "{}\n", ".env.example": "SECRET=\n" } });
  git(dir2, ["add", "--", ".gitignore", "playwright/.auth/user.json", ".env.example"]);
  git(dir2, ["add", "-f", "--", ".env"]);
  const b = init(dir2, "precommit");
  assert.equal(b.status, 1);
  const bcodes = b.json.problems.map((p) => `${p.code}:${p.path ?? ""}`);
  assert.ok(bcodes.includes("env-staged:.env"), bcodes.join(" "));
  assert.ok(bcodes.includes("auth-state-staged:playwright/.auth/user.json"), bcodes.join(" "));
  assert.ok(!bcodes.some((c) => c.includes(".env.example")), ".env.example は問題にしない");
  assert.ok(!bcodes.some((c) => c.startsWith("env-not-ignored")));

  const dir3 = project({ files: { ".gitignore": ".env\n.env.*\n" } });
  const c = init(dir3, "precommit");
  assert.deepEqual(c.json.problems.map((p) => p.code), ["nothing-staged"]);
});

test("サブディレクトリ（モノレポ）: status が atGitRoot=false を返し、一番上の lock から依存の脆弱性を推定する", () => {
  const dir = project({
    files: {
      "package.json": '{\n  "name": "mono",\n  "private": true\n}\n',
      "package-lock.json": '{\n  "lockfileVersion": 3,\n  "packages": {}\n}\n',
      "apps/web/package.json": '{\n  "name": "web",\n  "scripts": { "dev": "vite", "test": "vitest run" },\n  "devDependencies": { "vite": "5.0.0" }\n}\n',
    },
  });
  const web = path.join(dir, "apps/web");
  const st = init(web, "status");
  assert.equal(st.status, 0, st.stderr);
  assert.equal(st.json.atGitRoot, false);
  assert.equal(st.json.git.pathFromRoot, "apps/web");
  assert.equal(st.json.lockfile, "../../package-lock.json");
  const row = (name) => st.json.inferred.find((r) => r.row === name);
  assert.equal(row("依存の脆弱性").value, "node scripts/audit-check.mjs");
  assert.equal(row("開発サーバー起動").cell, "`npm run dev`（http://localhost:5173 で開く）");
  assert.equal(row("単体・DBテスト").value, "npm test");
});

test("--dry-run は何も書かない・使い方の誤りは終了コード 2", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  const before = snapshot(dir);
  const a = init(dir, "apply", "--dry-run", "--fill-inferred", "--tasks", "test-infra");
  assert.equal(a.status, 0, a.stdout);
  assert.ok(a.json.created.length > 10);
  assert.equal(a.json.manifest.written, false);
  assert.deepEqual(snapshot(dir), before);

  const bad = init(dir, "apply", "--agents-md", "merge");
  assert.equal(bad.status, 2);
  assert.equal(bad.json.ok, false);
  assert.match(bad.json.error, /--agents-md/);

  const noManifest = init(dir, "dates");
  assert.equal(noManifest.status, 2);
  assert.match(noManifest.json.error, /manifest/);
});

test("update（v0.2 で導入済み）: 手付かずのキットのファイルは current、手を入れたら review と差分、manifest の記録どおりなら replace", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  const a = init(dir, "apply");
  assert.equal(a.status, 0, a.stdout);

  const clean = init(dir, "update");
  assert.equal(clean.status, 0, clean.stdout);
  assert.equal(clean.json.basis, "manifest");
  assert.deepEqual(clean.json.applicable, [], JSON.stringify(clean.json.summary));

  // 利用者が手を入れた
  write(dir, { "scripts/check-doc-refs.mjs": `${read(dir, "scripts/check-doc-refs.mjs")}// my change\n` });
  const mod = init(dir, "update");
  const e = mod.json.files.find((f) => f.path === "scripts/check-doc-refs.mjs");
  assert.equal(e.status, "modified");
  assert.equal(e.action, "review");
  assert.match(e.diff, /^-\/\/ my change$/m);

  // manifest に記録した中身のまま（＝キットが置いたまま）で、雛形だけが新しい場合
  const man = JSON.parse(read(dir, ".docdd/manifest.json"));
  man.files["scripts/check-doc-refs.mjs"].sha256 = sha(fs.readFileSync(path.join(dir, "scripts/check-doc-refs.mjs")));
  write(dir, { ".docdd/manifest.json": `${JSON.stringify(man, null, 2)}\n` });
  const up = init(dir, "update");
  const e2 = up.json.files.find((f) => f.path === "scripts/check-doc-refs.mjs");
  assert.equal(e2.status, "untouched");
  assert.equal(e2.action, "replace");

  const applied = init(dir, "update", "--apply", "scripts/check-doc-refs.mjs");
  assert.equal(applied.status, 0, applied.stdout);
  assert.equal(read(dir, "scripts/check-doc-refs.mjs"), fs.readFileSync(path.join(TEMPLATES, "scripts/check-doc-refs.mjs"), "utf8"));
  assert.deepEqual(applied.json.toStage, [".docdd/manifest.json", "scripts/check-doc-refs.mjs"]);

  const wrong = init(dir, "update", "--apply", "docs/PRD.md");
  assert.equal(wrong.status, 2);
  assert.equal(wrong.json.errors[0].path, "docs/PRD.md");
});

test("update --apply と apply で manifest を書き直しても、運営者が足した notifyUpdates: false を残す", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  assert.equal(init(dir, "apply").status, 0);
  const man = JSON.parse(read(dir, ".docdd/manifest.json"));
  man.notifyUpdates = false;
  // manifest の記録どおりのまま雛形だけが新しい形にして、update で置き換えさせる
  write(dir, { "scripts/check-doc-refs.mjs": `${read(dir, "scripts/check-doc-refs.mjs")}// old\n` });
  man.files["scripts/check-doc-refs.mjs"].sha256 = sha(fs.readFileSync(path.join(dir, "scripts/check-doc-refs.mjs")));
  write(dir, { ".docdd/manifest.json": `${JSON.stringify(man, null, 2)}\n` });

  const applied = init(dir, "update", "--apply", "scripts/check-doc-refs.mjs");
  assert.equal(applied.status, 0, applied.stdout);
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).notifyUpdates, false);

  // apply でも（消した雛形を置き直して manifest を書き直すとき）
  fs.rmSync(path.join(dir, "scripts/check-doc-dates.mjs"));
  assert.equal(init(dir, "apply").status, 0);
  assert.ok(exists(dir, "scripts/check-doc-dates.mjs"));
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).notifyUpdates, false);
});

for (const OLD of [
  "| 起票する | `/docdd:add-task`（要望を 1 件ずつ）／`/docdd:tasks-from-prd`（PRD の機能をまとめて） |",
  "| 起票する | `/docdd:add-task`（要望を 1 件ずつ）／`/docdd:tasks-from-docs`（仕様書からまとめて。docs を自分で書き換えたあとも） |",
]) test(`update: 無くなったスキルを指す AGENTS.md の行（${OLD.match(/tasks-from-\w+/)[0]}）は、雛形のままのときだけ rename で置き換える`, () => {
  const NEW = fs.readFileSync(path.join(TEMPLATES, "AGENTS.md"), "utf8").split(/\r?\n/).find((l) => l.startsWith("| 起票する |"));
  assert.doesNotMatch(NEW, /tasks-from-/);

  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  assert.equal(init(dir, "apply").status, 0);
  const cur = read(dir, "AGENTS.md");
  write(dir, { "AGENTS.md": cur.replace(NEW, OLD) });

  const up = init(dir, "update");
  const e = up.json.files.find((f) => f.path === "AGENTS.md");
  assert.equal(e.action, "append");
  assert.deepEqual(e.additions.filter((a) => a.kind === "rename").map((a) => [a.from, a.to]), [[OLD, NEW]]);

  const applied = init(dir, "update", "--apply", "AGENTS.md");
  assert.equal(applied.status, 0, applied.stdout);
  assert.ok(read(dir, "AGENTS.md").includes(NEW));
  assert.ok(!read(dir, "AGENTS.md").includes("tasks-from-"));
  assert.ok(!init(dir, "update").json.files.find((f) => f.path === "AGENTS.md").additions?.some((a) => a.kind === "rename"));

  // 利用者が書き換えた行は変えない
  const custom = "| 起票する | `/docdd:add-task`／`/docdd:tasks-from-prd`（わたしのメモ） |";
  write(dir, { "AGENTS.md": read(dir, "AGENTS.md").replace(NEW, custom) });
  assert.ok(!init(dir, "update").json.files.find((f) => f.path === "AGENTS.md").additions?.some((a) => a.kind === "rename"));
});

test("v0.1.4 の雛形で導入したプロジェクト: status は legacy、update は scripts を「手付かず→置換」に分類し、移行後は参照の検査が通る", (t) => {
  const files = v014Files();
  if (!files) {
    t.skip(`このリポジトリに ${V014}（v0.1.4）の履歴が無い（浅い clone）`);
    return;
  }
  const dir = project({ files, commit: true });

  const st = init(dir, "status");
  assert.equal(st.json.state, "legacy");
  assert.equal(st.json.agentsMd.legacyTables, true);

  const refused = init(dir, "apply");
  assert.equal(refused.status, 2);
  assert.match(refused.json.error, /update-kit/);

  const up = init(dir, "update");
  assert.equal(up.status, 0, up.stdout);
  assert.equal(up.json.state, "legacy");
  assert.equal(up.json.basis, "known-hashes");
  const f = (p) => up.json.files.find((x) => x.path === p);
  for (const p of ["scripts/check-doc-dates.mjs", "scripts/check-doc-refs.mjs", "scripts/audit-check.mjs"]) {
    assert.equal(f(p).status, "untouched", p);
    assert.equal(f(p).action, "replace", p);
    assert.equal(f(p).matchedVersion, "0.1.1〜0.1.4", p);
  }
  assert.equal(f("scripts/check-doc-placeholders.mjs").action, "add");
  assert.equal(f("scripts/backlog-archive.mjs").action, "add");
  assert.equal(f("tasks/archive/BACKLOG-done.md").action, "add");
  assert.equal(f("AGENTS.md").action, "migrate-to-agents", "CLAUDE.md の中身と約束を AGENTS.md へまとめる");
  assert.equal(f("CLAUDE.md").action, "none", "AGENTS.md の移行が CLAUDE.md も書き換える");
  assert.equal(up.json.legacy.removals.length, 8);
  assert.ok(up.json.legacy.removals.every((r) => r.customized === false), JSON.stringify(up.json.legacy.removals.map((r) => r.heading)));
  const devAdds = f("docs/operations/development-and-testing.md").additions.map((a) => a.heading);
  assert.ok(devAdds.some((h) => h.includes("テスト基盤が無いとき")), devAdds.join(" / "));
  assert.ok(devAdds.some((h) => h.includes("落とし穴")), devAdds.join(" / "));
  assert.deepEqual(f("package.json").additions, ["check:doc-placeholders", "backlog:archive"]);
  // v0.1 の雛形のまま手が入っていない利用者のファイルは、節を足すのではなく置き換える（重複を作らない）
  assert.equal(f("docs/requirements/README.md").status, "untouched");
  assert.equal(f("docs/requirements/README.md").action, "replace");
  assert.equal(f("docs/operations/development-and-testing.md").action, "append", "日付を埋めた文書は節だけ足す");

  const applied = init(dir, "update", "--apply", up.json.applicable.join(","));
  assert.equal(applied.status, 0, applied.stdout);
  assert.deepEqual(applied.json.errors, []);

  const claude = read(dir, "AGENTS.md");
  assert.equal(read(dir, "CLAUDE.md"), fs.readFileSync(path.join(TEMPLATES, "CLAUDE.md"), "utf8"), "CLAUDE.md は AGENTS.md を読み込む 1 行になる");
  assert.equal(exists(dir, ".claude/rules/docdd-kit.md"), false, "約束は AGENTS.md の中へ移る");
  assert.ok(claude.startsWith("# よみログ 開発ガイド"));
  assert.ok(claude.includes("<!-- docdd:tables:begin -->") && claude.includes("<!-- docdd:tables:end -->"));
  assert.doesNotMatch(claude, /^## 変更影響/m);
  assert.doesNotMatch(claude, /^## 規約/m);
  assert.match(claude, /^\| 型検査 \| `npm run typecheck` \|$/m, "記入済みの値は移る");
  assert.match(claude, /^\| 開発サーバー起動 \| \{\{開発サーバー起動\}\} \|$/m, "新しい行は未記入で足す");
  assert.match(claude, /^\| docs の検査 \| `node scripts\/check-doc-dates\.mjs && node scripts\/check-doc-refs\.mjs` \|$/m);
  assert.match(claude, /^## スキルへの追加指示$/m);
  assert.match(claude, /`\.docdd\/manifest\.json`/);
  assert.match(claude, /^## キット共通の約束（docdd）$/m, "約束は AGENTS.md の中にある");
  assert.ok(claude.includes(`<!-- docdd:rules:begin v${PLUGIN_VERSION}`) && claude.includes("<!-- docdd:rules:end -->"));
  assert.equal(read(dir, "scripts/check-doc-dates.mjs"), fs.readFileSync(path.join(TEMPLATES, "scripts/check-doc-dates.mjs"), "utf8"));
  const dev = read(dir, "docs/operations/development-and-testing.md");
  assert.match(dev, /^## 4\. テスト基盤が無いとき$/m);
  assert.match(dev, /^## 5\. 落とし穴$/m);
  assert.match(dev, /^## 6\. 変更履歴$/m);
  assert.ok(dev.includes(`| 更新日 | ${today()} |`), "節を足した文書の更新日を今日にする");
  assert.equal(read(dir, "docs/requirements/README.md"), fs.readFileSync(path.join(TEMPLATES, "docs/requirements/README.md"), "utf8"));
  assert.ok(JSON.parse(read(dir, "package.json")).scripts["check:doc-placeholders"]);
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).kitVersion, PLUGIN_VERSION);

  assert.notEqual(init(dir, "status").json.state, "legacy");
  stage(dir, applied.json.toStage);
  const refs = check(dir, "check-doc-refs");
  assert.equal(refs.status, 0, refs.stdout + refs.stderr);
  git(dir, ["commit", "-q", "-m", "chore: docdd キットを更新"]);
  const dates = check(dir, "check-doc-dates");
  assert.equal(dates.status, 0, dates.stdout + dates.stderr);

  const again = init(dir, "update");
  assert.deepEqual(again.json.applicable, [], JSON.stringify(again.json.summary));
});

test("導入の痕跡: 自前の tasks/BACKLOG.md や scripts/audit-check.mjs があるだけでは「途中まで導入済み」にしない", () => {
  const backlog = project({ files: { "tasks/BACKLOG.md": "# やること\n\n- ログイン画面\n" } });
  assert.equal(init(backlog, "status").json.state, "not-installed");
  const audit = project({ files: { "scripts/audit-check.mjs": "console.log('mine')\n" } });
  assert.equal(init(audit, "status").json.state, "not-installed");
});

test("サブフォルダで起動すると、上に docdd があれば installed-above と projectRoot を返し、何も置かない", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  fs.mkdirSync(path.join(dir, "src", "app"), { recursive: true });
  const sub = path.join(dir, "src", "app");
  const st = init(sub, "status");
  assert.equal(st.json.state, "installed-above");
  assert.equal(st.json.projectRoot, ".");
  assert.match(st.json.next, /開き直して/);
  assert.equal(init(sub, "update").json.state, "installed-above");
  // 上に導入があるときは、ここへ雛形も manifest も書かない（入れ子の導入を作らない）
  const refusedApply = init(sub, "apply", "--settings", "no");
  assert.equal(refusedApply.status, 2, refusedApply.stdout);
  assert.ok(!fs.existsSync(path.join(sub, ".docdd")), "サブフォルダに manifest を書いた");
  const refusedUpdate = init(sub, "update", "--apply", "CLAUDE.md");
  assert.equal(refusedUpdate.status, 2, refusedUpdate.stdout);
  assert.match(st.json.next, /git のルート/, "projectRoot が . のときは「git のルート」と書く");
});

test("起動したフォルダに tasks/BACKLOG.md と /docdd: を含む CLAUDE.md があれば、hook と同じく docdd とみなす（not-installed にしない）", () => {
  const dir = project({ files: { "tasks/BACKLOG.md": "# BACKLOG\n", "CLAUDE.md": "# 開発ガイド\n\n`/docdd:dev-loop` で進める。\n" } });
  assert.notEqual(init(dir, "status").json.state, "not-installed");
});

test("v0.1.4 から一部だけ update --apply しても v0.1 系の判定と AGENTS.md への移行は残り、apply は拒否する。<…> の未記入は {{…}} にし、できない箇所は報告する", (t) => {
  const files = v014Files();
  if (!files) {
    t.skip(`このリポジトリに ${V014}（v0.1.4）の履歴が無い（浅い clone）`);
    return;
  }
  // 利用者が 1 セルだけ書いた行（雛形と一致しないので置き換えず、報告に出す）
  files["docs/PRD.md"] = files["docs/PRD.md"].replace("| A-1 | <機能名> | <1行> | Must |", "| A-1 | <機能名> | <1行> | Must |\n| A-2 | 本を登録 | <1行> | Should |");
  const dir = project({ files, commit: true });

  const scripts = ["scripts/check-doc-dates.mjs", "scripts/check-doc-refs.mjs", "scripts/audit-check.mjs"];
  const part = init(dir, "update", "--apply", scripts.join(","));
  assert.equal(part.status, 0, part.stdout);
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).kitVersion, "0.1.1〜0.1.4", "移行が済むまで版を上げない");
  assert.equal(init(dir, "status").json.state, "legacy");

  const up = init(dir, "update");
  assert.equal(up.json.state, "legacy");
  assert.deepEqual(up.json.summary.migrate, ["AGENTS.md"]);
  assert.equal(up.json.installedVersion, "0.1.1〜0.1.4");
  assert.ok(up.json.files.find((f) => f.path === "docs/PRD.md").additions.some((a) => a.kind === "placeholder" && a.from === "| A-1 | <機能名> | <1行> | Must |"));

  const refused = init(dir, "apply", "--agents-md", "append");
  assert.equal(refused.status, 2);
  assert.match(refused.json.error, /update-kit/);
  assert.equal((read(dir, "CLAUDE.md").match(/^## 検証コマンド/gm) || []).length, 1, "表を二重に足さない");
  assert.equal(exists(dir, "AGENTS.md"), false, "移行を適用するまで AGENTS.md は作らない");

  const rest = init(dir, "update", "--apply", up.json.applicable.join(","));
  assert.equal(rest.status, 0, rest.stdout);
  assert.deepEqual(rest.json.errors, []);
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).kitVersion, PLUGIN_VERSION, "移行が済んだら新しい版");
  assert.equal((read(dir, "AGENTS.md").match(/^## 検証コマンド$/gm) || []).length, 1);
  assert.doesNotMatch(read(dir, "AGENTS.md"), /<使う道具に合わせて足す>/);
  assert.equal(read(dir, "CLAUDE.md"), fs.readFileSync(path.join(TEMPLATES, "CLAUDE.md"), "utf8"));

  const prd = read(dir, "docs/PRD.md");
  assert.match(prd, /^# PRD：\{\{プロダクト名\}\}$/m);
  assert.match(prd, /^\| A-1 \| \{\{機能名\}\} \| \{\{機能の説明1行\}\} \| Must \|$/m);
  assert.match(prd, /^- \{\{やらないこと（例: 複数人での共同編集）\}\}$/m);
  assert.doesNotMatch(prd, /<AI の月間上限>|<誰の・どんな困りごとを・どう解決するか>/);
  assert.deepEqual(
    rest.json.legacyPlaceholders.filter((p) => p.file === "docs/PRD.md"),
    [{ file: "docs/PRD.md", line: prd.split("\n").findIndex((l) => l.includes("本を登録")) + 1, token: "<1行>" }],
  );
  assert.equal(init(dir, "status").json.state === "legacy", false);
});

test("テスト基盤の導入: 完了条件に単体・E2E・表の行を含み、「テスト基盤の導入」で始まる未完了のタスクがあれば起票しない（done なら起票する）", () => {
  const dir = project({ files: { "package.json": '{\n  "name": "x"\n}\n' } });
  const a = init(dir, "apply", "--settings", "no", "--tasks", "test-infra");
  assert.equal(a.status, 0, a.stdout);
  const text = read(dir, "tasks/BACKLOG.md");
  assert.match(text, /^ {2}- 単体の見本テスト 1 件が緑/m);
  assert.match(text, /^ {2}- 画面があるなら、E2E（実際に動かす）の見本テストも 1 件緑$/m);
  assert.match(text, /^ {2}- AGENTS\.md「検証コマンド」表の該当行が埋まる（『単体・DBテスト』。画面があるなら『E2E（実際に動かす）』と『全検査（push 前に1回）』も）$/m);

  write(dir, { "tasks/BACKLOG.md": text.replace("### T-01: テスト基盤の導入 `todo`", "### T-01: テスト基盤の導入（E2E） `doing`") });
  const again = init(dir, "apply", "--settings", "no", "--tasks", "test-infra");
  assert.deepEqual(again.json.tasks, [{ kind: "test-infra", id: "T-01", title: "テスト基盤の導入（E2E）", action: "exists" }]);

  write(dir, { "tasks/BACKLOG.md": read(dir, "tasks/BACKLOG.md").replace("（E2E） `doing`", "（E2E） `done`") });
  const done = init(dir, "apply", "--settings", "no", "--tasks", "test-infra");
  assert.deepEqual(done.json.tasks.map((x) => [x.id, x.action]), [["T-02", "added"]]);
});

test("未記入の欄を埋め、従量課金が無いので PRD §4 を消すと、コミット後の state は installed", () => {
  const dir = project({ files: { "package.json": NPM_INIT_PACKAGE } });
  const a = init(dir, "apply", "--settings", "no", "--fill-inferred");
  assert.equal(a.status, 0, a.stdout);
  write(dir, { "docs/PRD.md": read(dir, "docs/PRD.md").replace(/^## 4\. 料金・上限（従量課金があるとき）\r?\n[\s\S]*?(?=^## )/m, "") });
  const ph = init(dir, "status").json.placeholders;
  assert.ok(!ph.some((p) => p.file === "docs/PRD.md" && /上限|数値|原価/.test(p.token)), JSON.stringify(ph));
  for (const p of ph.filter((x) => x.token !== "{{YYYY-MM-DD}}")) {
    const lines = read(dir, p.file).split("\n");
    lines[p.line - 1] = lines[p.line - 1].replace(p.token, "無い");
    write(dir, { [p.file]: lines.join("\n") });
  }
  stage(dir, a.json.toStage);
  const d = init(dir, "dates");
  stage(dir, d.json.toStage);
  git(dir, ["commit", "-q", "-m", "chore: docdd キットを導入"]);
  const left = check(dir, "check-doc-placeholders");
  assert.equal(left.status, 0, left.stdout + left.stderr);
  assert.equal(init(dir, "status").json.state, "installed");
});

test("dates: 前の日にコミットした文書を別の日に直すと更新日も今日にし、check-doc-dates が通る", () => {
  const dir = project({ files: { "package.json": '{\n  "name": "x"\n}\n' } });
  const a = init(dir, "apply", "--settings", "no");
  stage(dir, a.json.toStage);
  const yd = localDate(new Date(Date.now() - 86400000));
  const d1 = init(dir, "dates", "--date", yd);
  stage(dir, d1.json.toStage);
  execFileSync("git", ["commit", "-q", "-m", "day1"], { cwd: dir, env: { ...ENV, GIT_AUTHOR_DATE: `${yd}T10:00:00`, GIT_COMMITTER_DATE: `${yd}T10:00:00` } });
  assert.deepEqual(init(dir, "dates").json.changed, [], "中身を変えていなければ何もしない");

  write(dir, { "docs/PRD.md": read(dir, "docs/PRD.md").replace("{{プロダクト名}}", "よみログ") });
  const d2 = init(dir, "dates");
  assert.deepEqual(d2.json.changed, [{ file: "docs/PRD.md", count: 0, updatedDate: true }]);
  assert.ok(read(dir, "docs/PRD.md").includes(`| 更新日 | ${today()} |`));
  stage(dir, d2.json.toStage);
  git(dir, ["commit", "-q", "-m", "day2"]);
  const dates = check(dir, "check-doc-dates");
  assert.equal(dates.status, 0, dates.stdout + dates.stderr);
});

test(".gitignore: 先頭・末尾の / の違いは同じ行とみなし、否定の行を足した行の後ろに置いて .env.example を除外しない", () => {
  const original = "node_modules\n/dist\n.env*\n!.env.example\n";
  const dir = project({ files: { ".gitignore": original, ".env.example": "KEY=\n" } });
  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  const added = a.json.gitignore.addedLines;
  assert.ok(!added.includes("node_modules/") && !added.includes("dist/"), added.join(" "));
  assert.ok(added.indexOf("!.env.example") > added.indexOf(".env.*"), added.join(" "));
  const giLines = read(dir, ".gitignore").split("\n");
  assert.ok(giLines.lastIndexOf("!.env.example") > giLines.indexOf(".env.*"), "否定の行は足した .env.* より後ろ");
  assert.equal(spawnSync("git", ["check-ignore", "-q", "--", ".env.example"], { cwd: dir, env: ENV }).status, 1, ".env.example は除外されない");
  assert.equal(spawnSync("git", ["check-ignore", "-q", "--", ".env"], { cwd: dir, env: ENV }).status, 0);
  assert.equal(init(dir, "apply", "--settings", "no").json.gitignore.action, "unchanged");
});

test("package.json: audit:check は npm と package-lock.json のときだけ足す（pnpm には足さず理由を返す）", () => {
  const dir = project({ files: { "package.json": '{\n  "name": "p"\n}\n', "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" } });
  assert.ok(!init(dir, "status").json.packageJson.missingScripts.includes("audit:check"));
  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  assert.ok(!a.json.packageJson.added.includes("audit:check"), a.json.packageJson.added.join(" "));
  assert.equal(a.json.packageJson.skipped[0].name, "audit:check");
  assert.equal(JSON.parse(read(dir, "package.json")).scripts["audit:check"], undefined);
  assert.equal(init(dir, "update").json.files.find((f) => f.path === "package.json").action, "none");

  const dir2 = project({ files: { "package.json": '{\n  "name": "n"\n}\n', "package-lock.json": '{\n  "lockfileVersion": 3\n}\n' } });
  assert.ok(init(dir2, "apply", "--settings", "no").json.packageJson.added.includes("audit:check"));
});

test("CRLF の文書: apply --claude-md append と update --apply の追記で CRLF を保つ", () => {
  const dir = project({ files: { "CLAUDE.md": BUILTIN_CLAUDE_MD.replace(/\n/g, "\r\n"), "package.json": '{\n  "name": "x"\n}\n' } });
  const a = init(dir, "apply", "--claude-md", "append", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(bareLf(read(dir, "CLAUDE.md")), 0, "LF だけの行が混ざらない");

  const dev = read(dir, "docs/operations/development-and-testing.md").replace(/\r\n/g, "\n");
  write(dir, { "docs/operations/development-and-testing.md": dev.replace(/^## 5\. 落とし穴\n[\s\S]*?(?=^## 6\.)/m, "").replace(/\n/g, "\r\n") });
  const up = init(dir, "update");
  assert.equal(up.json.files.find((f) => f.path === "docs/operations/development-and-testing.md").action, "append");
  const ap = init(dir, "update", "--apply", "docs/operations/development-and-testing.md");
  assert.equal(ap.status, 0, ap.stdout);
  const after = read(dir, "docs/operations/development-and-testing.md");
  assert.match(after, /^## \d\. 落とし穴\r$/m);
  assert.equal(bareLf(after), 0);
});

test("apply: 置き場所がふさがっていれば何も書かず終了コード 2。既にある雛形と同じファイルは manifest に記録し、dates は manifest に無い文書も埋める", () => {
  const dir = project({ files: { tasks: "memo\n", "package.json": '{\n  "name": "x"\n}\n' } });
  const before = snapshot(dir);
  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 2, a.stdout);
  assert.equal(a.json.ok, false);
  assert.match(a.json.error, /tasks がフォルダではなくファイル/);
  assert.deepEqual(snapshot(dir), before, "何も書かない");
  fs.renameSync(path.join(dir, "tasks"), path.join(dir, "tasks.txt"));
  const b = init(dir, "apply", "--settings", "no");
  assert.equal(b.status, 0, b.stdout);

  const dir2 = project({ files: { "docs/PRD.md": fs.readFileSync(path.join(TEMPLATES, "docs/PRD.md")), "scripts/check-doc-refs.mjs": fs.readFileSync(path.join(TEMPLATES, "scripts/check-doc-refs.mjs")) } });
  assert.equal(init(dir2, "apply", "--settings", "no").status, 0);
  const man = JSON.parse(read(dir2, ".docdd/manifest.json"));
  assert.ok(man.files["docs/PRD.md"] && man.files["scripts/check-doc-refs.mjs"], Object.keys(man.files).join(" "));
  delete man.files["docs/PRD.md"];
  write(dir2, { ".docdd/manifest.json": `${JSON.stringify(man, null, 2)}\n` });
  const d = init(dir2, "dates");
  assert.ok(d.json.changed.some((x) => x.file === "docs/PRD.md"), JSON.stringify(d.json.changed));
  assert.ok(!read(dir2, "docs/PRD.md").includes("{{YYYY-MM-DD}}"));
});

test("apply: サンドボックスなどで .claude/settings.json を書けなくても、残りの雛形は置き切り notWritten で返す", { skip: process.platform === "win32" ? "Windows では chmod でフォルダへの書き込みを禁止できない" : process.getuid?.() === 0 ? "root では書き込み拒否を再現できない" : false }, () => {
  const dir = project({ files: { "package.json": '{\n  "name": "sandboxed"\n}\n' } });
  fs.mkdirSync(path.join(dir, ".claude/rules"), { recursive: true });
  fs.chmodSync(path.join(dir, ".claude"), 0o555);
  let a;
  try {
    a = init(dir, "apply", "--fill-inferred", "--settings", "yes");
  } finally {
    fs.chmodSync(path.join(dir, ".claude"), 0o755);
  }
  assert.equal(a.status, 0, a.stdout);
  assert.equal(a.json.ok, true);
  assert.deepEqual(a.json.notWritten.map((n) => n.path), [".claude/settings.json"]);
  assert.ok(["EACCES", "EPERM"].includes(a.json.notWritten[0].code), a.json.notWritten[0].code);
  assert.ok(JSON.parse(a.json.notWritten[0].content).permissions, "Claude が Write で置き直せる中身を返す");
  assert.equal(exists(dir, ".claude/settings.json"), false);
  for (const rel of ["AGENTS.md", "CLAUDE.md", "tasks/BACKLOG.md", "scripts/check-doc-refs.mjs", ".mcp.json", ".docdd/manifest.json"]) assert.ok(exists(dir, rel), `${rel} は置く`);
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).files[".claude/settings.json"], undefined, "置けなかったファイルは manifest に載せない");
  assert.ok(!a.json.toStage.includes(".claude/settings.json"));
  assert.ok(a.json.warnings.some((w) => w.includes(".claude/settings.json")));

  stage(dir, a.json.toStage);
  const refs = check(dir, "check-doc-refs");
  assert.equal(refs.status, 0, refs.stdout + refs.stderr);
});

test("dev が無い Web のプロジェクト: serve・start を開発サーバーとみなし、どちらも無ければ「無い」にせず未記入のまま聞く", () => {
  const devRow = (dir) => init(dir, "status").json.inferred.find((r) => r.row === "開発サーバー起動");
  const cra = project({ files: { "package.json": '{\n  "name": "cra",\n  "scripts": { "start": "react-scripts start", "build": "react-scripts build" },\n  "dependencies": { "react": "18.3.1", "react-scripts": "5.0.1" }\n}\n' } });
  assert.equal(devRow(cra).value, "npm start");
  const express = project({ files: { "package.json": '{\n  "name": "api",\n  "scripts": { "start": "node server.js" },\n  "dependencies": { "express": "4.21.0" }\n}\n' } });
  assert.equal(devRow(express).value, "npm start");
  const vue = project({ files: { "package.json": '{\n  "name": "vue-cli",\n  "scripts": { "serve": "vue-cli-service serve", "start": "node prod.js" },\n  "dependencies": { "vue": "3.5.0", "vite": "5.4.0" }\n}\n' } });
  assert.equal(devRow(vue).value, "npm run serve", "serve を start より先に使う");
  const bare = project({ files: { "package.json": '{\n  "name": "bare",\n  "dependencies": { "react": "18.3.1" }\n}\n' } });
  assert.equal(devRow(bare).value, null, "Web なのに dev・serve・start が無ければ聞く（「無い」にすると Web の門で止まる）");
  const cli = project({ files: { "package.json": '{\n  "name": "tool",\n  "scripts": { "build": "tsc" }\n}\n' } });
  assert.equal(devRow(cli).value, "無い", "Web のフレームワークが無い Node のプロジェクトは従来どおり「無い」");
});

test("v0.1.4 から AGENTS.md への移行だけを update --apply しても、manifest の kitVersion を null にしない（hook の案内を黙らせない）", (t) => {
  const files = v014Files();
  if (!files) {
    t.skip(`このリポジトリに ${V014}（v0.1.4）の履歴が無い（浅い clone）`);
    return;
  }
  for (const f of ["scripts/check-doc-dates.mjs", "scripts/check-doc-refs.mjs", "scripts/audit-check.mjs"]) files[f] = `${files[f]}\n// 手を入れた\n`;
  const dir = project({ files, commit: true });
  const part = init(dir, "update", "--apply", "AGENTS.md");
  assert.equal(part.status, 0, part.stdout);
  const kv = JSON.parse(read(dir, ".docdd/manifest.json")).kitVersion;
  assert.ok(kv, `kitVersion が空: ${kv}`);
  const notify = spawnSync(process.execPath, [path.join(ROOT, "plugins/docdd/scripts/notify-update.mjs")], {
    input: JSON.stringify({ cwd: dir }),
    encoding: "utf8",
    env: { ...ENV, CLAUDE_PLUGIN_ROOT: path.join(ROOT, "plugins/docdd"), CLAUDE_PROJECT_DIR: dir },
  });
  assert.match(notify.stdout, /\/docdd:update-kit/);
});

test("precommit: .env の判定は hook と同じ（.env.local.example は見本、.env.dist と .ENV は秘密）。直し方は git rm --cached で、外したあとは指摘しない", () => {
  const dir = project({ files: { ".gitignore": ".env\n.env.*\n!.env.example\n", ".env.local.example": "A=\n", ".env.dist": "A=1\n", ".ENV": "A=1\n" } });
  git(dir, ["add", "-f", "--", ".gitignore", ".env.local.example", ".env.dist", ".ENV"]);
  const r = init(dir, "precommit");
  const env = r.json.problems.filter((p) => p.code === "env-staged").map((p) => p.path).sort();
  assert.deepEqual(env, [".ENV", ".env.dist"]);
  assert.ok(r.json.problems.find((p) => p.path === ".env.dist").message.includes("git rm --cached .env.dist"));
  assert.ok(r.json.problems.find((p) => p.code === "env-staged").message.includes("git rm --cached"));
  git(dir, ["rm", "-q", "--cached", "--", ".env.dist", ".ENV"]);
  const again = init(dir, "precommit");
  assert.ok(!again.json.problems.some((p) => p.code === "env-staged"), JSON.stringify(again.json.problems));
});

test("precommit: i18n の auth.json などは注意に留め、playwright の保存形式だけを問題にする", () => {
  const dir = project({ files: { ".gitignore": ".env\n.env.*\n", "messages/ja/auth.json": "{}\n", "src/lib/auth-config.json": "{}\n", "e2e/user.auth-state.json": "{}\n" } });
  git(dir, ["add", "--", ".gitignore", "messages/ja/auth.json", "src/lib/auth-config.json"]);
  const a = init(dir, "precommit");
  assert.equal(a.status, 0, a.stdout);
  assert.deepEqual(a.json.warnings.map((w) => w.path).sort(), ["messages/ja/auth.json", "src/lib/auth-config.json"]);
  git(dir, ["add", "--", "e2e/user.auth-state.json"]);
  const b = init(dir, "precommit");
  assert.equal(b.status, 1);
  assert.deepEqual(b.json.problems.map((p) => `${p.code}:${p.path}`), ["auth-state-staged:e2e/user.auth-state.json"]);
});

test("既存の BACKLOG に書式の節が無い: status が返し、--add-backlog-sections で雛形の節を足す（中身は変えず、2 回目は変えない）", () => {
  const mine = "# 自分のバックログ\n\n- ログイン画面を作る\n- 一覧画面を作る\n";
  const dir = project({ files: { "tasks/BACKLOG.md": mine, "package.json": '{\n  "name": "x"\n}\n' } });
  const sections = ["運用ルール", "タスク", "要決定・外部準備（ユーザー作業）"];
  assert.deepEqual(init(dir, "status").json.backlog.missingSections, sections);
  assert.deepEqual(init(dir, "apply", "--settings", "no", "--dry-run").json.backlog, { missingSections: sections, added: [] });

  const a = init(dir, "apply", "--settings", "no", "--add-backlog-sections", "--tasks", "test-infra");
  assert.equal(a.status, 0, a.stdout);
  const text = read(dir, "tasks/BACKLOG.md");
  const at = (s) => text.indexOf(s);
  assert.ok(text.startsWith("# 自分のバックログ\n\n## 運用ルール\n"), text.slice(0, 80));
  assert.ok(at("## 運用ルール") < at("## タスク") && at("## タスク") < at("- ログイン画面を作る"), text);
  assert.ok(at("- 一覧画面を作る") < at("### T-01: テスト基盤の導入") && at("### T-01: テスト基盤の導入") < at("## 要決定・外部準備（ユーザー作業）"), text);
  assert.deepEqual(a.json.backlog.added, sections);
  assert.deepEqual(init(dir, "status").json.backlog.missingSections, []);

  const before = snapshot(dir);
  init(dir, "apply", "--settings", "no", "--add-backlog-sections", "--tasks", "test-infra");
  assert.deepEqual(snapshot(dir), before);
});

const UNITY_GITIGNORE = "/[Ll]ibrary/\n/[Tt]emp/\n/[Oo]bj/\n/[Bb]uild/\n/[Bb]uilds/\n/[Ll]ogs/\n/[Uu]ser[Ss]ettings/\n*.log\n.gradle/\n*.csproj\n*.sln\n";
const UNITY_VERSION_TXT = "m_EditorVersion: 6000.3.24f1\nm_EditorVersionWithRevision: 6000.3.24f1 (4e7b9b5b6244)\n";
const UNITY_WORKFLOW_MD = "# Unity workflow\n\n- Open the project in Unity Hub.\n- Run EditMode tests before pushing.\n";

test("Unity のプロジェクト: status は kind=unity・web=false で、ProjectVersion.txt を仕様書の候補に出さず、雛形の見本スクリプトを既存コードに数えない。apply は Web の行を「無い」にし、.gitignore には共通の塊だけを足す", () => {
  const dir = project({
    files: {
      "ProjectSettings/ProjectVersion.txt": UNITY_VERSION_TXT,
      "Packages/manifest.json": '{\n  "dependencies": {\n    "com.unity.test-framework": "1.6.0"\n  }\n}\n',
      ".gitignore": UNITY_GITIGNORE,
      "Assets/TutorialInfo/Scripts/Readme.cs": "using UnityEngine;\n\npublic class Readme : ScriptableObject\n{\n}\n",
      "Assets/TutorialInfo/Scripts/Editor/ReadmeEditor.cs": "using UnityEditor;\n\npublic class ReadmeEditor : Editor\n{\n}\n",
      "Assets/_Project/design-notes.md": "# Design notes\n\n- units\n- buildings\n",
      "docs/UNITY_WORKFLOW.md": UNITY_WORKFLOW_MD,
      "docs/game-design.txt": "RTS game design\n\n- two factions\n- cards\n",
      "docs/notes.txt": "misc\n\nline\nline\n",
    },
    commit: true,
  });
  git(dir, ["commit", "--allow-empty", "-q", "-m", "second"]);

  const st = init(dir, "status");
  assert.equal(st.status, 0, st.stderr);
  assert.equal(st.json.stack.kind, "unity");
  assert.equal(st.json.stack.web, false);
  assert.equal(st.json.stack.framework, "Unity 6000.3.24f1");
  assert.deepEqual(st.json.stack.unity, { editorVersion: "6000.3.24f1" });
  assert.equal(st.json.scaffold.present, true, "ProjectVersion.txt が土台の目印");
  assert.equal(st.json.git.commits, 2);
  assert.equal(st.json.existingCode, false, "Assets/TutorialInfo の見本スクリプトは数えない");
  assert.deepEqual(
    st.json.specCandidates.map((c) => c.path),
    ["docs/game-design.txt", "docs/UNITY_WORKFLOW.md"],
    "ProjectSettings・Assets の下と、ファイル名に仕様らしい語の無い .txt は候補にしない",
  );
  assert.match(st.json.next, /Web 以外のプロジェクトです。検証コマンドは一部しか推定できません。README『Web 以外のプロジェクトで使う』を見て埋め、必要なら『スキルへの追加指示』を書いてください/);
  const row = (name) => st.json.inferred.find((r) => r.row === name);
  for (const name of ["開発サーバー起動", "本番モード起動", "依存の脆弱性"]) assert.equal(row(name).value, "無い", name);
  for (const name of ["型検査", "lint"]) {
    assert.equal(row(name).value, "無い", name);
    assert.equal(row(name).source, "Unity には型検査・lint の標準のコマンドが無い（C# のコンパイルエラーは EditMode テストで出る）", name);
  }
  for (const name of ["単体・DBテスト", "E2E（実際に動かす）", "ビルド"]) {
    assert.equal(row(name).value, null, name);
    assert.match(row(name).source, /README『Web 以外のプロジェクトで使う』/, name);
  }
  assert.ok(!st.json.gitignore.missingLines.includes("node_modules/"), st.json.gitignore.missingLines.join(" "));

  const a = init(dir, "apply", "--fill-inferred", "--settings", "no", "--tasks", "test-infra");
  assert.equal(a.status, 0, a.stdout);
  assert.deepEqual(a.json.filled.map((f) => [f.row, f.cell]), [["開発サーバー起動", "無い"], ["型検査", "無い"], ["lint", "無い"], ["本番モード起動", "無い"], ["依存の脆弱性", "無い"]]);
  const claude = read(dir, "AGENTS.md");
  assert.match(claude, /^\| 開発サーバー起動 \| 無い \|$/m);
  assert.match(claude, /^\| 型検査 \| 無い \|$/m);
  assert.match(claude, /^\| lint \| 無い \|$/m);
  assert.match(claude, /^\| 本番モード起動 \| 無い \|$/m);
  assert.match(claude, /^\| 依存の脆弱性 \| 無い \|$/m);
  assert.match(claude, /^\| 単体・DBテスト \| \{\{単体・DBテスト\}\} \|$/m);
  assert.match(claude, /^\| E2E（実際に動かす） \| \{\{E2E\}\} \|$/m);
  const [common] = gitignoreTemplateBlocks();
  const gi = read(dir, ".gitignore");
  assert.equal(gi, `${UNITY_GITIGNORE}\n${[common.header, ...appendOrder(common.lines)].join("\n")}\n`);
  assert.doesNotMatch(gi, /node_modules|\.next|playwright|# docdd: Web/);
  assert.equal(read(dir, ".mcp.json"), '{\n  "mcpServers": {}\n}\n');
  assert.match(read(dir, "tasks/BACKLOG.md"), /^### T-01: テスト基盤の導入 `todo`$/m);

  stage(dir, a.json.toStage);
  const refs = check(dir, "check-doc-refs");
  assert.equal(refs.status, 0, refs.stdout + refs.stderr);
  const d = init(dir, "dates");
  stage(dir, d.json.toStage);
  assert.equal(init(dir, "precommit").json.ok, true);
  git(dir, ["commit", "-q", "-m", "chore: docdd キットを導入"]);
  assert.equal(git(dir, ["status", "--porcelain"]), "");

  // 2 回目の apply と update も、Web の塊を求めない
  assert.equal(init(dir, "apply", "--fill-inferred", "--settings", "no").json.gitignore.action, "unchanged");
  assert.equal(init(dir, "update").json.files.find((f) => f.path === ".gitignore").status, "current");

  // git の外（.gitignore が効かない）でも、Library・Temp の下は見ない
  const loose = project({
    withGit: false,
    files: {
      "ProjectSettings/ProjectVersion.txt": UNITY_VERSION_TXT,
      "Library/PackageCache/com.unity.test-framework/spec.md": "# spec\n\na\nb\n",
      "Temp/plan.md": "# plan\n\na\nb\n",
      "docs/UNITY_WORKFLOW.md": UNITY_WORKFLOW_MD,
    },
  });
  assert.deepEqual(init(loose, "status").json.specCandidates.map((c) => c.path), ["docs/UNITY_WORKFLOW.md"]);
});

test("Web のプロジェクト: status は kind=web・web=true。.gitignore は、新しく置くときは雛形のまま、既存に足すときも共通と Web の両方の塊", () => {
  const pkg = '{\n  "name": "web",\n  "scripts": { "dev": "next dev" },\n  "dependencies": { "next": "15.0.0", "react": "19.0.0" }\n}\n';
  const dir = project({ files: { "package.json": pkg } });
  const st = init(dir, "status");
  assert.equal(st.status, 0, st.stderr);
  assert.deepEqual([st.json.stack.kind, st.json.stack.web, st.json.stack.unity, st.json.stack.framework], ["web", true, null, "Next.js"]);
  assert.doesNotMatch(st.json.next, /Web 以外/);
  assert.equal(st.json.inferred.find((r) => r.row === "開発サーバー起動").cell, "`npm run dev`（http://127.0.0.1:3000 で開く）");

  const a = init(dir, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  const [common0, web0] = gitignoreTemplateBlocks();
  assert.equal(read(dir, ".gitignore"), gitignoreText([common0, web0]), "Python を検出していないので Python の塊は置かない");
  assert.deepEqual(a.json.gitignore.addedLines, [...common0.lines, ...web0.lines]);

  const dir2 = project({ files: { "package.json": pkg, ".gitignore": "node_modules\n" } });
  const b = init(dir2, "apply", "--settings", "no");
  assert.equal(b.status, 0, b.stdout);
  const [common, web] = gitignoreTemplateBlocks();
  assert.equal(
    read(dir2, ".gitignore"),
    `node_modules\n\n${[common.header, ...appendOrder(common.lines)].join("\n")}\n\n${[web.header, ...web.lines.filter((l) => l !== "node_modules/")].join("\n")}\n`,
  );
});

test("前の版の行名「E2E（実ブラウザ）」の AGENTS.md も読む: --fill-inferred は行名を変えずに埋め、update は E2E の行を足さない", () => {
  const oldClaude = fs.readFileSync(path.join(TEMPLATES, "AGENTS.md"), "utf8").replace("| E2E（実際に動かす） | {{E2E}} |", "| E2E（実ブラウザ） | {{E2E}} |");
  assert.ok(oldClaude.includes("| E2E（実ブラウザ） | {{E2E}} |"), "雛形の行名が変わっていない");
  const pkg = '{\n  "name": "web",\n  "scripts": { "dev": "vite", "test:e2e": "playwright test" },\n  "devDependencies": { "vite": "5.0.0" }\n}\n';
  const dir = project({ files: { "AGENTS.md": oldClaude, "package.json": pkg } });

  const a = init(dir, "apply", "--fill-inferred", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(a.json.agentsMd.action, "unchanged");
  const claude = read(dir, "AGENTS.md");
  assert.match(claude, /^\| E2E（実ブラウザ） \| `npm run test:e2e` \|$/m);
  assert.doesNotMatch(claude, /^\| E2E（実際に動かす） \|/m, "表の行名は変えない");
  assert.ok(a.json.filled.some((f) => f.row === "E2E（実ブラウザ）" && f.cell === "`npm run test:e2e`"), JSON.stringify(a.json.filled));

  const up = init(dir, "update");
  assert.equal(up.status, 0, up.stdout);
  const additions = up.json.files.find((f) => f.path === "AGENTS.md").additions ?? [];
  assert.ok(!additions.some((x) => x.kind === "row" && /E2E/.test(x.row)), JSON.stringify(additions));
});

test("Web 以外の種類: Godot・Flutter・Android・Apple・.NET は web=false（Godot は依存の脆弱性も「無い」、.gitignore が無ければ共通の塊だけを置く）。Web の依存もあれば web=true、目印が無ければ null", () => {
  const cases = [
    { kind: "godot", framework: "Godot", audit: "無い", files: { "project.godot": 'config_version=5\n\n[application]\nconfig/name="Demo"\n' } },
    { kind: "flutter", framework: "Flutter", audit: null, files: { "pubspec.yaml": "name: demo\ndependencies:\n  flutter:\n    sdk: flutter\n" } },
    {
      kind: "android",
      framework: "Android",
      audit: null,
      files: { "settings.gradle.kts": 'pluginManagement {\n    repositories {\n        google {\n            content {\n                includeGroupByRegex("com\\\\.android.*")\n            }\n        }\n    }\n}\n' },
    },
    { kind: "apple", framework: "Xcode", audit: null, files: { "Demo.xcodeproj/project.pbxproj": "// !$*UTF8*$!\n" } },
    { kind: "dotnet", framework: ".NET", audit: null, files: { "Demo.sln": "\nMicrosoft Visual Studio Solution File, Format Version 12.00\n" } },
  ];
  for (const c of cases) {
    const st = init(project({ files: c.files }), "status");
    assert.equal(st.status, 0, st.stderr);
    const { stack } = st.json;
    assert.deepEqual([stack.kind, stack.web, stack.framework, stack.unity], [c.kind, false, c.framework, null], c.kind);
    assert.equal(st.json.scaffold.present, true, c.kind);
    const row = (name) => st.json.inferred.find((r) => r.row === name);
    assert.equal(row("開発サーバー起動").value, "無い", c.kind);
    assert.equal(row("本番モード起動").value, "無い", c.kind);
    assert.equal(row("依存の脆弱性").value, c.audit, c.kind);
    assert.equal(row("型検査").value, null, `${c.kind}: 型検査・lint を「無い」と決めるのは Unity だけ`);
    assert.equal(row("lint").value, null, c.kind);
  }

  const godot = project({ files: cases[0].files });
  assert.equal(init(godot, "apply", "--settings", "no").status, 0);
  const [common] = gitignoreTemplateBlocks();
  assert.equal(read(godot, ".gitignore"), `${[common.header, ...common.lines].join("\n")}\n`);
  assert.equal(init(godot, "update").json.files.find((f) => f.path === ".gitignore").status, "current");

  const both = init(project({ files: { ...cases[0].files, "package.json": '{\n  "name": "tool",\n  "devDependencies": { "vite": "5.0.0" }\n}\n' } }), "status").json.stack;
  assert.deepEqual([both.kind, both.web, both.framework], ["web", true, "Vite"]);
  assert.ok(both.frameworks.includes("Godot"), both.frameworks.join(" "));
  const none = init(project({ files: { "pubspec.yaml": "name: pkg\n" } }), "status").json.stack;
  assert.deepEqual([none.kind, none.web], ["unknown", null]);
});

test("既存コードの判定: Godot の .gd・Flutter の .dart・C/C++ も数える。Godot の addons/（プラグイン）と、Flutter の android/・ios/ などの土台は数えない", () => {
  const many = (dir, ext, n, body) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${dir}/f${i + 1}.${ext}`, body]));
  const godot = project({
    files: {
      "project.godot": 'config_version=5\n\n[application]\nconfig/name="Demo"\n',
      ...many("scripts", "gd", 10, "extends Node\n"),
      "src/player.cpp": '#include "player.h"\n',
      "src/player.h": "#pragma once\n",
      ...many("addons/dialog", "gd", 20, "@tool\nextends EditorPlugin\n"),
    },
    commit: true,
  });
  const g = init(godot, "status");
  assert.equal(g.status, 0, g.stderr);
  assert.deepEqual([g.json.stack.kind, g.json.git.commits, g.json.scaffold.sourceFileCount, g.json.existingCode], ["godot", 1, 12, true]);

  const runner = {
    "android/app/src/main/kotlin/com/example/demo/MainActivity.kt": "package com.example.demo\n",
    "ios/Runner/AppDelegate.swift": "import Flutter\n",
    "ios/Runner/Runner-Bridging-Header.h": '#import "GeneratedPluginRegistrant.h"\n',
    "ios/RunnerTests/RunnerTests.swift": "import XCTest\n",
    "linux/runner/main.cc": '#include "my_application.h"\n',
    "linux/runner/my_application.cc": '#include "my_application.h"\n',
    "linux/runner/my_application.h": "#pragma once\n",
    "macos/Runner/AppDelegate.swift": "import Cocoa\n",
    "macos/Runner/MainFlutterWindow.swift": "import Cocoa\n",
    "web/index.html": "<!DOCTYPE html>\n",
    "windows/runner/main.cpp": '#include "flutter_window.h"\n',
    "windows/runner/flutter_window.cpp": '#include "flutter_window.h"\n',
    "windows/runner/flutter_window.h": "#pragma once\n",
    "windows/runner/utils.cpp": '#include "utils.h"\n',
  };
  const flutter = project({
    files: {
      "pubspec.yaml": "name: demo\ndependencies:\n  flutter:\n    sdk: flutter\n",
      "lib/main.dart": "void main() {}\n",
      "test/widget_test.dart": "void main() {}\n",
      ...runner,
    },
    commit: true,
  });
  const f1 = init(flutter, "status");
  assert.equal(f1.status, 0, f1.stderr);
  assert.deepEqual([f1.json.stack.kind, f1.json.scaffold.sourceFileCount, f1.json.existingCode], ["flutter", 2, false], "flutter create の土台だけでは既存コードありにしない");
  git(flutter, ["commit", "--allow-empty", "-q", "-m", "second"]);
  assert.equal(init(flutter, "status").json.existingCode, true, "lib/ の .dart があり、コミットが 2 つ以上");

  // addons/ を数えないのは Godot のときだけ
  const other = init(project({ files: { "addons/sale/models.py": "x = 1\n", "web/app.cpp": "int main() {}\n" } }), "status").json;
  assert.deepEqual([other.stack.kind, other.scaffold.sourceFileCount], ["unknown", 2]);
});

test("依存の脆弱性の推定: npm 以外も本番の依存だけを high 以上で調べる（yarn v2 以上は依存の依存まで）", () => {
  const pkg = (extra = "") => `{\n  "name": "a"${extra}\n}\n`;
  const berry = "yarn npm audit --recursive --severity high --environment production";
  const cases = [
    { name: "npm", files: { "package.json": pkg(), "package-lock.json": '{\n  "lockfileVersion": 3\n}\n' }, cmd: "node scripts/audit-check.mjs" },
    { name: "pnpm", files: { "package.json": pkg(), "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" }, cmd: "pnpm audit --audit-level=high --prod" },
    { name: "yarn v1", files: { "package.json": pkg(), "yarn.lock": "# yarn lockfile v1\n" }, cmd: "yarn audit --level high --groups dependencies" },
    { name: "yarn v4（.yarnrc.yml）", files: { "package.json": pkg(), "yarn.lock": "__metadata:\n  version: 8\n", ".yarnrc.yml": "nodeLinker: node-modules\n" }, cmd: berry },
    { name: "yarn v4（packageManager）", files: { "package.json": pkg(',\n  "packageManager": "yarn@4.18.0"'), "yarn.lock": "__metadata:\n  version: 8\n" }, cmd: berry },
    // .yarnrc.yml も packageManager も無いときは、yarn.lock の形（v2 以上は __metadata: の塊）で見分ける
    {
      name: "yarn v4（yarn.lock だけ）",
      files: { "package.json": pkg(), "yarn.lock": '# This file is generated by running "yarn install" inside your project.\n# Manual changes might be lost - proceed with caution!\n\n__metadata:\n  version: 10\n  cacheKey: 10c0\n' },
      cmd: berry,
    },
    { name: "yarn v1（lockfile v1 の見出し）", files: { "package.json": pkg(), "yarn.lock": "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.\n# yarn lockfile v1\n\n\nms@2.1.3:\n  version \"2.1.3\"\n" }, cmd: "yarn audit --level high --groups dependencies" },
    { name: "bun", files: { "package.json": pkg(), "bun.lock": "{}\n" }, cmd: "bun audit --audit-level=high --prod" },
  ];
  for (const c of cases) {
    const st = init(project({ files: c.files }), "status");
    assert.equal(st.status, 0, st.stderr);
    assert.equal(st.json.inferred.find((r) => r.row === "依存の脆弱性").value, c.cmd, c.name);
  }
  const dir = project({ files: cases[3].files });
  const a = init(dir, "apply", "--fill-inferred", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  assert.match(read(dir, "AGENTS.md"), /^\| 依存の脆弱性 \| `yarn npm audit --recursive --severity high --environment production` \|$/m);
});

// create-vite（2026-09 の latest）の react-ts・vue-ts が置く中身。tsconfig.json は中身を references の先に任せる形
const VITE_REACT_PACKAGE = `{
  "name": "vite-react",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "oxlint": "^1.81.0",
    "typescript": "~6.0.2",
    "vite": "^8.3.0"
  }
}
`;
const VITE_VUE_PACKAGE = `{
  "name": "vite-vue",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.5.42"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@vitejs/plugin-vue": "^6.0.8",
    "@vue/tsconfig": "^0.9.1",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vue-tsc": "^3.3.11"
  }
}
`;
const VITE_TSCONFIG = `{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
`;
const VITE_REACT_TSCONFIG_APP = `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
`;
const VITE_VUE_TSCONFIG_APP = `{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
`;
const VITE_TSCONFIG_NODE = `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
`;
// @vue/tsconfig 0.9.1 の 2 本を縮めたもの（// のコメント・文字列の中の //・末尾のカンマを含む）
const VUE_TSCONFIG_PACKAGE = {
  "node_modules/@vue/tsconfig/tsconfig.dom.json": `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": [
      // Target ES2022 to align with Vite.
      // <https://vite.dev/config/build-options.html#build-target>
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "types": []
  }
}
`,
  "node_modules/@vue/tsconfig/tsconfig.json": `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    // Most non-library projects don't need to emit declarations.
    "noEmit": true,
    "module": "ESNext",
    "skipLibCheck": true,
  }
}
`,
};

test("Vite の TypeScript（create-vite の react-ts・vue-ts）: tsconfig.json が references の形なら、型検査は build と同じ tsc -b（JS を書き出さないときだけ）、本番モード起動は build と preview", () => {
  const rowOf = (dir, name) => init(dir, "status").json.inferred.find((r) => r.row === name);
  const reactFiles = { "package.json": VITE_REACT_PACKAGE, "tsconfig.json": VITE_TSCONFIG, "tsconfig.app.json": VITE_REACT_TSCONFIG_APP, "tsconfig.node.json": VITE_TSCONFIG_NODE };

  const react = project({ files: reactFiles });
  const st = init(react, "status");
  assert.equal(st.status, 0, st.stderr);
  const row = (name) => st.json.inferred.find((r) => r.row === name);
  assert.equal(row("型検査").value, "npx tsc -b", row("型検査").source);
  assert.match(row("型検査").source, /references の形で、scripts\.build が tsc -b を使う/);
  assert.equal(row("本番モード起動").value, "npm run build && npm run preview", row("本番モード起動").source);
  assert.equal(row("本番モード起動").cell, "`npm run build && npm run preview`（http://localhost:4173 で開く）");
  assert.equal(row("全検査（push 前に1回）").value, "npx tsc -b && npm run lint && npm run build");
  const a = init(react, "apply", "--fill-inferred", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  const claude = read(react, "AGENTS.md");
  assert.match(claude, /^\| 型検査 \| `npx tsc -b` \|$/m);
  assert.match(claude, /^\| 本番モード起動 \| `npm run build && npm run preview`（http:\/\/localhost:4173 で開く） \|$/m);

  // パッケージマネージャに合わせる
  const pnpm = init(project({ files: { ...reactFiles, "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" } }), "status").json.inferred;
  assert.deepEqual(
    ["型検査", "本番モード起動"].map((n) => pnpm.find((r) => r.row === n).value),
    ["pnpm exec tsc -b", "pnpm build && pnpm preview"],
  );

  // 参照先が JS を書き出す（noEmit も emitDeclarationOnly も無い）なら推定しない。emitDeclarationOnly なら書き出さない
  const emitting = rowOf(project({ files: { ...reactFiles, "tsconfig.app.json": VITE_REACT_TSCONFIG_APP.replace('"noEmit": true,', "") } }), "型検査");
  assert.equal(emitting.value, null);
  assert.match(emitting.source, /JS を書き出す/);
  const declOnly = { ...reactFiles, "tsconfig.app.json": VITE_REACT_TSCONFIG_APP.replace('"noEmit": true,', '"declaration": true,\n    "emitDeclarationOnly": true,') };
  assert.equal(rowOf(project({ files: declOnly }), "型検査").value, "npx tsc -b");
  // references がフォルダを指す形（その下の tsconfig.json）も同じ
  const dirRef = {
    "package.json": VITE_REACT_PACKAGE,
    "tsconfig.json": '{\n  "files": [],\n  "references": [{ "path": "./app" }]\n}\n',
    "app/tsconfig.json": '{\n  "compilerOptions": { "noEmit": true },\n  "include": ["src"]\n}\n',
  };
  assert.equal(rowOf(project({ files: dirRef }), "型検査").value, "npx tsc -b");

  // build に tsc -b が無い references の形は、tsc --noEmit にしない（1 ファイルも調べずに成功するため）
  const viteOnly = rowOf(project({ files: { ...reactFiles, "package.json": VITE_REACT_PACKAGE.replace('"tsc -b && vite build"', '"vite build"') } }), "型検査");
  assert.equal(viteOnly.value, null);
  assert.match(viteOnly.source, /tsc --noEmit では何も調べない/);

  // include の形（Next.js など）は今までどおり
  const include = { "package.json": '{\n  "name": "n",\n  "devDependencies": { "typescript": "5.9.3" }\n}\n', "tsconfig.json": '{\n  "compilerOptions": { "noEmit": true },\n  "include": ["**/*.ts"]\n}\n' };
  assert.equal(rowOf(project({ files: include }), "型検査").value, "npx tsc --noEmit");

  // vue-ts: noEmit は extends の先（@vue/tsconfig）にある。node_modules が無いと確かめられないので推定しない
  const vueFiles = { "package.json": VITE_VUE_PACKAGE, "tsconfig.json": VITE_TSCONFIG, "tsconfig.app.json": VITE_VUE_TSCONFIG_APP, "tsconfig.node.json": VITE_TSCONFIG_NODE };
  const bare = rowOf(project({ files: vueFiles }), "型検査");
  assert.equal(bare.value, null);
  assert.match(bare.source, /extends の先/);
  const vue = init(project({ files: { ...vueFiles, ...VUE_TSCONFIG_PACKAGE } }), "status").json.inferred;
  assert.deepEqual(
    ["型検査", "本番モード起動", "全検査（push 前に1回）"].map((n) => vue.find((r) => r.row === n).value),
    ["npx vue-tsc -b", "npm run build && npm run preview", "npx vue-tsc -b && npm run build"],
  );

  // start があれば start。依存に vite が無ければ preview を本番モード起動とみなさない
  const withStart = { "package.json": '{\n  "name": "s",\n  "scripts": { "build": "vite build", "start": "node server.js", "preview": "vite preview" },\n  "devDependencies": { "vite": "8.3.0" }\n}\n' };
  assert.equal(rowOf(project({ files: withStart }), "本番モード起動").value, "npm run build && npm start");
  const noVite = { "package.json": '{\n  "name": "p",\n  "scripts": { "build": "node build.js", "preview": "node preview.js" }\n}\n' };
  assert.equal(rowOf(project({ files: noVite }), "本番モード起動").value, "無い");
});

test("開くアドレス: Vite・SvelteKit・Astro・Nuxt は localhost（既定で localhost だけで待つ）、Next.js は 127.0.0.1。ポートは scripts の --port を優先", () => {
  const cells = (pkgJson) => {
    const inferred = init(project({ files: { "package.json": pkgJson } }), "status").json.inferred;
    return ["開発サーバー起動", "本番モード起動"].map((n) => inferred.find((r) => r.row === n).cell);
  };
  assert.deepEqual(cells('{\n  "name": "q",\n  "scripts": { "dev": "vite --port 3001", "build": "vite build", "preview": "vite preview --port 8080" },\n  "devDependencies": { "vite": "8.3.0" }\n}\n'), [
    "`npm run dev`（http://localhost:3001 で開く）",
    "`npm run build && npm run preview`（http://localhost:8080 で開く）",
  ]);
  assert.deepEqual(cells('{\n  "name": "k",\n  "scripts": { "dev": "vite dev", "build": "vite build", "preview": "vite preview" },\n  "devDependencies": { "@sveltejs/kit": "2.0.0", "vite": "8.3.0" }\n}\n'), [
    "`npm run dev`（http://localhost:5173 で開く）",
    "`npm run build && npm run preview`（http://localhost:4173 で開く）",
  ]);
  assert.equal(cells('{\n  "name": "a",\n  "scripts": { "dev": "astro dev", "build": "astro build" },\n  "dependencies": { "astro": "7.3.2" }\n}\n')[0], "`npm run dev`（http://localhost:4321 で開く）");
  assert.equal(cells('{\n  "name": "x",\n  "scripts": { "dev": "nuxt dev", "build": "nuxt build" },\n  "dependencies": { "nuxt": "4.5.2" }\n}\n')[0], "`npm run dev`（http://localhost:3000 で開く）");
  // Next.js は vite を併せて持っていても 127.0.0.1。start にはアドレスを添えない（今までどおり）
  assert.deepEqual(cells('{\n  "name": "n",\n  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },\n  "dependencies": { "next": "15.0.0" },\n  "devDependencies": { "vite": "8.3.0" }\n}\n'), [
    "`npm run dev`（http://127.0.0.1:3000 で開く）",
    "`npm run build && npm start`",
  ]);
});

test("Python のプロジェクト: .gitignore に「# docdd: Python」の塊も使う（Web の Python は Web の塊も）。Python でなければ使わない", () => {
  const blocks = gitignoreTemplateBlocks();
  const [common, web] = blocks;
  const python = blocks.find((b) => b.header === "# docdd: Python");
  assert.deepEqual(python.lines, ["__pycache__/", "*.py[cod]", ".venv/", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/", ".coverage", "htmlcov/"]);

  // FastAPI: 共通・Web・Python の順に置き、__pycache__ が git status に出ない
  const fastapi = project({ files: { "pyproject.toml": '[project]\nname = "api"\ndependencies = ["fastapi>=0.115"]\n', "app/main.py": "from fastapi import FastAPI\n\napp = FastAPI()\n" } });
  const st = init(fastapi, "status");
  assert.equal(st.status, 0, st.stderr);
  assert.deepEqual([st.json.stack.web, st.json.stack.languages.includes("Python")], [true, true]);
  assert.deepEqual(st.json.gitignore.missingLines, [...common.lines, ...web.lines, ...python.lines]);
  const a = init(fastapi, "apply", "--settings", "no");
  assert.equal(a.status, 0, a.stdout);
  assert.equal(read(fastapi, ".gitignore"), gitignoreText([common, web, python]));
  write(fastapi, { "app/__pycache__/main.cpython-314.pyc": "x" });
  assert.equal(spawnSync("git", ["check-ignore", "-q", "--", "app/__pycache__/main.cpython-314.pyc"], { cwd: fastapi, env: ENV }).status, 0);
  assert.equal(init(fastapi, "update").json.files.find((f) => f.path === ".gitignore").status, "current");

  // 既存の .gitignore に Python の行が一部あれば、足りない行だけを「# docdd: Python」の見出しごと末尾に足す
  const py = project({ files: { ".gitignore": "__pycache__/\n.venv\n", "requirements.txt": "flask==3.1.0\n" } });
  const b = init(py, "apply", "--settings", "no");
  assert.equal(b.status, 0, b.stdout);
  const added = b.json.gitignore.addedLines;
  assert.ok(added.includes("*.py[cod]") && !added.includes("__pycache__/") && !added.includes(".venv/"), added.join(" "));
  assert.ok(read(py, ".gitignore").endsWith("\n\n# docdd: Python\n*.py[cod]\n.pytest_cache/\n.mypy_cache/\n.ruff_cache/\n.coverage\nhtmlcov/\n"), read(py, ".gitignore"));
  assert.equal(init(py, "apply", "--settings", "no").json.gitignore.action, "unchanged");

  // Python でなければ使わない
  const node = init(project({ files: { "package.json": NPM_INIT_PACKAGE } }), "status").json;
  assert.ok(!node.gitignore.missingLines.some((l) => python.lines.includes(l)), node.gitignore.missingLines.join(" "));
});

/** v0.13.2 の雛形で導入し、init が埋めたあとの姿に近づけたファイル一式。タグ（docdd--v0.13.2）が無ければ null。 */
function v0132Files() {
  const has = spawnSync("git", ["-C", ROOT, "cat-file", "-e", `${V0132}^{commit}`], { env: ENV });
  if (has.status !== 0) return null;
  const files = {};
  for (const f of git(ROOT, ["ls-tree", "-r", "--name-only", V0132, "plugins/docdd/templates"]).split("\n").filter(Boolean)) {
    const rel = f.replace("plugins/docdd/templates/", "");
    if (rel === "package.scripts.json") continue;
    files[rel] = execFileSync("git", ["-C", ROOT, "show", `${V0132}:${f}`], { env: ENV });
  }
  files["CLAUDE.md"] = files["CLAUDE.md"]
    .toString("utf8")
    .replace("{{プロジェクト名}}", "よみログ")
    .replace("| 型検査 | {{型検査}} |", "| 型検査 | `npm run typecheck` |");
  files["package.json"] = '{\n  "name": "yomi",\n  "scripts": { "check:doc-dates": "node scripts/check-doc-dates.mjs" }\n}\n';
  return files;
}

test("v0.13.2 のプロジェクト: update は CLAUDE.md と約束を AGENTS.md へまとめ、CLAUDE.md は読み込む 1 行になる", (t) => {
  const files = v0132Files();
  if (!files) {
    t.skip(`このリポジトリに ${V0132} のタグが無い（浅い clone）`);
    return;
  }
  const dir = project({ files, commit: true });

  const up = init(dir, "update");
  assert.equal(up.status, 0, up.stdout);
  assert.deepEqual(up.json.summary.migrate, ["AGENTS.md"]);
  const agents = up.json.files.find((f) => f.path === "AGENTS.md");
  assert.equal(agents.status, "legacy");
  assert.equal(up.json.files.find((f) => f.path === "CLAUDE.md").action, "none", "移行が CLAUDE.md も一緒に書き換える");

  const applied = init(dir, "update", "--apply", "AGENTS.md");
  assert.equal(applied.status, 0, applied.stdout);
  assert.deepEqual(applied.json.errors, []);
  const text = read(dir, "AGENTS.md");
  assert.ok(text.startsWith("# よみログ 開発ガイド"));
  assert.match(text, /^\| 型検査 \| `npm run typecheck` \|$/m, "記入済みの値は移る");
  assert.match(text, /^## キット共通の約束（docdd）$/m);
  assert.ok(text.includes(`<!-- docdd:rules:begin v${PLUGIN_VERSION}`) && text.includes("<!-- docdd:rules:end -->"));
  assert.doesNotMatch(text, /`\.claude\/rules\/docdd-kit\.md`/, "無くなったファイルを指さない");
  assert.equal(read(dir, "CLAUDE.md"), fs.readFileSync(path.join(TEMPLATES, "CLAUDE.md"), "utf8"));
  assert.equal(exists(dir, ".claude/rules/docdd-kit.md"), false);
  assert.equal(JSON.parse(read(dir, ".docdd/manifest.json")).files[".claude/rules/docdd-kit.md"], undefined, "消したファイルは manifest から外す");

  assert.ok(applied.json.toStage.includes("docs/README.md"), "言い換えた文書も stage に出す");
  stage(dir, applied.json.toStage);
  assert.doesNotMatch(read(dir, "docs/README.md"), /\.claude\/rules\/docdd-kit\.md/, "文書の参照も言い換える");

  const rest = init(dir, "update");
  assert.ok(!rest.json.applicable.includes("AGENTS.md"), JSON.stringify(rest.json.applicable));
  assert.ok(!rest.json.applicable.includes("CLAUDE.md"), JSON.stringify(rest.json.applicable));
  const refs = check(dir, "check-doc-refs");
  assert.equal(refs.status, 0, refs.stdout + refs.stderr);
});

test("導入済みのプロジェクトで CLAUDE.md を自分で書き換えたら、update は消さずに @AGENTS.md の 1 行だけ足す", () => {
  const dir = project({ files: { "package.json": '{\n  "name": "x"\n}\n' } });
  assert.equal(init(dir, "apply", "--settings", "no").status, 0);
  write(dir, { "CLAUDE.md": "# わたしのメモ\n\n好きに書いた。\n" });

  const up = init(dir, "update");
  const e = up.json.files.find((f) => f.path === "CLAUDE.md");
  assert.equal(e.action, "append");
  const applied = init(dir, "update", "--apply", "CLAUDE.md");
  assert.equal(applied.status, 0, applied.stdout);
  const text = read(dir, "CLAUDE.md");
  assert.ok(text.startsWith("# わたしのメモ"), text);
  assert.ok(text.includes("@AGENTS.md"), text);
  assert.equal(init(dir, "update").json.files.find((f) => f.path === "CLAUDE.md").action, "none", "二重に足さない");
});
