// plugins/docdd/scripts/guard-bash.mjs（PreToolUse hook）のテスト。実行: node --test tests/guard-bash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../plugins/docdd/scripts/guard-bash.mjs', import.meta.url));

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docdd-guard-'));
process.on('exit', () => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function gitInit(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('git', ['init', '-q'], { cwd: dir });
  if (r.status !== 0) fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
}

// docdd のプロジェクト（v0.2: manifest あり）
const docdd = path.join(tmpRoot, 'docdd-project');
gitInit(docdd);
fs.mkdirSync(path.join(docdd, '.docdd'));
fs.writeFileSync(path.join(docdd, '.docdd', 'manifest.json'), '{"kitVersion":"0.2.0","files":{}}\n');
fs.mkdirSync(path.join(docdd, 'src', 'app'), { recursive: true });
fs.writeFileSync(path.join(docdd, 'msg-skip.txt'), 'fix typo\n\n[skip ci]\n');

// v0.1 系で入れたプロジェクト（manifest なし・BACKLOG と /docdd: を含む CLAUDE.md）
const legacy = path.join(tmpRoot, 'legacy-project');
gitInit(legacy);
fs.mkdirSync(path.join(legacy, 'tasks'));
fs.writeFileSync(path.join(legacy, 'tasks', 'BACKLOG.md'), '# BACKLOG\n');
fs.writeFileSync(path.join(legacy, 'CLAUDE.md'), '# 開発ガイド\n\n`/docdd:dev-loop` で進める。\n');

// docdd ではないプロジェクト
const other = path.join(tmpRoot, 'other-project');
gitInit(other);
fs.mkdirSync(path.join(other, 'tasks'));
fs.writeFileSync(path.join(other, 'tasks', 'BACKLOG.md'), '# BACKLOG\n');
fs.writeFileSync(path.join(other, 'CLAUDE.md'), '# ふつうの CLAUDE.md\n');

// docdd の中にある別の git リポジトリ（git のルートより上は見ない）
const nested = path.join(docdd, 'vendor', 'lib');
gitInit(nested);

function run(command, cwd = docdd, extra = {}) {
  const input = { session_id: 't', hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command }, ...extra };
  return runRaw(JSON.stringify(input));
}

function runRaw(stdin) {
  const r = spawnSync(process.execPath, [SCRIPT], { input: stdin, encoding: 'utf8', timeout: 10000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function assertBlocked(command, cwd) {
  const r = run(command, cwd);
  assert.equal(r.code, 2, `exit 2 のはず: ${command}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  assert.match(r.stderr, /^docdd: /, '理由は stderr に日本語で出る');
  assert.equal(r.stdout, '');
  return r;
}

function assertAllowed(command, cwd) {
  const r = run(command, cwd);
  assert.equal(r.code, 0, `exit 0 のはず: ${command}\nstderr: ${r.stderr}`);
  assert.equal(r.stdout, '', `何も出力しないはず: ${command}`);
  assert.equal(r.stderr, '');
  return r;
}

function assertAsk(command, cwd) {
  const r = run(command, cwd);
  assert.equal(r.code, 0, `exit 0 のはず: ${command}\nstderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^docdd: /);
  return out;
}

test('git add: まとめて stage は止める・パスの明示は通す', () => {
  const r = assertBlocked('git add -A && git commit -m x');
  assert.match(r.stderr, /git add <パス>/);
  assertBlocked('git add .');
  assertBlocked('git add --all');
  assertBlocked('git add :/');
  assertBlocked("git add '*'");
  assertBlocked('git add -vA');
  assertBlocked('git stage .');
  assertBlocked('git -C sub add -A');
  assertBlocked('git -c core.quotepath=false add .');
  assertBlocked('FOO=1 git add -A');
  assertBlocked('npm test\ngit add -A');
  assertAllowed('git add CLAUDE.md docs/PRD.md');
  assertAllowed('git add src/app/page.tsx 2>&1');
  assertAllowed('git add -p src/app/page.tsx');
});

test('git commit: -a・--amend・--no-verify は止める', () => {
  assertBlocked('git commit -am x');
  assertBlocked('git commit -a -m x');
  assertBlocked('git commit --all -m x');
  const amend = assertBlocked('git commit --amend');
  assert.match(amend.stderr, /新しいコミット/);
  assertBlocked('git commit --amend --no-edit');
  assertBlocked('git commit --no-verify -m x');
  assertBlocked('git commit -n -m x');
  assertBlocked('git commit -nm x');
  assertAllowed('git commit -m x');
  assertAllowed('git commit -mat'); // メッセージ "at"（-a ではない）
  assertAllowed('git commit -m "a && git add -A"'); // 引用符の中は区切らない
});

test('git commit: CI 省略の印は止める・印でない文は通す', () => {
  const r = assertBlocked('git commit -m "fix [skip ci]"');
  assert.match(r.stderr, /印/);
  assertBlocked('git commit -m "[ci skip] docs"');
  assertBlocked("git commit -m 'wip [no ci]'");
  assertBlocked('git commit -m "x [Skip Actions]"');
  assertBlocked('git commit -m x -m "[actions skip]"');
  assertBlocked('git commit --message="[skip ci] x"');
  assertBlocked(`git commit -m "$(cat <<'EOF'\nfix: typo\n\n[skip ci]\nEOF\n)"`);
  assertBlocked("git commit -F - <<'EOF'\ndocs: 更新 [skip ci]\nEOF");
  assertBlocked('git commit -F msg-skip.txt');
  assertAllowed('git commit -m "説明で skip ci と書く"');
  assertAllowed(`git commit -m "$(cat <<'EOF'\nfix: don't break (ui)\n\n"quoted" body\nEOF\n)"`);
  assertAllowed('git commit -m x && echo "[skip ci]"');
});

test('引用符の中の < > はリダイレクトではない・\\$( は置換ではない', () => {
  // 引用符で囲んだメッセージが < や > で始まっても、後ろのオプションを見落とさない
  assertBlocked('git commit -m ">= 18 に対応" --amend');
  assertBlocked('git commit -m "<br> 改行" -a');
  assertBlocked('git commit -m "> note [skip ci]"');
  assertBlocked("git commit -m '> quoted' -a");
  assertBlocked("git commit -m $'> ansi' -a");
  assertBlocked('git commit -m \\>note --amend');
  // 引用符の外の > はリダイレクト（引用符で書いた書き込み先も含む）
  assertBlocked('git commit -m 2>"err log" "[skip ci]"');
  assertAllowed('git commit -m x > "out log.txt"');
  // \$( は文字・\\$( や `…` は二重引用符の中でも動くコマンド
  assertAllowed('git commit -m "docs: \\$(git add -A) は使わない"');
  assertBlocked('git commit -m "docs: \\\\$(git add -A)"');
  assertBlocked('git commit -m "use `git add -A`"');
  assertAllowed('git commit -m "use \\`git add -A\\`"');
});

test('git push: 強制 push は止める・ふつうの push は通す', () => {
  const r = assertBlocked('git push --force-with-lease');
  assert.match(r.stderr, /新しいコミット/);
  assertBlocked('git push -f origin main');
  assertBlocked('git push --force origin main');
  assertBlocked('git push -uf origin main');
  assertBlocked('git push --force-with-lease=main:abc origin main');
  assertBlocked('git push origin +main');
  assertAllowed('git push origin stg');
  assertAllowed('git push -u origin feature/x');
  assertAllowed('git status && git log --oneline -5');
});

test('rm: 再帰・強制は確認を出す・ふつうの rm は通す', () => {
  assertAsk('cd x && rm -fr build');
  assertAsk('rm -r -f dist');
  assertAsk('rm -rf node_modules');
  assertAsk('rm -R tmp');
  assertAsk('rm --recursive tmp');
  assertAsk('/bin/rm -f a.txt');
  assertAsk('(cd sub; rm -rf out)');
  assertAsk('echo $(rm -rf build)');
  assertAllowed('rm file.txt');
  assertAllowed('rm -- -rf');
  assertAllowed('echo "rm -rf /"');
  assertAllowed('git rm --cached file.txt');
});

test('止めるものと確認が同時にあれば止める（exit 2）', () => {
  assertBlocked('rm -rf dist && git add -A');
});

test('docdd のプロジェクトの判定', () => {
  // サブディレクトリからでも git のルートまで上って判定する
  assertBlocked('git add -A', path.join(docdd, 'src', 'app'));
  // v0.1 系の構成（BACKLOG＋/docdd: を含む CLAUDE.md）
  assertBlocked('git add -A', legacy);
  assertAsk('rm -rf build', legacy);
  // docdd でないプロジェクトでは何もしない
  assertAllowed('git add -A', other);
  assertAllowed('git push --force', other);
  assertAllowed('rm -rf build', other);
  // 中の別リポジトリ（git のルートで探索をやめる）
  assertAllowed('git add -A', nested);
});

test('読めない入力・対象外の入力では何もしない（exit 0）', () => {
  for (const stdin of ['', '{', 'not json', 'null', '[]', '"git add -A"']) {
    const r = runRaw(stdin);
    assert.equal(r.code, 0, `入力: ${stdin}`);
    assert.equal(r.stdout, '');
  }
  assert.equal(runRaw(JSON.stringify({ cwd: docdd, tool_name: 'Bash', tool_input: {} })).code, 0);
  assert.equal(run('git add -A', docdd, { tool_name: 'Write' }).code, 0);
  // 閉じていない引用符など解析できないコマンドは止めない
  assertAllowed('git add -A "unterminated');
});
