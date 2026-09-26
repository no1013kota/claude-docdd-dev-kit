// plugins/docdd/templates/scripts の検査スクリプトを、使い捨ての git リポジトリで実行して
// 終了コードと文面を固定する（依存なし・Node 18 以上）。
//
//   node --test tests/template-scripts.test.mjs
//
// テンプレートの docs・CLAUDE.md はコピーしない（中身が変わってもこのテストが壊れないように、
// 各テストが最小の文書を自分で書く）。audit-check.mjs だけは「scripts/ の隣に allowlist、1 つ上に lock」
// という置き方そのものを検査するため、スクリプト 1 本を使い捨てのリポジトリへ置いて実行する。
// audit-check.mjs の判定は通信せずに確かめる。PATH の先頭に偽の npm（記録した npm audit の JSON を出す）を置き、
// fetch は --require で読み込む偽物（記録した bulk advisory endpoint の応答を返す）に差し替える。
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "plugins/docdd/templates/scripts");

// GIT_CONFIG_GLOBAL に os.devNull を渡すと、Git for Windows は「\\.\nul」を設定ファイルとして読めずに止まる。空のファイルを渡す
const EMPTY_GITCONFIG = path.join(mkdtempSync(path.join(tmpdir(), "docdd-gitconfig-")), "config");
writeFileSync(EMPTY_GITCONFIG, "");
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG, GIT_CONFIG_NOSYSTEM: "1" };
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

test("共通: 5 本とも先頭 3 行以内に docdd-kit の版の刻印がある", () => {
  for (const name of ["check-doc-dates.mjs", "check-doc-refs.mjs", "check-doc-placeholders.mjs", "audit-check.mjs", "backlog-archive.mjs"]) {
    const head = readFileSync(path.join(SCRIPTS, name), "utf8").split("\n").slice(0, 3).join("\n");
    assert.match(head, /docdd-kit v[0-9]+\.[0-9]+\.[0-9]+/, name);
  }
});

test("共通: Markdown の読み取り部分は check-doc-*.mjs の 3 本と init.mjs で同じ中身", () => {
  // begin 行のコメントは比べない（写しごとに注記が違う）
  const block = (file) => {
    const text = readFileSync(file, "utf8");
    const m = /\/\/ ---- docdd:scan-markdown begin[^\n]*\n([\s\S]*?\/\/ ---- docdd:scan-markdown end ----)/.exec(text);
    assert.ok(m, `${file} に scan-markdown の区間が無い`);
    return m[1];
  };
  const INIT = path.join(SCRIPTS, "..", "..", "scripts", "init.mjs");
  const dates = block(path.join(SCRIPTS, "check-doc-dates.mjs"));
  assert.equal(block(path.join(SCRIPTS, "check-doc-refs.mjs")), dates);
  assert.equal(block(path.join(SCRIPTS, "check-doc-placeholders.mjs")), dates);
  assert.equal(block(INIT), dates, "init.mjs の写しがずれている（init の未記入欄の一覧と検査の結果が食い違う）");
  const placeholder = (file) => /^const PLACEHOLDER = .*;$/m.exec(readFileSync(file, "utf8"))?.[0];
  assert.equal(placeholder(INIT), placeholder(path.join(SCRIPTS, "check-doc-placeholders.mjs")));
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

test("refs: Unity の .cs・.unity の無いファイルを検出して exit 1（実在するもの・拡張子だけの記述は通す）", () => {
  const dir = repo({
    "CLAUDE.md": [
      "- 移動は `Assets/Scripts/Units/UnitMover.cs` で行う",
      "- 戦闘の場面は `Assets/Scenes/Battle.unity`",
      "- 実在する `Assets/Scripts/Player.cs:12` と `Assets/Scenes/Main.unity`",
      "- 拡張子だけの `.unity`・`.prefab`・`.meta` はパスとして読まない",
      "",
    ].join("\n"),
    "Assets/Scripts/Player.cs": "\n",
    "Assets/Scenes/Main.unity": "\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /無いファイルを指す記述が 2 件あります（4 件を検査）/);
  assert.match(r.out, /CLAUDE\.md:1 {2}→ {2}Assets\/Scripts\/Units\/UnitMover\.cs/);
  assert.match(r.out, /CLAUDE\.md:2 {2}→ {2}Assets\/Scenes\/Battle\.unity/);
  assert.doesNotMatch(r.out, /Player\.cs|Main\.unity/);
});

test("refs: Web 以外の拡張子（Unity・Godot・ネイティブアプリ・C/C++ など）と html・vue なども検査する", () => {
  const exts = [
    "cs", "unity", "prefab", "asset", "asmdef", "mat", "shader", "hlsl", "uxml", "uss", "inputactions",
    "gd", "tscn", "tres", "dart", "kt", "kts", "java", "swift", "c", "cc", "cpp", "h", "hpp", "lua",
    "gradle", "csproj", "sln", "html", "scss", "vue", "svelte", "astro",
  ];
  const dir = repo({ "CLAUDE.md": `${exts.map((ext) => `- \`missing/file.${ext}\``).join("\n")}\n` });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`${exts.length} 件あります（${exts.length} 件を検査）`));
  exts.forEach((ext, i) => {
    assert.match(r.out, new RegExp(`CLAUDE\\.md:${i + 1} {2}→ {2}missing/file\\.${ext}\\n`), ext);
  });
});

test("refs: 「例」を含む行とコードブロックの中の .cs・.unity は検査しない", () => {
  const dir = repo({
    "CLAUDE.md": [
      "例: `Assets/Scripts/Nothing.cs` のように書く",
      "- シーンの例: `Assets/Scenes/Nothing.unity`",
      "```text",
      "`Assets/Scenes/InFence.unity`",
      "`Assets/Scripts/Editor/InFence.cs`",
      "```",
      "本物は `Assets/Scripts/Player.cs`",
      "",
    ].join("\n"),
    "Assets/Scripts/Player.cs": "\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 件すべて実在しました/);
});

test("refs: 行末が for example・e.g.・for instance・例えば・たとえば の行に続く箇条は検査しない（空行 1 行を挟んでもよい）", () => {
  const dir = repo({
    "docs/UNITY_WORKFLOW.md": [
      // RTSProject の docs/UNITY_WORKFLOW.md 69-73 行と同じ形
      "All new production scenes must be created under `Assets/_Project/Scenes/`, for example:",
      "",
      "- `Assets/_Project/Scenes/MainMenu.unity`",
      "- `Assets/_Project/Scenes/Battle.unity`",
      "- `Assets/_Project/Scenes/Test_UnitCombat.unity`",
      "",
      "Do not create new production scenes under `Assets/Scenes/`.",
      "",
      "Scripts e.g.",
      "* `Assets/Scripts/Units/UnitMover.cs`",
      "  (the mover, `Assets/Scripts/Units/UnitMoverTests.cs` too)",
      "  - `Assets/Scripts/Units/Nested.cs`",
      "1. `Assets/Scripts/Units/Numbered.cs`",
      "",
      "+ `Assets/Scripts/Units/AfterBlank.cs`",
      "",
      "For Instance：",
      "- `src/instance.ts`",
      "",
      "画面は、例えば:",
      "- `src/app/page.tsx`",
      "",
      "たとえば",
      "",
      "- `src/app/layout.tsx`",
      "",
      "本物は `Assets/Scripts/Player.cs`",
      "",
    ].join("\n"),
    "Assets/Scripts/Player.cs": "\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 件すべて実在しました/);
});

test("refs: 見本の箇条は、箇条でない行・空行のあとの箇条でない行で終わり、そのあとは検査する", () => {
  const dir = repo({
    "CLAUDE.md": [
      "Scenes, for example:", // 1
      "- `Assets/Scenes/Menu.unity`", // 2
      "After the list `app/after_list.py`", // 3: 字下げの無い箇条でない行で終わる
      "",
      "for example:", // 5
      "",
      "",
      "- `app/two_blank_lines.py`", // 8: 導入の行との間に空行が 2 行
      "",
      "e.g.:", // 10
      "- `app/listed.py`",
      "",
      "  `app/indented_after_blank.py`", // 13: 空行のあとの箇条でない行で終わる
      "- `app/after_end.py`", // 14: 終わったあとの箇条は検査する
      "",
      "```text",
      "for example:", // 17: コードブロックの中は導入の行と見ない
      "```",
      "- `app/after_fence.py`", // 19
      "",
      "- Scenes, for example:", // 21
      "  - `Assets/Scenes/Nested.unity`",
      "- `app/sibling.py`", // 23: 導入の行の箇条より浅い箇条で終わる
      "",
      "Use one, for example: `app/same_line.py`", // 25: 導入の行そのものは検査する
      "",
    ].join("\n"),
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /無いファイルを指す記述が 7 件あります（7 件を検査）/);
  for (const [line, ref] of [
    [3, "app/after_list.py"],
    [8, "app/two_blank_lines.py"],
    [13, "app/indented_after_blank.py"],
    [14, "app/after_end.py"],
    [19, "app/after_fence.py"],
    [23, "app/sibling.py"],
    [25, "app/same_line.py"],
  ]) {
    assert.match(r.out, new RegExp(`CLAUDE\\.md:${line} {2}→ {2}${ref.replace(/[.]/g, "\\.")}\\n`), ref);
  }
  assert.doesNotMatch(r.out, /Menu\.unity|Nested\.unity|listed\.py/);
  assert.match(r.out, /for example:」で終えると、続く箇条を検査しません/);
});

test("refs: 「例外」の「例」は数えずに検査する（「事例」「比例」のような語は今までどおり見本として飛ばす）", () => {
  const dir = repo({
    "CLAUDE.md": [
      "- 例外の処理は `src/errors.ts` と `src/missing_errors.ts` にある",
      "- 事例として `src/case_study.ts` を挙げる",
      "- 例外の例: `src/example_of_exception.ts`",
      "",
    ].join("\n"),
    "src/errors.ts": "\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /無いファイルを指す記述が 1 件あります（2 件を検査）/);
  assert.match(r.out, /CLAUDE\.md:1 {2}→ {2}src\/missing_errors\.ts/);
  assert.doesNotMatch(r.out, /case_study|example_of_exception/);
});

/** 「## ADR 一覧」の見出しと表を持つ最小の docs/decisions/README.md。 */
const adrIndex = (rows = "") =>
  `# ADR\n\n## ADR 一覧\n\n- 「ADR」の列は本文への相対リンクにする（書き方の例: \`[ADR-0001](./0001-use-postgres.md)\`）。\n\n| ADR | 状態 | 内容 |\n|---|---|---|\n${rows}`;

test("refs: 「ADR 一覧」に載っていない ADR を挙げて exit 1（表に 1 行足せば exit 0）", () => {
  const dir = repo({
    "docs/decisions/README.md": adrIndex(),
    "docs/decisions/0002-x.md": "# ADR-0002\n",
    "docs/decisions/0000-template.md": "# 見本\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /「ADR 一覧」に載っていない ADR が 1 件/);
  assert.match(r.out, /docs\/decisions\/0002-x\.md/);
  assert.doesNotMatch(r.out, /0000-template/, "見本の ADR は数えない");

  write(dir, { "docs/decisions/README.md": adrIndex("| [ADR-0002](./0002-x.md) | 採用 | x に決めた |\n") });
  git(dir, ["add", "--", "docs/decisions/README.md"]);
  const ok = run(REFS, dir);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /ADR はすべて「ADR 一覧」に載っています/);
});

test("refs: 一覧の判定は表の行だけを見る（説明の中の書き方の例では載っていることにしない）。リンクは ./ 無し・#見出し付きでも数える", () => {
  // 説明の例に出てくる 0001-use-postgres.md を実在させる。表には無いので落ちる。
  const dir = repo({
    "docs/decisions/README.md": adrIndex(),
    "docs/decisions/0001-use-postgres.md": "# ADR-0001\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/decisions\/0001-use-postgres\.md/);

  // ./ 無し・#見出し付きのリンクも「載っている」と数える
  write(dir, { "docs/decisions/README.md": adrIndex("| [ADR-0001](0001-use-postgres.md#背景) | 採用 | postgres |\n") });
  git(dir, ["add", "--", "docs/decisions/README.md"]);
  const ok = run(REFS, dir);
  assert.equal(ok.code, 0, ok.out);
});

test("refs: 「## ADR 一覧」の見出しが無ければ突き合わせず、その旨を出す（黙って無効にしない）", () => {
  const dir = repo({
    "docs/decisions/README.md": "# ADR\n\n1判断1ファイル。\n",
    "docs/decisions/0003-y.md": "# ADR-0003\n",
  });
  const r = run(REFS, dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /「## ADR 一覧」の見出しが無いので/);
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

test("dates: 名前に空白を含む文書でも、内容の変更の日付を読む（置き去りを見つける）", () => {
  const dir = repo({ "docs/requirements/01 画面 仕様.md": prd({ date: "2026-01-15" }) }, { commitDate: "2026-01-15" });
  write(dir, { "docs/requirements/01 画面 仕様.md": `${prd({ date: "2026-01-15" })}\n追記\n` });
  git(dir, ["add", "--", "docs/requirements/01 画面 仕様.md"]);
  commit(dir, "2026-03-01", "content");
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /01 画面 仕様\.md/);
});

test("dates: 名前を変えたコミット（git mv）は、全行を足した変更として数える", () => {
  const dir = repo({ "docs/old.md": prd({ date: "2026-01-15" }) }, { commitDate: "2026-01-15" });
  git(dir, ["mv", "docs/old.md", "docs/new.md"]);
  commit(dir, "2026-03-01", "rename");
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/new\.md/);
});

test("dates: 本文の行が「++ 」や「--」で始まっても、内容の変更として数える", () => {
  const dir = repo({ "docs/PRD.md": prd({ date: "2026-01-15" }) }, { commitDate: "2026-01-15" });
  write(dir, { "docs/PRD.md": `${prd({ date: "2026-01-15" })}\n++ 足した行\n-- 引いた行\n` });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-03-01", "plus plus");
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/PRD\.md/);
});

test("dates: マージで更新日の衝突だけを解いたコミットは、内容の変更に数えない", () => {
  const dir = repo({ "docs/PRD.md": prd({ date: "2026-01-15" }) }, { commitDate: "2026-01-15" });
  git(dir, ["checkout", "-q", "-b", "side"]);
  write(dir, { "docs/PRD.md": prd({ date: "2026-01-16" }) });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-01-16", "side date");
  git(dir, ["checkout", "-q", "-"]);
  write(dir, { "docs/PRD.md": prd({ date: "2026-01-17" }) });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-01-17", "main date");
  spawnSync("git", ["merge", "-q", "side", "-m", "merge"], { cwd: dir, env: { ...ENV, GIT_AUTHOR_DATE: "2026-03-01T00:00:00", GIT_COMMITTER_DATE: "2026-03-01T00:00:00" } });
  write(dir, { "docs/PRD.md": prd({ date: "2026-01-17" }) });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-03-01", "merge");
  const r = run(DATES, dir);
  assert.equal(r.code, 0, r.out);
});

test("dates: マージで衝突を新しい本文で解いたコミットは、内容の変更に数える（置き去りを見逃さない）", () => {
  const body = (line) => `${prd({ date: "2026-01-15" })}\n${line}\n`;
  const dir = repo({ "docs/PRD.md": body("本文 A") }, { commitDate: "2026-01-15" });
  git(dir, ["checkout", "-q", "-b", "side"]);
  write(dir, { "docs/PRD.md": body("本文 B") });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-01-15", "side");
  git(dir, ["checkout", "-q", "-"]);
  write(dir, { "docs/PRD.md": body("本文 C") });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-01-15", "main");
  spawnSync("git", ["merge", "-q", "side", "-m", "merge"], { cwd: dir, env: ENV });
  write(dir, { "docs/PRD.md": body("本文 D（どちらの親にも無い）") });
  git(dir, ["add", "--", "docs/PRD.md"]);
  commit(dir, "2026-03-01", "merge");
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/PRD\.md/);
});

test("dates: git が引用する名前（\" や絵文字を含む）の文書も、置き去りを見つける", { skip: process.platform === "win32" }, () => {
  const name = 'docs/requirements/02 "画面"😀.md';
  const dir = repo({ [name]: prd({ date: "2026-01-15" }) }, { commitDate: "2026-01-15" });
  write(dir, { [name]: `${prd({ date: "2026-01-15" })}\n追記\n` });
  git(dir, ["add", "--", name]);
  commit(dir, "2026-03-01", "content");
  const r = run(DATES, dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /画面/);
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
// backlog-archive.mjs
// ---------------------------------------------------------------------------

const ARCHIVE_SCRIPT = "backlog-archive.mjs";
const ARCHIVE_TEMPLATE = readFileSync(path.join(ROOT, "plugins/docdd/templates/tasks/archive/BACKLOG-done.md"), "utf8").replace(/\r\n/g, "\n");

/** 雛形と同じ節（運用ルールの見本はコードブロックの中）を持つ最小の BACKLOG。 */
function backlog({ tasks = [], decisions = [] } = {}) {
  return [
    "# 開発バックログ",
    "",
    "## 運用ルール",
    "",
    "```markdown",
    "### T-NN: <タスク名> `done`",
    "**D-N: <論点>** — <背景>",
    "- 状態: 決定（YYYY-MM-DD, 案A）",
    "```",
    "",
    "## タスク",
    "",
    ...tasks.flatMap((t) => [...t, ""]),
    "## 要決定・外部準備（ユーザー作業）",
    "",
    ...decisions.flatMap((d) => [...d, ""]),
  ].join("\n");
}

const TASKS = [
  ["### T-01: アプリの土台を作る `done`", "- 参照: [PRD](../docs/PRD.md)・[計画](./REFACTOR_PLAN.md)・[外](https://example.com)"],
  ["### T-02: ログインできる `doing`", "- 参照: PRD A-1"],
  ["### T-03: 通知 `dropped`", "- 理由: 要らなくなった"],
  ["### T-04: 決済 `blocked`", "- 理由: 審査待ち"],
  ["### T-05: 一覧 `todo`", "- 参照: PRD A-2"],
];
const DECISIONS = [
  ["**D-1: 決済の方法** — 背景", "- 状態: 決定（2026-01-10, 案A）→ 書き戻し先: PRD §4", "- 案A（推奨）: 月額"],
  ["**D-2: ログインの不具合を解決する方法** — 背景", "- 状態: 未決", "- 案A（推奨）: 直す"],
];

/** スクリプトを scripts/ へ置いたプロジェクト。 */
function archiveProject(files) {
  const dir = repo(files, { add: false, commitDate: null });
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  copyFileSync(path.join(SCRIPTS, ARCHIVE_SCRIPT), path.join(dir, "scripts", ARCHIVE_SCRIPT));
  const runIn = (...args) => {
    const r = spawnSync(process.execPath, [path.join("scripts", ARCHIVE_SCRIPT), ...args], { cwd: dir, env: ENV, encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  return { dir, runIn };
}

test("backlog: done・dropped のタスクと「状態: 決定」の判断を移し、todo・doing・blocked と未決は残す。2 回目は何も変えない", () => {
  const { dir, runIn } = archiveProject({ "tasks/BACKLOG.md": backlog({ tasks: TASKS, decisions: DECISIONS }) });
  const r = runIn();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /タスク 2 件・判断 1 件/);
  const left = readFileSync(path.join(dir, "tasks/BACKLOG.md"), "utf8");
  for (const kept of ["T-02: ログインできる", "T-04: 決済", "T-05: 一覧", "**D-2: ログインの不具合を解決する方法**"]) assert.ok(left.includes(kept), kept);
  for (const gone of ["T-01: アプリの土台", "T-03: 通知", "**D-1: 決済の方法**"]) assert.ok(!left.includes(gone), gone);
  // 運用ルールの見本（コードブロックの中）は移さない
  assert.ok(left.includes("### T-NN: <タスク名> `done`") && left.includes("- 状態: 決定（YYYY-MM-DD, 案A）"));
  assert.ok(left.endsWith("\n") && !left.includes("\n\n\n"));

  const archive = readFileSync(path.join(dir, "tasks/archive/BACKLOG-done.md"), "utf8");
  const at = (text) => archive.indexOf(text);
  assert.ok(archive.startsWith(ARCHIVE_TEMPLATE.split("## 決定済み")[0]), "まだ無ければ雛形と同じ前置きで作る");
  assert.ok(at("## 決定済みの要決定・外部準備") < at("**D-1: 決済の方法**") && at("**D-1: 決済の方法**") < at("## 完了したタスク"));
  assert.ok(at("## 完了したタスク") < at("### T-01") && at("### T-01") < at("### T-03"));
  // アーカイブは 1 段深いので、相対リンクだけを 1 段上から指すように直す
  assert.ok(archive.includes("[PRD](../../docs/PRD.md)・[計画](../REFACTOR_PLAN.md)・[外](https://example.com)"), archive);

  const again = runIn();
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /移すものはありません/);
  assert.equal(readFileSync(path.join(dir, "tasks/archive/BACKLOG-done.md"), "utf8"), archive);
});

test("backlog: 既にあるアーカイブへは、判断を「完了したタスク」の見出しの前に、タスクを末尾に足す（見出しが無ければ足す）", () => {
  const existing = `${ARCHIVE_TEMPLATE.trimEnd()}\n\n### T-00: 前に終えたタスク \`done\`\n- メモ: 前から\n`;
  const { dir, runIn } = archiveProject({ "tasks/BACKLOG.md": backlog({ tasks: TASKS, decisions: DECISIONS }), "tasks/archive/BACKLOG-done.md": existing });
  assert.equal(runIn().code, 0);
  const archive = readFileSync(path.join(dir, "tasks/archive/BACKLOG-done.md"), "utf8");
  const at = (text) => archive.indexOf(text);
  assert.ok(at("**D-1: 決済の方法**") < at("## 完了したタスク"));
  assert.ok(at("### T-00") < at("### T-01") && at("### T-01") < at("### T-03"));

  // 見出しを消してしまったアーカイブでも、見出しを足して移す
  const bare = archiveProject({ "tasks/BACKLOG.md": backlog({ tasks: TASKS, decisions: DECISIONS }), "tasks/archive/BACKLOG-done.md": "# 控え\n" });
  assert.equal(bare.runIn().code, 0);
  const b = readFileSync(path.join(bare.dir, "tasks/archive/BACKLOG-done.md"), "utf8");
  assert.ok(b.startsWith("# 控え\n"));
  assert.ok(b.indexOf("## 決定済みの要決定・外部準備") < b.indexOf("**D-1") && b.indexOf("**D-1") < b.indexOf("## 完了したタスク"));
});

test("backlog: --check は書かずに、移すものがあれば一覧を出して exit 1、無ければ exit 0", () => {
  const text = backlog({ tasks: TASKS, decisions: DECISIONS });
  const { dir, runIn } = archiveProject({ "tasks/BACKLOG.md": text });
  const r = runIn("--check");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /3 件残っています/);
  assert.match(r.out, /T-01: アプリの土台を作る/);
  assert.equal(readFileSync(path.join(dir, "tasks/BACKLOG.md"), "utf8"), text);
  assert.equal(existsSync(path.join(dir, "tasks/archive/BACKLOG-done.md")), false);

  const clean = archiveProject({ "tasks/BACKLOG.md": backlog({ tasks: [TASKS[1]], decisions: [DECISIONS[1]] }) });
  assert.equal(clean.runIn("--check").code, 0);
});

test("backlog: CRLF の BACKLOG は CRLF のまま書く", () => {
  const text = backlog({ tasks: TASKS, decisions: DECISIONS }).replace(/\n/g, "\r\n");
  const { dir, runIn } = archiveProject({ "tasks/BACKLOG.md": text });
  assert.equal(runIn().code, 0);
  const left = readFileSync(path.join(dir, "tasks/BACKLOG.md"), "utf8");
  assert.ok(left.includes("T-02: ログインできる") && !left.includes("T-01: アプリ"));
  assert.equal(left.replace(/\r\n/g, "").includes("\n"), false, "LF だけの行が混ざらない");
  const archive = readFileSync(path.join(dir, "tasks/archive/BACKLOG-done.md"), "utf8");
  assert.equal(archive.replace(/\r\n/g, "").includes("\n"), false);
});

test("backlog: BACKLOG が無い・知らない引数は exit 2", () => {
  const none = archiveProject({});
  const r = none.runIn();
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /tasks\/BACKLOG\.md がありません/);
  const { runIn } = archiveProject({ "tasks/BACKLOG.md": backlog() });
  const bad = runIn("--apply");
  assert.equal(bad.code, 2, bad.out);
  assert.match(bad.out, /--check だけ/);
});

// ---------------------------------------------------------------------------
// audit-check.mjs
// ---------------------------------------------------------------------------

const LOCK_V3 = `${JSON.stringify({ name: "fixture", lockfileVersion: 3, requires: true, packages: { "": { name: "fixture" } } }, null, 2)}\n`;
const EXPIRED = `${JSON.stringify({ lodash: { ids: ["GHSA-35jh-r3h4-6jhm"], why: "テスト用の据え置き", until: "2000-01-01" } }, null, 2)}\n`;
const PATH_KEY = Object.keys(ENV).find((key) => key.toUpperCase() === "PATH") ?? "PATH";

/** scripts/audit-check.mjs を置いたプロジェクト（`at` はスクリプトを置くフォルダ）。 */
function auditProject(files, at = "scripts") {
  const dir = repo(files, { add: false, commitDate: null });
  mkdirSync(path.join(dir, at), { recursive: true });
  copyFileSync(path.join(SCRIPTS, "audit-check.mjs"), path.join(dir, at, "audit-check.mjs"));
  return { dir, script: path.join(dir, at, "audit-check.mjs") };
}

/*
  記録した監査結果。2026-09-14 に npm 10.9.8 の `npm audit --json --omit=dev` と、
  registry の bulk advisory endpoint（本番依存の名前と版を POST）から取ったものを、判定に使う項目だけに削った。
  どちらの経路でも、high・critical の脆弱性の集合は同じだった（express は 5 件、lodash と minimist は 3 件）。
*/
/** express@4.17.1 だけを入れたプロジェクト。express 自身は low・moderate だけだが、npm audit では qs などが伝わって high になる。 */
const EXPRESS = {
  versions: {"body-parser": "1.19.0", "cookie": "0.4.0", "express": "4.17.1", "path-to-regexp": "0.1.7", "qs": "6.7.0", "send": "0.17.1", "serve-static": "1.14.1"},
  npm: {
    auditReportVersion: 2,
    vulnerabilities: {
      "body-parser": {
        name: "body-parser", severity: "high", isDirect: false, effects: ["express"],
        via: [
          { source: 1099520, name: "body-parser", dependency: "body-parser", title: "body-parser vulnerable to denial of service when url encoding is enabled", url: "https://github.com/advisories/GHSA-qwcr-r2fm-qrc7", severity: "high", range: "<1.20.3" },
          { source: 1123977, name: "body-parser", dependency: "body-parser", title: "body-parser vulnerable to denial of service when invalid limit value silently disables size enforcement", url: "https://github.com/advisories/GHSA-v422-hmwv-36x6", severity: "low", range: "<1.20.6" },
          "qs",
        ],
      },
      "cookie": {
        name: "cookie", severity: "low", isDirect: false, effects: ["express"],
        via: [
          { source: 1103907, name: "cookie", dependency: "cookie", title: "cookie accepts cookie name, path, and domain with out of bounds characters", url: "https://github.com/advisories/GHSA-pxg6-pf52-xh8x", severity: "low", range: "<0.7.0" },
        ],
      },
      "express": {
        name: "express", severity: "high", isDirect: true, effects: [],
        via: [
          { source: 1100530, name: "express", dependency: "express", title: "express vulnerable to XSS via response.redirect()", url: "https://github.com/advisories/GHSA-qw6h-vgh9-j6wx", severity: "low", range: "<4.20.0" },
          { source: 1111636, name: "express", dependency: "express", title: "Express.js Open Redirect in malformed URLs", url: "https://github.com/advisories/GHSA-rv95-896h-c2vc", severity: "moderate", range: "<4.19.2" },
          "body-parser",
          "cookie",
          "path-to-regexp",
          "qs",
          "send",
          "serve-static",
        ],
      },
      "path-to-regexp": {
        name: "path-to-regexp", severity: "high", isDirect: false, effects: ["express"],
        via: [
          { source: 1101850, name: "path-to-regexp", dependency: "path-to-regexp", title: "path-to-regexp outputs backtracking regular expressions", url: "https://github.com/advisories/GHSA-9wv6-86v2-598j", severity: "high", range: "<0.1.10" },
          { source: 1105199, name: "path-to-regexp", dependency: "path-to-regexp", title: "path-to-regexp contains a ReDoS", url: "https://github.com/advisories/GHSA-rhx6-c78j-4q9w", severity: "high", range: "<0.1.12" },
          { source: 1115527, name: "path-to-regexp", dependency: "path-to-regexp", title: "path-to-regexp vulnerable to Regular Expression Denial of Service via multiple route parameters", url: "https://github.com/advisories/GHSA-37ch-88jc-xwx2", severity: "high", range: "<0.1.13" },
        ],
      },
      "qs": {
        name: "qs", severity: "high", isDirect: false, effects: ["body-parser", "express"],
        via: [
          { source: 1104120, name: "qs", dependency: "qs", title: "qs vulnerable to Prototype Pollution", url: "https://github.com/advisories/GHSA-hrpp-h998-j3pp", severity: "high", range: ">=6.7.0 <6.7.3" },
          { source: 1113161, name: "qs", dependency: "qs", title: "qs's arrayLimit bypass in comma parsing allows denial of service", url: "https://github.com/advisories/GHSA-w7fw-mjwx-w883", severity: "low", range: ">=6.7.0 <=6.14.1" },
          { source: 1113719, name: "qs", dependency: "qs", title: "qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion", url: "https://github.com/advisories/GHSA-6rw7-vpxm-498p", severity: "moderate", range: "<6.14.1" },
          { source: 1158507, name: "qs", dependency: "qs", title: "qs: Denial of Service via Attacker Controlled isBuffer", url: "https://github.com/advisories/GHSA-4mjr-xmp4-gh2g", severity: "moderate", range: ">=2.2.5 <6.16.0" },
        ],
      },
      "send": {
        name: "send", severity: "low", isDirect: false, effects: ["express", "serve-static"],
        via: [
          { source: 1109556, name: "send", dependency: "send", title: "send vulnerable to template injection that can lead to XSS", url: "https://github.com/advisories/GHSA-m6fv-jmcg-4jfg", severity: "low", range: "<0.19.0" },
        ],
      },
      "serve-static": {
        name: "serve-static", severity: "low", isDirect: false, effects: [],
        via: [
          { source: 1100528, name: "serve-static", dependency: "serve-static", title: "serve-static vulnerable to template injection that can lead to XSS", url: "https://github.com/advisories/GHSA-cm22-4g7w-348p", severity: "low", range: "<1.16.0" },
          "send",
        ],
      },
    },
    metadata: { vulnerabilities: {"info": 0, "low": 3, "moderate": 0, "high": 4, "critical": 0, "total": 7} },
  },
  bulk: {
    "body-parser": [
      { id: 1123977, url: "https://github.com/advisories/GHSA-v422-hmwv-36x6", title: "body-parser vulnerable to denial of service when invalid limit value silently disables size enforcement", severity: "low", vulnerable_versions: "<1.20.6" },
      { id: 1099520, url: "https://github.com/advisories/GHSA-qwcr-r2fm-qrc7", title: "body-parser vulnerable to denial of service when url encoding is enabled", severity: "high", vulnerable_versions: "<1.20.3" },
    ],
    "cookie": [
      { id: 1103907, url: "https://github.com/advisories/GHSA-pxg6-pf52-xh8x", title: "cookie accepts cookie name, path, and domain with out of bounds characters", severity: "low", vulnerable_versions: "<0.7.0" },
    ],
    "express": [
      { id: 1100530, url: "https://github.com/advisories/GHSA-qw6h-vgh9-j6wx", title: "express vulnerable to XSS via response.redirect()", severity: "low", vulnerable_versions: "<4.20.0" },
      { id: 1111636, url: "https://github.com/advisories/GHSA-rv95-896h-c2vc", title: "Express.js Open Redirect in malformed URLs", severity: "moderate", vulnerable_versions: "<4.19.2" },
    ],
    "path-to-regexp": [
      { id: 1101850, url: "https://github.com/advisories/GHSA-9wv6-86v2-598j", title: "path-to-regexp outputs backtracking regular expressions", severity: "high", vulnerable_versions: "<0.1.10" },
      { id: 1105199, url: "https://github.com/advisories/GHSA-rhx6-c78j-4q9w", title: "path-to-regexp contains a ReDoS", severity: "high", vulnerable_versions: "<0.1.12" },
      { id: 1115527, url: "https://github.com/advisories/GHSA-37ch-88jc-xwx2", title: "path-to-regexp vulnerable to Regular Expression Denial of Service via multiple route parameters", severity: "high", vulnerable_versions: "<0.1.13" },
    ],
    "qs": [
      { id: 1104120, url: "https://github.com/advisories/GHSA-hrpp-h998-j3pp", title: "qs vulnerable to Prototype Pollution", severity: "high", vulnerable_versions: ">=6.7.0 <6.7.3" },
      { id: 1158507, url: "https://github.com/advisories/GHSA-4mjr-xmp4-gh2g", title: "qs: Denial of Service via Attacker Controlled isBuffer", severity: "moderate", vulnerable_versions: ">=2.2.5 <6.16.0" },
      { id: 1113161, url: "https://github.com/advisories/GHSA-w7fw-mjwx-w883", title: "qs's arrayLimit bypass in comma parsing allows denial of service", severity: "low", vulnerable_versions: ">=6.7.0 <=6.14.1" },
      { id: 1113719, url: "https://github.com/advisories/GHSA-6rw7-vpxm-498p", title: "qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion", severity: "moderate", vulnerable_versions: "<6.14.1" },
    ],
    "send": [
      { id: 1109556, url: "https://github.com/advisories/GHSA-m6fv-jmcg-4jfg", title: "send vulnerable to template injection that can lead to XSS", severity: "low", vulnerable_versions: "<0.19.0" },
    ],
    "serve-static": [
      { id: 1100528, url: "https://github.com/advisories/GHSA-cm22-4g7w-348p", title: "serve-static vulnerable to template injection that can lead to XSS", severity: "low", vulnerable_versions: "<1.16.0" },
    ],
  },
};

/** lodash@4.17.20 と minimist@1.2.5 のプロジェクト。lodash に high が 2 件（GHSA-35jh-r3h4-6jhm・GHSA-r5fr-rjxr-66jc）、minimist に critical が 1 件。 */
const LODASH_MINIMIST = {
  versions: {"lodash": "4.17.20", "minimist": "1.2.5"},
  npm: {
    auditReportVersion: 2,
    vulnerabilities: {
      "lodash": {
        name: "lodash", severity: "high", isDirect: true, effects: [],
        via: [
          { source: 1106913, name: "lodash", dependency: "lodash", title: "Command Injection in lodash", url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm", severity: "high", range: "<4.17.21" },
          { source: 1108258, name: "lodash", dependency: "lodash", title: "Regular Expression Denial of Service (ReDoS) in lodash", url: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9", severity: "moderate", range: ">=4.0.0 <4.17.21" },
          { source: 1115806, name: "lodash", dependency: "lodash", title: "lodash vulnerable to Code Injection via `_.template` imports key names", url: "https://github.com/advisories/GHSA-r5fr-rjxr-66jc", severity: "high", range: ">=4.0.0 <=4.17.23" },
          { source: 1115810, name: "lodash", dependency: "lodash", title: "lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit`", url: "https://github.com/advisories/GHSA-f23m-r3pf-42rh", severity: "moderate", range: "<=4.17.23" },
          { source: 1120370, name: "lodash", dependency: "lodash", title: "Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions", url: "https://github.com/advisories/GHSA-xxjr-mmjv-4gpg", severity: "moderate", range: ">=4.0.0 <=4.17.22" },
        ],
      },
      "minimist": {
        name: "minimist", severity: "critical", isDirect: true, effects: [],
        via: [
          { source: 1097678, name: "minimist", dependency: "minimist", title: "Prototype Pollution in minimist", url: "https://github.com/advisories/GHSA-xvch-5gv4-984h", severity: "critical", range: ">=1.0.0 <1.2.6" },
        ],
      },
    },
    metadata: { vulnerabilities: {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 1, "total": 2} },
  },
  bulk: {
    "lodash": [
      { id: 1106913, url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm", title: "Command Injection in lodash", severity: "high", vulnerable_versions: "<4.17.21" },
      { id: 1108258, url: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9", title: "Regular Expression Denial of Service (ReDoS) in lodash", severity: "moderate", vulnerable_versions: ">=4.0.0 <4.17.21" },
      { id: 1120370, url: "https://github.com/advisories/GHSA-xxjr-mmjv-4gpg", title: "Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions", severity: "moderate", vulnerable_versions: ">=4.0.0 <=4.17.22" },
      { id: 1115806, url: "https://github.com/advisories/GHSA-r5fr-rjxr-66jc", title: "lodash vulnerable to Code Injection via `_.template` imports key names", severity: "high", vulnerable_versions: ">=4.0.0 <=4.17.23" },
      { id: 1115810, url: "https://github.com/advisories/GHSA-f23m-r3pf-42rh", title: "lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit`", severity: "moderate", vulnerable_versions: "<=4.17.23" },
    ],
    "minimist": [
      { id: 1097678, url: "https://github.com/advisories/GHSA-xvch-5gv4-984h", title: "Prototype Pollution in minimist", severity: "critical", vulnerable_versions: ">=1.0.0 <1.2.6" },
    ],
  },
};

/** 記録から、指定したパッケージの分を除いた結果（npm audit の伝播の印も除く）。 */
function without(fixture, name) {
  const vulnerabilities = {};
  for (const [pkg, info] of Object.entries(fixture.npm.vulnerabilities)) {
    if (pkg !== name) vulnerabilities[pkg] = { ...info, via: info.via.filter((v) => v !== name) };
  }
  const versions = { ...fixture.versions };
  delete versions[name];
  const bulk = { ...fixture.bulk };
  delete bulk[name];
  return { versions, npm: { ...fixture.npm, vulnerabilities }, bulk };
}

/**
 * 記録のうち、指定した番号の脆弱性の URL から GHSA の ID を外した結果（2 つの経路の両方）。
 * GHSA の無い実例は見つけていないので、ここだけは作った形。
 */
function withoutGhsa(fixture, numbers) {
  const strip = (entry, number) =>
    numbers.includes(number) ? { ...entry, url: `https://www.npmjs.com/advisories/${number}` } : entry;
  const vulnerabilities = {};
  for (const [pkg, info] of Object.entries(fixture.npm.vulnerabilities)) {
    vulnerabilities[pkg] = { ...info, via: info.via.map((v) => (typeof v === "object" ? strip(v, v.source) : v)) };
  }
  const bulk = {};
  for (const [pkg, list] of Object.entries(fixture.bulk)) bulk[pkg] = list.map((a) => strip(a, a.id));
  return { versions: fixture.versions, npm: { ...fixture.npm, vulnerabilities }, bulk };
}

const FAKE_NPM = `const fs = require("fs");
const path = require("path");
process.stdout.write(fs.readFileSync(path.join(__dirname, "npm-output.json"), "utf8"));
process.exit(1);
`;

const FAKE_FETCH = `const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
async function fakeFetch(url, init) {
  const asked = JSON.parse(init.body);
  fs.appendFileSync(path.join(__dirname, "bulk-requests.jsonl"), JSON.stringify({ url: String(url), asked }) + "\\n");
  const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "bulk.json"), "utf8"));
  const answer = Object.fromEntries(Object.entries(recorded).filter(([name]) => name in asked));
  let body = Buffer.from(JSON.stringify(answer));
  if (process.env.DOCDD_TEST_GZIP === "1") body = zlib.gzipSync(body);
  return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}
Object.defineProperty(globalThis, "fetch", { value: fakeFetch, writable: true, configurable: true });
`;

/**
 * 通信せずに audit-check.mjs を回す。
 * route: "npm" は npm audit の経路。"bulk" は npm がエラーの JSON を返し、直接問い合わせる経路。
 * dev は開発用だけの依存（lock に dev: true で書き、直接の問い合わせに含まれないことを確かめる）。
 */
function auditWithRecord(fixture, allowlist, { route, gzip = false, dev = {} }) {
  const packages = { "": { name: "fixture" } };
  for (const [name, version] of Object.entries(fixture.versions)) packages[`node_modules/${name}`] = { version };
  for (const [name, version] of Object.entries(dev)) packages[`node_modules/${name}`] = { version, dev: true };
  const { dir, script } = auditProject({
    "package-lock.json": `${JSON.stringify({ name: "fixture", lockfileVersion: 3, requires: true, packages }, null, 2)}\n`,
    "scripts/audit-allowlist.json": `${JSON.stringify(allowlist, null, 2)}\n`,
  });
  const bin = path.join(dir, "fake-bin");
  const npmOutput =
    route === "npm"
      ? fixture.npm
      : { message: "request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed", error: { code: "E500" } };
  write(bin, {
    "npm-output.json": JSON.stringify(npmOutput),
    "bulk.json": JSON.stringify(fixture.bulk),
    "fake-npm.cjs": FAKE_NPM,
    "fake-fetch.cjs": FAKE_FETCH,
  });
  writeFileSync(path.join(bin, "npm"), `#!/bin/sh\nexec "${process.execPath}" "${path.join(bin, "fake-npm.cjs")}" "$@"\n`, { mode: 0o755 });
  writeFileSync(path.join(bin, "npm.cmd"), `@"${process.execPath}" "${path.join(bin, "fake-npm.cjs")}" %*\r\n`);
  const r = run("", dir, {
    scriptPath: script,
    nodeArgs: ["--require", path.join(bin, "fake-fetch.cjs")],
    env: { [PATH_KEY]: `${bin}${path.delimiter}${ENV[PATH_KEY] ?? ""}`, DOCDD_TEST_GZIP: gzip ? "1" : "0" },
  });
  const log = path.join(bin, "bulk-requests.jsonl");
  const requests = existsSync(log)
    ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  return { ...r, requests };
}

/** 合否の部分（「audit-check OK」か「audit-check FAILED」から後ろ）。経路の違いで変わる行は除く。 */
function verdict(out) {
  const lines = out.split("\n");
  const at = lines.findIndex((line) => /^audit-check (OK|FAILED)/.test(line));
  assert.notEqual(at, -1, out);
  return lines
    .slice(at)
    .filter((line) => !line.startsWith("audit-check: npm audit が監査レポートを返しませんでした"))
    .join("\n");
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

test("audit: 据え置きの一覧の until を過ぎたら「据え置き期限切れ」で exit 1", () => {
  const { dir, script } = auditProject({ "package-lock.json": LOCK_V3, "scripts/audit-allowlist.json": EXPIRED });
  const r = run("", dir, { scriptPath: script });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /据え置き期限切れ/);
  assert.match(r.out, /lodash GHSA-35jh-r3h4-6jhm（期限 2000-01-01。理由: テスト用の据え置き）/);
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

test("audit: 据え置きの一覧の書き方が違えば、書き方を示して exit 2（古い文字列の形・ids・why・until の欠け）", () => {
  const ok = { ids: ["GHSA-35jh-r3h4-6jhm"], why: "理由", until: "2999-01-01" };
  const cases = [
    ["古い書き方（値が文字列）", "理由だけの古い書き方", /"lodash" は古い書き方です（値が文字列）/],
    ["ids が無い", { why: ok.why, until: ok.until }, /"lodash" に据え置く脆弱性の ID（ids）を 1 件以上/],
    ["ids が空", { ...ok, ids: [] }, /"lodash" に据え置く脆弱性の ID（ids）を 1 件以上/],
    ["ids が GHSA の形でない", { ...ok, ids: ["CVE-2021-23337"] }, /"lodash" の ids は GHSA-xxxx-xxxx-xxxx の形で書いてください（いまの値: "CVE-2021-23337"）/],
    ["why が無い", { ids: ok.ids, until: ok.until }, /"lodash" に「なぜ今直さないか」（why）を書いてください/],
    ["until が無い", { ids: ok.ids, why: ok.why }, /"lodash" に期限（until）を YYYY-MM-DD で書いてください/],
    ["until が日付でない", { ...ok, until: "来月" }, /"lodash" の until は YYYY-MM-DD の日付で書いてください（いまの値: "来月"）/],
  ];
  for (const [label, entry, message] of cases) {
    const { dir, script } = auditProject({
      "package-lock.json": LOCK_V3,
      "scripts/audit-allowlist.json": `${JSON.stringify({ lodash: entry })}\n`,
    });
    const r = run("", dir, { scriptPath: script });
    assert.equal(r.code, 2, `${label}\n${r.out}`);
    assert.match(r.out, message, label);
    assert.match(r.out, /形: \{ "<パッケージ名>": \{ "ids": \["GHSA-xxxx-xxxx-xxxx"\], "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" \} \}/, label);
  }
});

test("audit: 伝わっただけの親（express）は数えず、脆弱性を持つパッケージの GHSA ごとに落とす（npm audit の経路）", () => {
  const r = auditWithRecord(EXPRESS, {}, { route: "npm" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /audit 本番依存の脆弱性: critical=0 high=5 moderate=3 low=6/);
  for (const [pkg, id] of [
    ["body-parser", "GHSA-qwcr-r2fm-qrc7"],
    ["path-to-regexp", "GHSA-37ch-88jc-xwx2"],
    ["path-to-regexp", "GHSA-9wv6-86v2-598j"],
    ["path-to-regexp", "GHSA-rhx6-c78j-4q9w"],
    ["qs", "GHSA-hrpp-h998-j3pp"],
  ]) {
    assert.match(r.out, new RegExp(`\\n {2}- ${pkg} ${id}（high）`), id);
  }
  assert.doesNotMatch(r.out, /\n {2}- express /);
  assert.match(r.out, /"qs": \{ "ids": \["GHSA-hrpp-h998-j3pp"\], "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" \}/);
  assert.doesNotMatch(r.out, /"express": \{ "ids"/);
  assert.deepEqual(r.requests, [], "npm audit の経路では直接問い合わせない");
});

test("audit: 直接問い合わせる経路でも、npm audit の経路と同じ脆弱性で落ちる（開発用だけの依存は問い合わせない）", () => {
  const viaNpm = auditWithRecord(EXPRESS, {}, { route: "npm" });
  const viaBulk = auditWithRecord(EXPRESS, {}, { route: "bulk", dev: { minimist: "1.2.5" } });
  assert.equal(viaBulk.code, 1, viaBulk.out);
  assert.match(viaBulk.out, /bulk advisory endpoint へ直接問い合わせます/);
  assert.match(viaBulk.out, /audit（bulk endpoint 直接問い合わせ） 本番依存の脆弱性: critical=0 high=5 moderate=3 low=6/);
  assert.equal(verdict(viaBulk.out), verdict(viaNpm.out));
  assert.equal(viaBulk.requests.length, 1, viaBulk.out);
  assert.deepEqual(Object.keys(viaBulk.requests[0].asked).sort(), Object.keys(EXPRESS.versions).sort());
  assert.equal(viaBulk.requests[0].url, "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk");
});

test("audit: 脆弱性を持つパッケージの ID を据え置けば、親を書かなくても合格し、据え置き中の ID を出す（2 つの経路で同じ）", () => {
  const allowlist = {
    qs: { ids: ["GHSA-HRPP-H998-J3PP", "GHSA-6rw7-vpxm-498p"], why: "qs の配列の形を受けない", until: "2999-01-01" },
    "path-to-regexp": {
      ids: ["GHSA-9wv6-86v2-598j", "GHSA-rhx6-c78j-4q9w", "GHSA-37ch-88jc-xwx2"],
      why: "ルートは固定",
      until: "2999-01-01",
    },
    "body-parser": { ids: ["GHSA-qwcr-r2fm-qrc7"], why: "urlencoded を使わない", until: "2999-01-01" },
  };
  const viaNpm = auditWithRecord(EXPRESS, allowlist, { route: "npm" });
  assert.equal(viaNpm.code, 0, viaNpm.out);
  assert.match(viaNpm.out, /audit-check OK/);
  assert.match(viaNpm.out, /据え置き中: qs GHSA-hrpp-h998-j3pp（high。期限 2999-01-01。理由: qs の配列の形を受けない）/);
  assert.match(viaNpm.out, /据え置き中: path-to-regexp GHSA-37ch-88jc-xwx2（high。/);
  assert.match(viaNpm.out, /据え置き中: body-parser GHSA-qwcr-r2fm-qrc7（high。/);
  assert.equal(viaNpm.out.match(/据え置き中: /g).length, 5);
  assert.match(viaNpm.out, /いまは本番依存の high として出ていない: qs GHSA-6rw7-vpxm-498p/);

  const viaBulk = auditWithRecord(EXPRESS, allowlist, { route: "bulk", gzip: true });
  assert.equal(viaBulk.code, 0, viaBulk.out);
  assert.equal(verdict(viaBulk.out), verdict(viaNpm.out));
});

test("audit: 一覧にあるパッケージでも、ids に無い脆弱性が出たらパッケージ名と ID を出して exit 1（2 つの経路で同じ）", () => {
  const fixture = without(LODASH_MINIMIST, "minimist");
  const allowlist = { lodash: { ids: ["GHSA-35jh-r3h4-6jhm"], why: "_.template を使っていない", until: "2999-01-01" } };
  const viaNpm = auditWithRecord(fixture, allowlist, { route: "npm" });
  assert.equal(viaNpm.code, 1, viaNpm.out);
  assert.match(viaNpm.out, /\n {2}- lodash GHSA-r5fr-rjxr-66jc（high。据え置きの一覧に無い脆弱性）/);
  assert.match(viaNpm.out, /https:\/\/github\.com\/advisories\/GHSA-r5fr-rjxr-66jc/);
  assert.doesNotMatch(viaNpm.out, /\n {2}- lodash GHSA-35jh-r3h4-6jhm/);
  assert.match(viaNpm.out, /"lodash": \{ "ids": \["GHSA-35jh-r3h4-6jhm", "GHSA-r5fr-rjxr-66jc"\]/);
  assert.match(viaNpm.out, /ids に新しい ID を足し、why をその脆弱性の分まで書き直して/);
  assert.doesNotMatch(viaNpm.out, /critical は据え置けません/);
  assert.doesNotMatch(viaNpm.out, /GHSA の ID が無い high/);

  const viaBulk = auditWithRecord(fixture, allowlist, { route: "bulk" });
  assert.equal(viaBulk.code, 1, viaBulk.out);
  assert.equal(verdict(viaBulk.out), verdict(viaNpm.out));
});

test("audit: critical は一覧に ID を書いても据え置けず exit 1（2 つの経路で同じ）", () => {
  const allowlist = {
    lodash: { ids: ["GHSA-35jh-r3h4-6jhm", "GHSA-r5fr-rjxr-66jc"], why: "_.template を使っていない", until: "2999-01-01" },
    minimist: { ids: ["GHSA-xvch-5gv4-984h"], why: "引数を外から受けない", until: "2999-01-01" },
  };
  const viaNpm = auditWithRecord(LODASH_MINIMIST, allowlist, { route: "npm" });
  assert.equal(viaNpm.code, 1, viaNpm.out);
  assert.match(viaNpm.out, /\n {2}- minimist GHSA-xvch-5gv4-984h（critical。critical は据え置けません）Prototype Pollution in minimist/);
  assert.doesNotMatch(viaNpm.out, /\n {2}- lodash /);
  assert.doesNotMatch(viaNpm.out, /次の形で足せます/);
  assert.match(viaNpm.out, /\ncritical は据え置けません。\n/);
  assert.doesNotMatch(viaNpm.out, /GHSA の ID が無い high/);

  const viaBulk = auditWithRecord(LODASH_MINIMIST, allowlist, { route: "bulk" });
  assert.equal(viaBulk.code, 1, viaBulk.out);
  assert.equal(verdict(viaBulk.out), verdict(viaNpm.out));
});

test("audit: GHSA の ID が無い high は据え置けず、上げるしかないと出して exit 1（critical が無ければ critical の文は出さない。2 つの経路で同じ）", () => {
  const lodashOnly = without(LODASH_MINIMIST, "minimist");

  // high がすべて GHSA 無し: 貼れる JSON は出さない
  const allMissing = withoutGhsa(lodashOnly, [1106913, 1115806]);
  const viaNpm = auditWithRecord(allMissing, {}, { route: "npm" });
  assert.equal(viaNpm.code, 1, viaNpm.out);
  assert.match(viaNpm.out, /\n {2}- lodash npm の番号 1106913（high。GHSA の ID が無いため据え置けません）Command Injection in lodash/);
  assert.match(viaNpm.out, /\n {2}- lodash npm の番号 1115806（high。GHSA の ID が無いため据え置けません）/);
  assert.match(viaNpm.out, /\nGHSA の ID が無い high は一覧に書けないため、依存を上げて直すしかありません。\n/);
  assert.doesNotMatch(viaNpm.out, /critical は据え置けません/);
  assert.doesNotMatch(viaNpm.out, /次の形で足せます/);
  const viaBulk = auditWithRecord(allMissing, {}, { route: "bulk" });
  assert.equal(viaBulk.code, 1, viaBulk.out);
  assert.equal(verdict(viaBulk.out), verdict(viaNpm.out));

  // GHSA のある high と混ざるとき: JSON には GHSA のある分だけ出し、GHSA 無しの分は上げるしかないと出す
  const oneMissing = withoutGhsa(lodashOnly, [1115806]);
  const mixedNpm = auditWithRecord(oneMissing, {}, { route: "npm" });
  assert.equal(mixedNpm.code, 1, mixedNpm.out);
  assert.match(mixedNpm.out, /に次の形で足せます:\n/);
  assert.match(mixedNpm.out, /"lodash": \{ "ids": \["GHSA-35jh-r3h4-6jhm"\], "why"/);
  assert.match(mixedNpm.out, /\nGHSA の ID が無い high は一覧に書けないため、依存を上げて直すしかありません。\n/);
  assert.doesNotMatch(mixedNpm.out, /critical は据え置けません/);
  const mixedBulk = auditWithRecord(oneMissing, {}, { route: "bulk" });
  assert.equal(mixedBulk.code, 1, mixedBulk.out);
  assert.equal(verdict(mixedBulk.out), verdict(mixedNpm.out));
});

const fetchCanBeHidden =
  process.platform !== "win32" &&
  spawnSync(process.execPath, ["--no-experimental-fetch", "-e", "process.exit(typeof fetch === 'function' ? 1 : 0)"])
    .status === 0;

test(
  "audit: npm が使えず fetch も無い Node では「Node.js 18 以上が必要」で exit 2",
  { skip: fetchCanBeHidden ? false : "この Node では fetch を隠せない" },
  () => {
    const { dir, script } = auditProject({
      "package-lock.json": LOCK_V3,
      "scripts/audit-allowlist.json": `${JSON.stringify({ lodash: { ids: ["GHSA-35jh-r3h4-6jhm"], why: "理由", until: "2999-01-01" } })}\n`,
    });
    const emptyBin = path.join(dir, "empty-bin");
    mkdirSync(emptyBin);
    const r = run("", dir, { scriptPath: script, nodeArgs: ["--no-experimental-fetch"], env: { PATH: emptyBin } });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /Node\.js 18 以上が必要です（いまの版: v/);
  },
);

test("check-doc-placeholders: tasks/archive は検査せず、印（docdd:placeholders:off）のある文書も飛ばす", () => {
  const dir = repo({
    "AGENTS.md": "# ガイド\n\n| 型検査 | `npm run typecheck` |\n",
    "tasks/archive/BACKLOG-done.md": "# 控え\n\n昔のプロンプト: {{themes}} を使っていた。\n",
    "docs/prompt.md": "<!-- docdd:placeholders:off -->\n\n# プロンプト\n\nこんにちは {{名前}} さん。\n",
    "docs/spec.md": "# 仕様\n\n| 更新日 | 2026-01-01 |\n",
  });
  const ok = run("check-doc-placeholders.mjs", dir);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /検査から外した文書: 1 件/);

  // 印の無い文書に残った {{…}} は、これまでどおり止める
  write(dir, { "docs/spec.md": "# 仕様\n\n| 更新日 | {{YYYY-MM-DD}} |\n" });
  git(dir, ["add", "--", "docs/spec.md"]);
  const ng = run("check-doc-placeholders.mjs", dir);
  assert.equal(ng.code, 1, ng.out);
  assert.match(ng.out, /docs\/spec\.md:3/);
});

test("check-doc-placeholders: .docdd/manifest.json の placeholdersIgnore でフォルダごと外せる", () => {
  const dir = repo({
    "AGENTS.md": "# ガイド\n",
    "docs/prompt/base.md": "こんにちは {{名前}} さん。\n",
    "docs/prompt/post/one.md": "テーマ: {{テーマ}}\n",
    "docs/spec.md": "# 仕様\n",
    ".docdd/manifest.json": '{\n  "kitVersion": "0.15.1",\n  "placeholdersIgnore": ["docs/prompt/**"],\n  "files": {}\n}\n',
  });
  const ok = run("check-doc-placeholders.mjs", dir);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /検査から外した文書: 2 件/);

  // 並びに無い文書の {{…}} は、これまでどおり止める
  write(dir, { "docs/spec.md": "# 仕様\n\n| 更新日 | {{YYYY-MM-DD}} |\n" });
  git(dir, ["add", "--", "docs/spec.md"]);
  assert.equal(run("check-doc-placeholders.mjs", dir).code, 1);
});
