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

// ---------- 秘密の値の検査（git commit の直前） ----------
// 本物に見えるキーはソースに書かず、実行時に組み立てる（GitHub の push protection などに引っかからないように）。

function seeded(seed) {
  let s = seed;
  return (chars, n) =>
    Array.from({ length: n }, () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return chars[(s >>> 16) % chars.length];
    }).join('');
}
const pick = seeded(7);
const AN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const FAKE = {
  anthropic: () => ['sk', 'ant', 'api03'].join('-') + '-' + pick(AN + '_-', 93) + 'AA',
  openai: () => ['sk', 'proj'].join('-') + '-' + pick(AN, 74) + ['T3Blbk', 'FJ'].join('') + pick(AN, 74),
  aws: () => ['AK', 'IA'].join('') + pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', 16),
  stripeLive: () => ['sk', 'live', ''].join('_') + pick(AN, 24),
  github: () => ['gh', 'p_'].join('') + pick(AN, 36),
  google: () => ['AI', 'za'].join('') + pick(AN, 35),
  jwt: (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'supabase', role, iat: 1700000000 })}.${pick(AN, 43)}`,
  privateKey: () => ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ') + '\n' + pick(AN + '+/', 64) + '\n' + pick(AN + '+/', 64) + '\n-----END RSA PRIVATE KEY-----\n',
};

let repoCount = 0;
function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
}
// docdd のプロジェクト（manifest あり・.env を無視・最初のコミット済み）を新しく作る
function makeRepo({ docddProject = true, commit = true } = {}) {
  const dir = path.join(tmpRoot, `secret-${++repoCount}`);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'commit.gpgsign', 'false');
  if (docddProject) {
    fs.mkdirSync(path.join(dir, '.docdd'));
    fs.writeFileSync(path.join(dir, '.docdd', 'manifest.json'), '{"kitVersion":"0.4.0","files":{}}\n');
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n.env.*\n!.env.example\n');
  if (commit) {
    fs.writeFileSync(path.join(dir, 'README.md'), '# app\n');
    git(dir, 'add', '.gitignore', 'README.md');
    git(dir, 'commit', '-q', '-m', 'init');
  }
  return dir;
}
function write(dir, rel, body) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), body);
}

test('秘密の値: stage した .env は止め、.env.example は通す', () => {
  const repo = makeRepo();
  write(repo, '.env.local', 'OPENAI_API_KEY=abc\n');
  git(repo, 'add', '-f', '.env.local');
  const r = assertBlocked('git commit -m "feat: 設定"', repo);
  assert.match(r.stderr, /\.env の形のファイル/);
  assert.match(r.stderr, /- \.env\.local/);
  assert.match(r.stderr, /git rm --cached/);

  const ok = makeRepo();
  write(ok, '.env.example', 'OPENAI_API_KEY=\nSTRIPE_SECRET_KEY=your-stripe-secret-key\n');
  git(ok, 'add', '.env.example');
  assertAllowed('git commit -m "docs: 設定の見本"', ok);
});

test('秘密の値: git add -f で .env の形を足すのは、それだけで止める', () => {
  const repo = makeRepo();
  write(repo, '.env', 'OPENAI_API_KEY=abc\n');
  write(repo, 'config/.env.production', 'A=1\n');
  write(repo, '.env.example', 'A=\n');
  const r = assertBlocked('git add -f .env', repo);
  assert.match(r.stderr, /git add -f/);
  assertBlocked('git add --force config/.env.production', repo);
  assertBlocked('git add -fv -- .env', repo);
  assertBlocked('git add -f config', repo); // ディレクトリの中の無視された .env
  assertAllowed('git add -f .env.example', repo);
  assertAllowed('git add .env.example', repo);
});

test('秘密の値: stage 済みのファイルの既知の形のキーは止める', () => {
  const repo = makeRepo();
  const key = FAKE.anthropic();
  write(repo, 'src/lib/ai.ts', `export const client = new Anthropic({ apiKey: "${key}" });\n`);
  git(repo, 'add', 'src/lib/ai.ts');
  const r = assertBlocked('git commit -m "feat: AI"', repo);
  assert.match(r.stderr, /src\/lib\/ai\.ts:1 Anthropic の API キー/);
  assert.match(r.stderr, /\.env に移し/);
  assert.match(r.stderr, /docdd-allow-secret/);
  assert.ok(!r.stderr.includes(key), 'キーそのものは出さない');

  for (const [file, body, label] of [
    ['a.ts', `const k = "${FAKE.openai()}";\n`, /OpenAI/],
    ['b.js', `module.exports = { accessKeyId: "${FAKE.aws()}" };\n`, /AWS/],
    ['c.ts', `new Stripe("${FAKE.stripeLive()}");\n`, /Stripe/],
    ['d.yml', `GH_TOKEN: ${FAKE.github()}\n`, /GitHub/],
    ['e.ts', `const firebase = { apiKey: "${FAKE.google()}" };\n`, /Google/],
    ['f.ts', `createClient(url, "${FAKE.jwt('service_role')}");\n`, /service_role/],
    ['g.pem', FAKE.privateKey(), /秘密鍵/],
  ]) {
    const one = makeRepo();
    write(one, file, body);
    git(one, 'add', file);
    assert.match(assertBlocked('git commit -m x', one).stderr, label);
  }
});

test('秘密の値: 同じコマンドで先に git add するファイルも読む', () => {
  const repo = makeRepo();
  write(repo, 'src/lib/chained.ts', `export const key = "${FAKE.openai()}";\n`);
  assertBlocked('git add src/lib/chained.ts && git commit -m "feat(T-03): AI 呼び出し"', repo);
  assertBlocked('git add src && git commit -m x', repo); // ディレクトリで指定
  assertBlocked('cd src && git add lib/chained.ts && git commit -m x', repo);
  assertBlocked('git -C src add lib/chained.ts; git -C src commit -m x', repo);
  // 追跡済みのファイルに足した行（HEAD との差分）
  write(repo, 'README.md', `# app\n\n${FAKE.github()}\n`);
  assertBlocked('git add README.md && git commit -m docs', repo);
  // git commit <パス> も、その中身を読む
  assertBlocked('git commit -m docs README.md', repo);
  // まだコミットが無いリポジトリ
  const fresh = makeRepo({ commit: false });
  write(fresh, 'app.py', `OPENAI_API_KEY = "${FAKE.openai()}"\n`);
  assertBlocked('git add app.py .gitignore && git commit -m init', fresh);
  // .env を無視していないリポジトリで .env を足してコミット
  const noIgnore = makeRepo();
  fs.writeFileSync(path.join(noIgnore, '.gitignore'), 'node_modules/\n');
  write(noIgnore, '.env', 'A=1\n');
  assert.match(assertBlocked('git add .env && git commit -m x', noIgnore).stderr, /- \.env/);
});

test('秘密の値: 名前が secret などの長い文字列は確認を出す', () => {
  const repo = makeRepo();
  write(repo, 'src/lib/webhook.ts', `const WEBHOOK_SECRET = "${pick(AN, 32)}";\n`);
  git(repo, 'add', 'src/lib/webhook.ts');
  const out = assertAsk('git commit -m "feat: webhook"', repo);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /src\/lib\/webhook\.ts:1/);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\.env に移して/);

  const pw = makeRepo();
  write(pw, 'config.py', `DB_PASSWORD = "${['Sup3r', 'Secret', 'Passw0rd2024!'].join('')}"\n`);
  assertAsk('git add config.py && git commit -m x', pw);
  // rm の確認と一緒なら、理由を両方出す
  const both = assertAsk('git add config.py && git commit -m x && rm -rf dist', pw);
  assert.match(both.hookSpecificOutput.permissionDecisionReason, /rm の -r/);
});

test('秘密の値: 見本・環境変数の読み出し・消した行は通す', () => {
  const repo = makeRepo();
  write(repo, 'docs/setup.md', [
    'OpenAI のキーは `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` の形。',
    `Anthropic: ${['sk', 'ant', 'api03'].join('-')}-${'x'.repeat(93)}AA`,
    'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
    'apiKey: "<YOUR_API_KEY>"',
    'token: "your-token-goes-here-1234"',
    'const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";',
    '',
  ].join('\n'));
  write(repo, 'src/lib/env.ts', [
    'export const key = process.env.OPENAI_API_KEY!;',
    'export const url = import.meta.env.VITE_SUPABASE_URL;',
    `export const anon = createClient(url, "${FAKE.jwt('anon')}");`,
    'const secretName = "NEXT_PUBLIC_SUPABASE_ANON_KEY";',
    'const tokenHeader = "x-authorization-token-header";',
    '',
  ].join('\n'));
  write(repo, 'src/i18n/auth.json', '{"login":"ログイン","password":"パスワード"}\n');
  write(repo, '.github/workflows/ci.yml', '      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n');
  write(repo, 'tests/auth.test.ts', 'const token = "test-token-1234567890";\n');
  git(repo, 'add', 'docs/setup.md', 'src', '.github', 'tests');
  assertAllowed('git commit -m x', repo);

  // 秘密の値を消すだけのコミット
  const removal = makeRepo();
  write(removal, 'src/legacy.ts', `export const k = "${FAKE.stripeLive()}"; // docdd-allow-secret\nexport const x = 1;\n`);
  git(removal, 'add', 'src/legacy.ts');
  git(removal, 'commit', '-q', '-m', 'legacy');
  write(removal, 'src/legacy.ts', 'export const x = 1;\n');
  git(removal, 'add', 'src/legacy.ts');
  assertAllowed('git commit -m "fix: キーを消す"', removal);

  // バイナリは読まない
  const bin = makeRepo();
  fs.writeFileSync(path.join(bin, 'logo.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), Buffer.from(FAKE.openai())]));
  assertAllowed('git add logo.png && git commit -m x', bin);
});

test('秘密の値: docdd-allow-secret と書いた行は飛ばす', () => {
  const repo = makeRepo();
  write(repo, 'src/fixtures.ts', `export const fake = "${FAKE.openai()}"; // docdd-allow-secret（テスト用の偽の値）\n`);
  write(repo, 'src/other.py', `PASSWORD = "Sup3rSecretPassw0rd2024!"  # docdd-allow-secret\n`);
  git(repo, 'add', 'src');
  assertAllowed('git commit -m x', repo);
});

test('秘密の値: 中身が 2MB を超えて全部を検査できないときは確認を出す', () => {
  const repo = makeRepo();
  write(repo, 'data/big.txt', 'const value = 1; // 大きな生成ファイル\n'.repeat(80000));
  git(repo, 'add', 'data/big.txt');
  const out = assertAsk('git commit -m data', repo);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /2MB/);
});

test('秘密の値: docdd でないプロジェクトと git commit --dry-run では何もしない', () => {
  const other2 = makeRepo({ docddProject: false });
  write(other2, '.env', 'A=1\n');
  write(other2, 'src/ai.ts', `const k = "${FAKE.anthropic()}";\n`);
  git(other2, 'add', '-f', '.env', 'src/ai.ts');
  assertAllowed('git commit -m x', other2);
  assertAllowed('git add -f .env', other2);

  const repo = makeRepo();
  write(repo, 'src/ai.ts', `const k = "${FAKE.anthropic()}";\n`);
  git(repo, 'add', 'src/ai.ts');
  assertAllowed('git commit --dry-run -m x', repo);
  assertAllowed('git commit --dry -m x', repo);
  assertAllowed('git status && git diff --cached', repo);
  assertBlocked('git commit -m x', repo);
});

test('秘密の値: .env の中のキーは並べず、.env の文面だけを出す', () => {
  // .env はパスだけで止める。中身のキーも並べると「.env に移す」「docdd-allow-secret と書く」の文面が出て、.env の文面と食い違う。
  const staged = makeRepo();
  write(staged, '.env', `OPENAI_API_KEY=${FAKE.openai()}\nDB_PASSWORD="${pick(AN, 24)}"\n`);
  git(staged, 'add', '-f', '.env');
  let r = assertBlocked('git commit -m env', staged);
  assert.match(r.stderr, /\.env の形のファイル/);
  assert.match(r.stderr, /^- \.env$/m);
  assert.doesNotMatch(r.stderr, /秘密の値（API キー・秘密鍵など）の形|docdd-allow-secret|\.env:\d/);

  // 同じコマンドで git add する .env（.env を無視していないリポジトリ）も同じ
  const pending = makeRepo();
  write(pending, '.gitignore', 'node_modules/\n');
  write(pending, '.env.local', `STRIPE_SECRET_KEY=${FAKE.stripeLive()}\n`);
  r = assertBlocked('git add .env.local && git commit -m env', pending);
  assert.match(r.stderr, /^- \.env\.local$/m);
  assert.doesNotMatch(r.stderr, /docdd-allow-secret|\.env\.local:\d/);

  // .env とほかのファイルのキーが両方あれば、文面を 2 つ出す（キーはほかのファイルの分だけ）
  write(staged, 'src/ai.ts', `const k = "${FAKE.anthropic()}";\n`);
  git(staged, 'add', 'src/ai.ts');
  r = assertBlocked('git commit -m both', staged);
  assert.match(r.stderr, /\.env の形のファイル/);
  assert.match(r.stderr, /src\/ai\.ts:1 Anthropic の API キー/);
  assert.doesNotMatch(r.stderr, /\.env:\d/);

  // .env.example は見本のファイルなので、中身は検査する
  const example = makeRepo();
  write(example, '.env.example', `OPENAI_API_KEY=${FAKE.openai()}\n`);
  git(example, 'add', '.env.example');
  r = assertBlocked('git commit -m example', example);
  assert.match(r.stderr, /\.env\.example:1 OpenAI の API キー/);
  assert.doesNotMatch(r.stderr, /\.env の形のファイル/);
});

// ---------- PowerShell ツール ----------

test('秘密の値: 追跡済みのバイナリの .env を同じコマンドで足すのも止め、.env を消すのは通す', () => {
  const repo = makeRepo();
  write(repo, '.env', Buffer.from('KEY=\u0000old\n'));
  git(repo, 'add', '-f', '.env');
  git(repo, 'commit', '-q', '-m', 'track env by mistake');
  write(repo, '.env', Buffer.from('KEY=\u0000new\n'));
  const r = assertBlocked('git add .env && git commit -m x', repo);
  assert.match(r.stderr, /- \.env/);

  const del = makeRepo();
  write(del, '.env', 'OPENAI_API_KEY=abc\n');
  git(del, 'add', '-f', '.env');
  git(del, 'commit', '-q', '-m', 'track env by mistake');
  fs.rmSync(path.join(del, '.env'));
  assertAllowed('git add .env && git commit -m "chore: .env を git から外す"', del);
});

function runPs(command, cwd = docdd) {
  return run(command, cwd, { tool_name: 'PowerShell' });
}

test('PowerShell: git の柵は Bash と同じに効く', () => {
  for (const command of [
    'git add -A',
    'git add .; git commit -m x',
    '& git commit --amend',
    '& "C:\\Program Files\\Git\\cmd\\git.exe" push --force origin main',
    'Set-Location src; git add -A',
    'git commit -m "fix`n[skip ci]"',
    "git commit -m @'\nfix: typo\n\n[skip ci]\n'@",
    "@'\ndocs [skip ci]\n'@ | git commit -F -",
    '$out = git add --all 2>&1',
    'if ($true) { git add -A }',
    'Write-Output $(git add -A)',
  ]) {
    const r = runPs(command);
    assert.equal(r.code, 2, `exit 2 のはず: ${command}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /^docdd: /);
  }
  for (const command of [
    'git add src\\app\\page.tsx CLAUDE.md',
    'git commit -m "説明で skip ci と書く"',
    "git commit -m 'it''s -a fine'",
    'git status > status.txt; git log --oneline -5',
    'Write-Output "git add -A"',
    '# git add -A',
    'git push origin stg',
  ]) {
    const r = runPs(command);
    assert.equal(r.code, 0, `exit 0 のはず: ${command}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `何も出力しないはず: ${command}`);
  }
});

test('PowerShell: Remove-Item の -Recurse・-Force は確認を出す', () => {
  for (const command of [
    'Remove-Item -Recurse -Force dist',
    'Remove-Item dist -Recurse',
    'remove-item .\\build -r',
    'rm -r node_modules',
    'rm -rf node_modules',
    'del .\\out -Force',
    'ri tmp -Recurse:$true',
    'Get-ChildItem *.log | Remove-Item -Force',
  ]) {
    const r = runPs(command);
    assert.equal(r.code, 0, `exit 0 のはず: ${command}\nstderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'ask', command);
  }
  for (const command of ['Remove-Item file.txt', 'Remove-Item -Path a.txt -Filter *.tmp', 'Write-Output "Remove-Item -Recurse x"']) {
    const r = runPs(command);
    assert.equal(r.code, 0, command);
    assert.equal(r.stdout, '', `何も出力しないはず: ${command}`);
  }
  // docdd でないプロジェクトでは何もしない
  assert.equal(runPs('git add -A', other).code, 0);
  assert.equal(runPs('Remove-Item -Recurse dist', other).stdout, '');
});

test('PowerShell: 秘密の値の検査も効く', () => {
  const repo = makeRepo();
  write(repo, 'src/lib/ai.ts', `const key = "${FAKE.anthropic()}";\n`);
  let r = runPs('git add src\\lib\\ai.ts; git commit -m "feat: AI"', repo);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /Anthropic/);
  write(repo, '.env', 'A=1\n');
  r = runPs('git add -f .env', repo);
  assert.equal(r.code, 2, r.stderr);
});

// ---------- hooks.json（hook の登録） ----------
// ここまでのテストは tool_name を直接渡してスクリプトを動かすので、hooks.json の matcher や if が変わっても通ってしまう。
// hooks.json そのものを読み、Bash と PowerShell の両方でこのスクリプトが呼ばれる形かを確かめる。
// 公式: https://code.claude.com/docs/en/hooks （matcher は Bash|PowerShell。if は 1 つのツールにしか合わないので、ツールごとに handler を分ける）

const PLUGIN_ROOT = fileURLToPath(new URL('../plugins/docdd/', import.meta.url));
const HOOK_IFS = ['Bash(git *)', 'Bash(rm *)', 'PowerShell(git *)', 'PowerShell(Remove-Item *)'];

function loadHandlers() {
  const config = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8'));
  // このスクリプトは PreToolUse だけを見る（SessionStart は notify-update.mjs。tests/notify-update.test.mjs で確かめる）
  assert.deepEqual(Object.keys(config.hooks).sort(), ['PreToolUse', 'SessionStart']);
  assert.equal(config.hooks.PreToolUse.length, 1);
  return config.hooks.PreToolUse[0];
}

test('hooks.json: Bash と PowerShell の git・rm・Remove-Item で guard-bash.mjs を呼ぶ', () => {
  const group = loadHandlers();
  assert.equal(group.matcher, 'Bash|PowerShell');
  const tools = group.matcher.split('|');
  assert.deepEqual(group.hooks.map((h) => h.if).sort(), [...HOOK_IFS].sort());
  for (const h of group.hooks) {
    const where = `if: ${h.if}`;
    assert.equal(h.type, 'command', where);
    assert.ok(tools.includes(/^(\w+)\(/.exec(h.if)[1]), `${where} のツールが matcher に入っている`);
    assert.equal(h.command, 'node', where);
    assert.deepEqual(h.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/guard-bash.mjs'], where);
    // ${CLAUDE_PLUGIN_ROOT} をこのリポジトリの場所に置きかえると、このテストで動かしているスクリプトになる
    assert.equal(path.resolve(h.args[0].replace('${CLAUDE_PLUGIN_ROOT}', () => PLUGIN_ROOT)), SCRIPT, where);
    assert.ok(!h.async, `${where} は async にしない（止められなくなる）`);
    assert.ok(Number.isInteger(h.timeout) && h.timeout >= 1 && h.timeout <= 30, `${where} の timeout は 1〜30 秒: ${h.timeout}`);
  }
  // 時間切れの command hook は通してしまうので、秘密の値の検査をする git の handler は上限の 30 秒にしておく
  for (const h of group.hooks.filter((x) => /\(git \*\)$/.test(x.if))) assert.equal(h.timeout, 30, h.if);
});

test('hooks.json: どの handler に合うコマンドでも、スクリプトが反応する', () => {
  const samples = {
    'Bash(git *)': { command: 'git add -A', expect: 'block' },
    'Bash(rm *)': { command: 'rm -rf dist', expect: 'ask' },
    'PowerShell(git *)': { command: 'git add -A', expect: 'block' },
    'PowerShell(Remove-Item *)': { command: 'Remove-Item -Recurse dist', expect: 'ask' },
  };
  for (const h of loadHandlers().hooks) {
    const [, tool, prefix] = /^(\w+)\((.*) \*\)$/.exec(h.if);
    const sample = samples[h.if];
    assert.ok(sample, `見本の無い handler: ${h.if}`);
    assert.ok(sample.command.startsWith(`${prefix} `), `見本 ${sample.command} は ${h.if} に合う`);
    const r = run(sample.command, docdd, { tool_name: tool });
    if (sample.expect === 'block') {
      assert.equal(r.code, 2, `${h.if}: ${sample.command}\nstderr: ${r.stderr}`);
    } else {
      assert.equal(r.code, 0, `${h.if}: ${sample.command}\nstderr: ${r.stderr}`);
      assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask', `${h.if}: ${sample.command}`);
    }
  }
});
