// 配布リポジトリの道具（scripts/check-version-bump.mjs・scripts/check-urls.mjs）のテスト。依存なし・Node 18 以上・通信しない。
//
//   node --test tests/repo-scripts.test.mjs
//
// check-version-bump: 使い捨ての git リポジトリを os.tmpdir() に作り、スクリプトをその scripts/ に写して実行する
// （スクリプトは、自分の置き場所の 1 つ上をリポジトリの根として読む）。
// check-urls: URL の取り出しと、対象のファイルの集め方だけを確かめる（通信する部分は呼ばない）。
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUMP = path.join(ROOT, "scripts", "check-version-bump.mjs");
const URLS = path.join(ROOT, "scripts", "check-urls.mjs");

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" };
for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_AUTHOR_DATE", "GIT_COMMITTER_DATE", "GIT_CEILING_DIRECTORIES"]) delete ENV[key];

const made = [];
process.on("exit", () => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

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

const pluginJson = (version) => `${JSON.stringify({ name: "docdd", version }, null, 2)}\n`;

function commitAll(dir, message) {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", message]);
}

function copyScript(dir) {
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(BUMP, path.join(dir, "scripts", "check-version-bump.mjs"));
}

/** 配布リポジトリの形を小さく作ってコミットし、tag があればタグを付ける。scripts/ にスクリプトを写す（git には入れない）。 */
function makeRepo({ version = "0.3.0", tag = "docdd--v0.3.0" } = {}) {
  const dir = tempDir("docdd-bump-");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.name", "docdd test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  git(dir, ["config", "tag.gpgsign", "false"]);
  write(dir, {
    "README.md": "# repo\n",
    ".gitignore": "scripts/\nplugins/docdd/evals/results/\n",
    "plugins/docdd/.claude-plugin/plugin.json": pluginJson(version),
    "plugins/docdd/README.md": "# docdd\n",
    "plugins/docdd/CHANGELOG.md": `## ${version}\n`,
    "plugins/docdd/skills/dev-loop/SKILL.md": "---\nname: dev-loop\n---\n",
    "plugins/docdd/evals/dev-loop-all-blocked/prompt.md": "/docdd:dev-loop\n",
  });
  commitAll(dir, "first");
  if (tag) git(dir, ["tag", tag]);
  copyScript(dir);
  return dir;
}

function runBump(dir, env = ENV) {
  const r = spawnSync(process.execPath, [path.join(dir, "scripts", "check-version-bump.mjs")], { cwd: dir, env, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` };
}

test("check-version-bump: 版を上げずに plugins/docdd の中身を変えてコミットすると exit 1 で、変わったファイルを出す", () => {
  const dir = makeRepo();
  write(dir, { "plugins/docdd/skills/dev-loop/SKILL.md": "---\nname: dev-loop\n---\n\n手順を足した。\n" });
  commitAll(dir, "スキルを直す");
  const r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /check-version-bump FAILED/);
  assert.match(r.stderr, /docdd--v0\.3\.0/);
  assert.match(r.stderr, /version が 0\.3\.0 のまま/);
  assert.match(r.stderr, /- plugins\/docdd\/skills\/dev-loop\/SKILL\.md/);
});

test("check-version-bump: plugins/docdd の README.md・CHANGELOG.md・evals/ だけの変更なら exit 0", () => {
  const dir = makeRepo();
  write(dir, {
    "plugins/docdd/README.md": "# docdd\n\n説明を足した。\n",
    "plugins/docdd/CHANGELOG.md": "## 0.3.0\n\n- 書き足した\n",
    "plugins/docdd/evals/dev-loop-all-blocked/prompt.md": "/docdd:dev-loop\n\n",
    "plugins/docdd/evals/new-case/case.yaml": "name: new-case\n",
    "README.md": "# repo\n\nプラグインの外の変更。\n",
  });
  commitAll(dir, "説明と evals だけ直す");
  const r = runBump(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /check-version-bump OK/);
  assert.match(r.stdout, /数えなかった変更 4 件/);
});

test("check-version-bump: 数えないのは plugins/docdd 直下の README.md・CHANGELOG.md だけ（スキルの中の README.md は数える）", () => {
  const dir = makeRepo();
  write(dir, { "plugins/docdd/skills/dev-loop/README.md": "# メモ\n" });
  commitAll(dir, "スキルのフォルダに README を足す");
  const r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /- plugins\/docdd\/skills\/dev-loop\/README\.md/);
});

test("check-version-bump: 中身を変えても、plugin.json の版を上げていれば exit 0", () => {
  const dir = makeRepo();
  write(dir, {
    "plugins/docdd/skills/dev-loop/SKILL.md": "---\nname: dev-loop\n---\n\n手順を足した。\n",
    "plugins/docdd/.claude-plugin/plugin.json": pluginJson("0.4.0"),
  });
  commitAll(dir, "release: 0.4.0");
  const r = runBump(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /version 0\.4\.0 は、最新のタグ docdd--v0\.3\.0 より新しい/);
});

test("check-version-bump: docdd--v* のタグが無ければ「飛ばした」と出して exit 0", () => {
  const dir = makeRepo({ tag: null });
  write(dir, { "plugins/docdd/skills/dev-loop/SKILL.md": "変えた\n" });
  commitAll(dir, "スキルを直す");
  git(dir, ["tag", "v0.3.0"]); // 形の違うタグは見ない
  const r = runBump(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /check-version-bump 飛ばした/);
  assert.match(r.stdout, /タグが無い/);
});

test("check-version-bump: まだコミットしていない変更と、git にまだ無いファイルも数える（.gitignore で除いたファイルは数えない）", () => {
  const dir = makeRepo();
  write(dir, { "plugins/docdd/evals/results/2026-09-15/report.html": "<html></html>\n" });
  assert.equal(runBump(dir).status, 0, "除外したファイルだけなら通る");

  write(dir, { "plugins/docdd/skills/new-skill/SKILL.md": "---\nname: new-skill\n---\n" });
  let r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /- plugins\/docdd\/skills\/new-skill\/SKILL\.md/);

  fs.rmSync(path.join(dir, "plugins/docdd/skills/new-skill"), { recursive: true });
  write(dir, { "plugins/docdd/skills/dev-loop/SKILL.md": "作業中の変更\n" });
  r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /- plugins\/docdd\/skills\/dev-loop\/SKILL\.md/);
});

test("check-version-bump: タグは版の大小で最新を選ぶ（0.10.0 は 0.9.0 より新しい）", () => {
  const dir = makeRepo({ version: "0.9.0", tag: "docdd--v0.9.0" });
  write(dir, { "plugins/docdd/.claude-plugin/plugin.json": pluginJson("0.10.0"), "plugins/docdd/skills/dev-loop/SKILL.md": "0.10.0\n" });
  commitAll(dir, "release: 0.10.0");
  git(dir, ["tag", "docdd--v0.10.0"]);
  write(dir, { "plugins/docdd/skills/dev-loop/SKILL.md": "0.10.0 のあとの変更\n" });
  commitAll(dir, "スキルを直す");
  const r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /最新のタグ docdd--v0\.10\.0 から/);
});

test("check-version-bump: plugin.json の版が最新のタグより小さければ exit 1", () => {
  const dir = makeRepo();
  write(dir, { "plugins/docdd/.claude-plugin/plugin.json": pluginJson("0.2.9") });
  commitAll(dir, "版を下げる");
  const r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /0\.2\.9）が、最新のタグ docdd--v0\.3\.0 より小さい/);
});

/** 今のブランチに、HEAD の履歴に入っていないタグ（別のブランチで打った新しい版）を足し、元のブランチに戻る。 */
function tagOnSideBranch(dir, version) {
  const base = git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  git(dir, ["checkout", "-q", "-b", `side-${version}`]);
  write(dir, { "plugins/docdd/.claude-plugin/plugin.json": pluginJson(version), "plugins/docdd/skills/dev-loop/SKILL.md": `${version}\n` });
  commitAll(dir, `release: ${version}`);
  git(dir, ["tag", "-a", "-m", version, `docdd--v${version}`]);
  git(dir, ["checkout", "-q", base]);
}

test("check-version-bump: 新しいタグが HEAD にまだ入っていない（main から遅れたブランチ）なら、版を下げたとは言わず、HEAD に入っている最新のタグと比べる", () => {
  const dir = makeRepo({ version: "0.10.0", tag: "docdd--v0.10.0" });
  tagOnSideBranch(dir, "0.11.0");
  git(dir, ["tag", "docdd--v1.0.0-rc1", "side-0.11.0"]); // X.Y.Z の形でないタグは見ない

  let r = runBump(dir);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /最新のタグ docdd--v0\.11\.0 は、HEAD にまだ入っていない/);
  assert.match(r.stdout, /check-version-bump OK — HEAD に入っている最新のタグ docdd--v0\.10\.0 から、版を上げる必要のある変更は無い/);
  assert.doesNotMatch(r.out, /版は下げない|1\.0\.0-rc1/);

  write(dir, { "plugins/docdd/skills/dev-loop/SKILL.md": "遅れたブランチでの変更\n" });
  commitAll(dir, "スキルを直す");
  r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /HEAD に入っている最新のタグ docdd--v0\.10\.0 から plugins\/docdd の中身が変わったのに/);

  write(dir, { "plugins/docdd/.claude-plugin/plugin.json": pluginJson("0.9.9") });
  commitAll(dir, "版を下げる");
  r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /0\.9\.9）が、HEAD に入っている最新のタグ docdd--v0\.10\.0 より小さい/);
  assert.match(r.stderr, /版は下げない/);
});

test("check-version-bump: 版が最新のタグより小さく、HEAD にはどのタグも入っていなければ exit 1 で、main の取り込みを案内する", () => {
  const dir = makeRepo({ tag: null });
  tagOnSideBranch(dir, "0.4.0");
  const r = runBump(dir);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /version（0\.3\.0）が最新のタグ docdd--v0\.4\.0 より小さく、そのタグは HEAD にまだ入っていない/);
  assert.match(r.stderr, /main を取り込んでから確かめる/);
});

test("check-version-bump: 浅い clone でタグが取れなければ「飛ばした」と出して exit 0", () => {
  const origin = makeRepo();
  for (const n of [1, 2]) {
    write(origin, { "plugins/docdd/skills/dev-loop/SKILL.md": `変更 ${n}\n` });
    commitAll(origin, `スキルを直す ${n}`);
  }
  const parent = tempDir("docdd-shallow-");
  const clone = path.join(parent, "clone");
  git(parent, ["clone", "-q", "--depth", "1", pathToFileURL(origin).href, clone]);
  assert.equal(git(clone, ["rev-parse", "--is-shallow-repository"]).trim(), "true");
  assert.equal(git(clone, ["tag", "--list"]).trim(), "", "浅い clone ではタグが無い前提");
  copyScript(clone);
  const r = runBump(clone);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /check-version-bump 飛ばした/);
  assert.match(r.stdout, /浅い clone/);
});

test("check-version-bump: git のリポジトリの外なら「飛ばした」と出して exit 0", () => {
  const dir = tempDir("docdd-nogit-");
  write(dir, { "plugins/docdd/.claude-plugin/plugin.json": pluginJson("0.3.0") });
  copyScript(dir);
  const r = runBump(dir, { ...ENV, GIT_CEILING_DIRECTORIES: path.dirname(dir) });
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /check-version-bump 飛ばした/);
});

test("check-urls: 全角の括弧・句読点・Markdown のリンク・バッククォートの直前で URL を切る", async () => {
  const { extractUrls } = await import(pathToFileURL(URLS).href);
  const text = [
    "公式（https://code.claude.com/docs/en/permissions）。",
    "[説明](https://github.com/no1013kota/claude-docdd-dev-kit/blob/main/plugins/docdd/README.md) を読む",
    "`https://nodejs.org/ja` から入れる。",
    "詳しくは https://docs.unity3d.com/6000.3/Documentation/Manual/build-command-line.html.",
    "https://gitforwindows.org、https://code.claude.com/docs/en/hooks",
    "<https://code.claude.com/docs/en/skills>",
    "**https://code.claude.com/docs/en/plugins**",
  ].join("\r\n");
  const { urls, excluded } = extractUrls(text);
  assert.deepEqual(urls, [
    { url: "https://code.claude.com/docs/en/permissions", line: 1 },
    { url: "https://github.com/no1013kota/claude-docdd-dev-kit/blob/main/plugins/docdd/README.md", line: 2 },
    { url: "https://nodejs.org/ja", line: 3 },
    { url: "https://docs.unity3d.com/6000.3/Documentation/Manual/build-command-line.html", line: 4 },
    { url: "https://gitforwindows.org", line: 5 },
    { url: "https://code.claude.com/docs/en/hooks", line: 5 },
    { url: "https://code.claude.com/docs/en/skills", line: 6 },
    { url: "https://code.claude.com/docs/en/plugins", line: 7 },
  ]);
  assert.deepEqual(excluded, []);
});

test("check-urls: localhost・127.0.0.1・example.com と、<...>・{{...}}・${...}・… の見本は除く", async () => {
  const { extractUrls } = await import(pathToFileURL(URLS).href);
  const text = [
    "http://localhost:3000/api",
    "| 開発サーバー起動 | `npm run dev`（http://127.0.0.1:3000 で開く） |",
    "| 公開先 URL | https://example.com（まだ公開しないなら「無い」） |",
    "https://app.example.com/login",
    "https://github.com/<owner>/<repo>",
    "https://{{公開先のドメイン}}/health",
    "http://127.0.0.1:${port}/",
    "https://…",
    "https://notexample.com/docs",
    "https://github.com/no1013kota",
  ].join("\n");
  const { urls, excluded } = extractUrls(text);
  assert.deepEqual(urls, [
    { url: "https://notexample.com/docs", line: 9 },
    { url: "https://github.com/no1013kota", line: 10 },
  ]);
  assert.deepEqual(
    excluded.map((e) => e.line),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("check-urls: 対象は README 2 本・RELEASING・CHANGELOG・skills・templates・examples だけで、同じ URL は場所をまとめる", async () => {
  const { collectUrls } = await import(pathToFileURL(URLS).href);
  const root = tempDir("docdd-urls-");
  const shared = "https://code.claude.com/docs/en/plugins";
  write(root, {
    "README.md": `入れ方: ${shared}\n`,
    "RELEASING.md": "https://code.claude.com/docs/en/plugin-evals\n",
    "plugins/docdd/README.md": `\n\n公式（${shared}）\n`,
    "plugins/docdd/CHANGELOG.md": "https://github.com/no1013kota/claude-docdd-dev-kit\n",
    "plugins/docdd/skills/init/SKILL.md": "https://nodejs.org/ja\n",
    "plugins/docdd/templates/docs/PRD.md": "https://github.com/no1013kota/claude-docdd-dev-kit/blob/main/plugins/docdd/examples/PRD.sample.md\n",
    "plugins/docdd/examples/PRD.sample.md": "http://127.0.0.1:3000\n",
    "plugins/docdd/evals/case/prompt.md": "https://not-scanned.invalid/evals\n",
    ".github/ISSUE_TEMPLATE/config.yml": "url: https://not-scanned.invalid/github\n",
    "tests/x.test.mjs": "// https://not-scanned.invalid/tests\n",
  });
  fs.writeFileSync(path.join(root, "plugins/docdd/templates/image.png"), Buffer.from([0x89, 0x50, 0x00, 0x68, 0x74, 0x74, 0x70, 0x3a]));
  const { found, places, excludedCount } = collectUrls(root);
  assert.deepEqual(Object.fromEntries(found), {
    [shared]: ["README.md:1", "plugins/docdd/README.md:3"],
    "https://code.claude.com/docs/en/plugin-evals": ["RELEASING.md:1"],
    "https://github.com/no1013kota/claude-docdd-dev-kit": ["plugins/docdd/CHANGELOG.md:1"],
    "https://github.com/no1013kota/claude-docdd-dev-kit/blob/main/plugins/docdd/examples/PRD.sample.md": ["plugins/docdd/templates/docs/PRD.md:1"],
    "https://nodejs.org/ja": ["plugins/docdd/skills/init/SKILL.md:1"],
  });
  assert.equal(places, 6);
  assert.equal(excludedCount, 1);
});

test("check-urls: --list は通信せずに一覧を出して exit 0、知らない引数は exit 2", () => {
  const list = spawnSync(process.execPath, [URLS, "--list"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(list.status, 0, `${list.stdout}${list.stderr}`);
  assert.match(list.stdout, /URL \d+ 種類（\d+ か所）。除いた見本 \d+ か所。/);
  const bad = spawnSync(process.execPath, [URLS, "--bogus"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(bad.status, 2, `${bad.stdout}${bad.stderr}`);
});
