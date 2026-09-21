// plugins/docdd/scripts/notify-update.mjs（SessionStart hook）のテスト。実行: node --test tests/notify-update.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = fileURLToPath(new URL('../plugins/docdd', import.meta.url));
const SCRIPT = path.join(PLUGIN, 'scripts', 'notify-update.mjs');
const KIT_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docdd-notify-'));
process.on('exit', () => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function gitInit(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('git', ['init', '-q'], { cwd: dir });
  if (r.status !== 0) fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
}

/** docdd のプロジェクトを作る。manifest が null なら v0.1 系（manifest なし）として作る。 */
function project(name, manifest) {
  const dir = path.join(tmpRoot, name);
  gitInit(dir);
  if (manifest) {
    fs.mkdirSync(path.join(dir, '.docdd'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.docdd', 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  } else {
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks', 'BACKLOG.md'), '# BACKLOG\n');
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# 開発ガイド\n\n`/docdd:dev-loop` で進める。\n');
  }
  return dir;
}

/** hook として実行する（stdin に SessionStart の入力 JSON を渡す）。 */
function runHook(cwd, { input, env } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    input: input ?? JSON.stringify({ session_id: 'x', cwd, session_start_reason: 'startup' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_PROJECT_DIR: cwd, ...env },
    cwd,
  });
  return { status: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

test('雛形の版が古いと、両方の版と /docdd:update-kit を伝える（exit 0）', () => {
  const dir = project('old-kit', { kitVersion: '0.1.0', files: {} });
  const r = runHook(dir);
  assert.equal(r.status, 0);
  assert.match(r.out, /\/docdd:update-kit/);
  assert.match(r.out, new RegExp(`v${KIT_VERSION.replace(/\./g, '\\.')}`));
  assert.match(r.out, /v0\.1\.0/);
  assert.match(r.out, /勝手に更新しない/);
  assert.equal(r.out.split('\n').length, 1, '1 行だけにする');
});

test('雛形の版が同じなら何も出さない', () => {
  const dir = project('same-kit', { kitVersion: KIT_VERSION, files: {} });
  assert.deepEqual(runHook(dir), { status: 0, out: '', err: '' });
});

test('雛形の版のほうが新しくても何も出さない（開発中のプロジェクト）', () => {
  const dir = project('newer-kit', { kitVersion: '99.0.0', files: {} });
  assert.equal(runHook(dir).out, '');
});

test('manifest に notifyUpdates: false があれば、版がずれていても黙る', () => {
  const dir = project('quiet', { kitVersion: '0.1.0', notifyUpdates: false, files: {} });
  assert.equal(runHook(dir).out, '');
});

test('v0.1 系（manifest なし）には移行を案内する', () => {
  const dir = project('legacy', null);
  const r = runHook(dir);
  assert.match(r.out, /v0\.1 系/);
  assert.match(r.out, /\/docdd:update-kit/);
  assert.match(r.out, /勝手に移行しない/);
});

test('docdd のプロジェクトでなければ何も出さない', () => {
  const dir = path.join(tmpRoot, 'other');
  gitInit(dir);
  fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks', 'BACKLOG.md'), '# BACKLOG\n');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# ふつうの CLAUDE.md\n');
  assert.equal(runHook(dir).out, '');
});

test('サブフォルダで起動すると、docdd を入れたフォルダで開き直すよう伝える', () => {
  const dir = project('sub', { kitVersion: '0.1.0', files: {} });
  const sub = path.join(dir, 'src', 'app');
  fs.mkdirSync(sub, { recursive: true });
  const r = runHook(sub);
  assert.match(r.out, /\/docdd:update-kit/);
  assert.ok(r.out.includes(dir), r.out);
  assert.equal(r.out.split('\n').length, 1);
});

test('git のルートより上は見ない（docdd の中の別リポジトリでは黙る）', () => {
  const outer = project('outer', { kitVersion: '0.1.0', files: {} });
  const inner = path.join(outer, 'vendor', 'lib');
  gitInit(inner);
  assert.equal(runHook(inner).out, '');
});

test('manifest が壊れていても、入力が JSON でなくても、落ちずに黙る', () => {
  const dir = project('broken', { kitVersion: '0.1.0', files: {} });
  fs.writeFileSync(path.join(dir, '.docdd', 'manifest.json'), '{壊れた\n');
  assert.deepEqual(runHook(dir), { status: 0, out: '', err: '' });

  const ok = project('no-json-input', { kitVersion: '0.1.0', files: {} });
  const r = runHook(ok, { input: 'not json' });
  assert.equal(r.status, 0);
  assert.match(r.out, /\/docdd:update-kit/, 'CLAUDE_PROJECT_DIR か cwd で判定する');
});

test('kitVersion が無い manifest では黙る（版を比べられない）', () => {
  const dir = project('no-version', { files: {} });
  assert.equal(runHook(dir).out, '');
});

test('hooks.json が、この script を SessionStart で呼んでいる', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  const entries = hooks.hooks?.SessionStart ?? [];
  const args = entries.flatMap((e) => (e.hooks ?? []).flatMap((h) => h.args ?? []));
  assert.ok(
    args.some((a) => a.includes('notify-update.mjs')),
    'SessionStart から notify-update.mjs を呼ぶ',
  );
  assert.ok(entries.every((e) => typeof e.matcher === 'string' && e.matcher.length > 0));
});
