#!/usr/bin/env node
// docdd guard-bash — Claude Code の PreToolUse hook（Bash ツール用）。
// docdd のプロジェクトでだけ、取り消しにくい git 操作を止め（exit 2）、rm の再帰・強制削除では確認を出す（permissionDecision "ask"）。
// 依存なし・Node 18 以上。読めない入力・解析の失敗・対象外のプロジェクトでは何もしない（exit 0）。

import fs from 'node:fs';
import path from 'node:path';

// ---------- 止める理由（Claude と運営者に見える。何がだめか＋代わりにどうするか） ----------

const MSG = {
  addAll:
    'docdd: まとめて全部を stage する git add（-A／--all／.／:/／*）は使えません。別の作業の変更や秘密情報（.env など）まで入るおそれがあります。' +
    '代わりに、今回のタスクで変えたファイルだけを「git add <パス> <パス>」のように書いてください。変えたファイルは「git status --short」で確かめられます。',
  commitAll:
    'docdd: git commit -a（変更したファイルを全部まとめてコミット）は使えません。' +
    '代わりに「git add <パス>」で今回のファイルだけを stage してから「git commit -m "…"」を実行してください。',
  amend:
    'docdd: git commit --amend（直前のコミットの書き換え）は使えません。' +
    'コミットは書き換えず、直した分を新しいコミットとして足してください（git add <パス> → git commit -m "…"）。',
  noVerify:
    'docdd: コミット前の検査を飛ばす git commit --no-verify（-n）は使えません。' +
    '検査が落ちた理由を直してから、もう一度 git commit してください。直せないときは運営者に状況を報告してください。',
  skipCi:
    'docdd: コミットメッセージに CI（GitHub で自動で動く検査）を省略する印（[skip ci]・[ci skip]・[no ci]・[skip actions]・[actions skip]）は入れられません。' +
    '印を消したメッセージでコミットし直してください。',
  pushForce:
    'docdd: 強制 push（--force／--force-with-lease／-f／+ブランチ名）はリモートの履歴を上書きするため使えません。' +
    '履歴の書き換え（amend・rebase など）はせず、変更は新しいコミットとして足して、ふつうの git push をしてください。' +
    'push が拒否されたら上書きせず、git pull で取り込むか、運営者に状況を報告してください。',
  rmAsk:
    'docdd: フォルダごと、または確認なしでファイルを消すコマンド（rm の -r／-R／-f）です。' +
    '消す場所が合っているか（大事なファイルや別のフォルダが含まれていないか）を確かめてから許可してください。',
};

const SKIP_CI_MARK = /\[\s*(?:skip ci|ci skip|no ci|skip actions|actions skip)\s*\]/i;

// ---------- 入力 ----------

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

// ---------- docdd のプロジェクトか ----------

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function exists(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

// cwd から git のルートまで上り、.docdd/manifest.json がある、
// または tasks/BACKLOG.md があり CLAUDE.md に「/docdd:」を含むディレクトリがあれば対象。
function isDocddProject(startDir) {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 128; depth++) {
    if (isFile(path.join(dir, '.docdd', 'manifest.json'))) return true;
    if (isFile(path.join(dir, 'tasks', 'BACKLOG.md'))) {
      try {
        if (fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('/docdd:')) return true;
      } catch {
        // CLAUDE.md が無い・読めない
      }
    }
    if (exists(path.join(dir, '.git'))) return false; // git のルートより上は見ない
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  return false;
}

// ---------- シェルの小さな字句解析 ----------
// 引用符（' " $'…'）・バックスラッシュ・行継続・コメント・ヒアドキュメント・$(…) と `…` を扱い、
// && || ; | & 改行 ( ) でコマンドを区切る。完全なシェルではない（別の書き方は settings の許可ルールが受け持つ）。

class ParseError extends Error {}

const HEREDOC_OP = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|([^\s;&|<>()'"`]+))/;

// src[i] が " の次の位置。閉じる " の位置を返す。subs が配列なら、中で動く $(…) と `…` の中身を積む（\$( は文字なので積まない）。
function scanDoubleQuoted(src, i, subs) {
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"') return i;
    if (c === '$' && src[i + 1] === '(') {
      const end = scanSubstitution(src, i + 2);
      if (subs) subs.push(src.slice(i + 2, end));
      i = end + 1;
      continue;
    }
    if (c === '`') {
      const end = scanBacktick(src, i + 1);
      if (subs) subs.push(src.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    i++;
  }
  throw new ParseError('閉じていない "');
}

// src[i] が ` の次の位置。閉じる ` の位置を返す。
function scanBacktick(src, i) {
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '`') return i;
    i++;
  }
  throw new ParseError('閉じていない `');
}

// src[i] が $( の次の位置。対応する ) の位置を返す（中の引用符とヒアドキュメントを飛ばす）。
function scanSubstitution(src, i) {
  let depth = 1;
  const delims = [];
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new ParseError("閉じていない '");
      i = j + 1;
      continue;
    }
    if (c === '"') {
      i = scanDoubleQuoted(src, i + 1) + 1;
      continue;
    }
    if (c === '`') {
      i = scanBacktick(src, i + 1) + 1;
      continue;
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      const m = HEREDOC_OP.exec(src.slice(i));
      if (m) {
        delims.push({ delim: m[2] ?? m[3] ?? m[4], stripTabs: m[1] === '-' });
        i += m[0].length;
        continue;
      }
    }
    if (c === '\n' && delims.length) {
      i = skipHeredocBodies(src, i + 1, delims, null);
      delims.length = 0;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  throw new ParseError('閉じていない $(');
}

// pos は本文の先頭。区切り語の行まで読み、次の位置を返す。bodies が配列なら本文を積む。
function skipHeredocBodies(src, pos, pending, bodies) {
  for (const h of pending) {
    let body = '';
    for (;;) {
      if (pos >= src.length) break;
      const nl = src.indexOf('\n', pos);
      const line = src.slice(pos, nl < 0 ? src.length : nl);
      pos = nl < 0 ? src.length : nl + 1;
      const cmp = h.stripTabs ? line.replace(/^\t+/, '') : line;
      if (cmp === h.delim) break;
      body += line + '\n';
    }
    const target = h.target || bodies;
    if (target) target.push(body);
  }
  return pos;
}

function unescapeDoubleQuoted(raw) {
  return raw.replace(/\\(["\\$`])/g, '$1').replace(/\\\n/g, '');
}

// 戻り値: [{ words: { text, quotedAt }[], heredocs: string[], sep: 直前の区切り（'' | '&&' | '||' | ';' | '|' | '&' | '\n' | '(' | ')'） }]
// quotedAt は text の中で引用符・バックスラッシュで書いた部分が始まる位置（無ければ -1）。そこから先の < > はリダイレクトではない。
function tokenize(src) {
  const segments = [];
  let words = [];
  let heredocs = [];
  let word = '';
  let inWord = false;
  let quotedAt = -1;
  let quotedEnd = 0; // 最後に引用符・バックスラッシュで書いた部分の直後の位置
  let sep = '';
  const pending = [];

  const endWord = () => {
    if (inWord) words.push({ text: word, quotedAt });
    word = '';
    inWord = false;
    quotedAt = -1;
    quotedEnd = 0;
  };
  const addQuoted = (text) => {
    if (quotedAt < 0) quotedAt = word.length;
    word += text;
    quotedEnd = word.length;
    inWord = true;
  };
  const endSegment = (nextSep) => {
    endWord();
    if (words.length || heredocs.length) segments.push({ words, heredocs, sep });
    words = [];
    heredocs = [];
    sep = nextSep;
  };
  const addInner = (inner) => {
    for (const s of tokenize(inner)) segments.push({ ...s, sep: s.sep || '(' });
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    if (c === '\\') {
      if (src[i + 1] === '\n') {
        i += 2;
        continue;
      }
      addQuoted(i + 1 < n ? src[i + 1] : '');
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new ParseError("閉じていない '");
      addQuoted(src.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === "'") {
      let j = i + 2;
      while (j < n && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
      if (j >= n) throw new ParseError("閉じていない $'");
      addQuoted(src.slice(i + 2, j).replace(/\\(.)/g, '$1'));
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const subs = [];
      const j = scanDoubleQuoted(src, i + 1, subs);
      addQuoted(unescapeDoubleQuoted(src.slice(i + 1, j)));
      // "…$(…)…" や "…`…`…" の中で動くコマンドも見る
      for (const inner of subs) {
        try {
          addInner(inner);
        } catch {
          // 中身が読めなければ外側のコマンドだけ見る
        }
      }
      i = j + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const end = scanSubstitution(src, i + 2);
      word += src.slice(i, end + 1);
      inWord = true;
      addInner(src.slice(i + 2, end));
      i = end + 1;
      continue;
    }
    if (c === '`') {
      const end = scanBacktick(src, i + 1);
      word += src.slice(i, end + 1);
      inWord = true;
      addInner(src.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (c === '#' && !inWord) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '<' && src[i + 1] === '<') {
      if (src[i + 2] === '<') {
        endWord();
        i += 3;
        continue;
      }
      const m = HEREDOC_OP.exec(src.slice(i));
      if (m) {
        endWord();
        pending.push({ delim: m[2] ?? m[3] ?? m[4], stripTabs: m[1] === '-', target: heredocs });
        i += m[0].length;
        continue;
      }
    }
    if (c === '\n') {
      let next = i + 1;
      if (pending.length) {
        next = skipHeredocBodies(src, next, pending, null);
        pending.length = 0;
      }
      endSegment('\n');
      i = next;
      continue;
    }
    if (c === ';') {
      endSegment(';');
      i += 1;
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') {
        endSegment('&&');
        i += 2;
        continue;
      }
      // 2>&1 や &>file はリダイレクト（引用符の中の > は文字）
      if ((inWord && /[<>]$/.test(word) && quotedEnd < word.length) || src[i + 1] === '>') {
        word += c;
        inWord = true;
        i += 1;
        continue;
      }
      endSegment('&');
      i += 1;
      continue;
    }
    if (c === '|') {
      if (inWord && /[>]$/.test(word) && quotedEnd < word.length) {
        word += c;
        i += 1;
        continue;
      }
      if (src[i + 1] === '|') {
        endSegment('||');
        i += 2;
        continue;
      }
      endSegment('|');
      i += src[i + 1] === '&' ? 2 : 1;
      continue;
    }
    if (c === '(' || c === ')') {
      endSegment(c);
      i += 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
      i += 1;
      continue;
    }
    word += c;
    inWord = true;
    i += 1;
  }
  endSegment('');
  return segments;
}

// ---------- コマンドの解釈 ----------

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const LEADING_WORDS = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', 'time', 'command', 'builtin', 'exec', 'nohup']);
const REDIRECT = /^(?:\d*|&)(?:>>?|<|>&|<&|>\||&>>?)(.*)$/;

// リダイレクトを除いた単語（文字列）の列。演算子（2> など）が引用符・バックスラッシュより前にある語だけをリダイレクトとみなす。
function stripRedirects(words) {
  const out = [];
  for (let k = 0; k < words.length; k++) {
    const { text, quotedAt } = words[k];
    const m = REDIRECT.exec(text);
    if (m && (quotedAt < 0 || text.length - m[1].length <= quotedAt)) {
      if (m[1] === '' && quotedAt < 0) k++; // 「> file」の file も飛ばす
      continue;
    }
    out.push(text);
  }
  return out;
}

// 先頭の VAR=x・env・予約語を除いたコマンドの単語列
function commandWords(words) {
  const w = stripRedirects(words);
  let k = 0;
  while (k < w.length) {
    if (ASSIGNMENT.test(w[k]) || LEADING_WORDS.has(w[k])) {
      k++;
      continue;
    }
    if (w[k] === 'env') {
      k++;
      while (k < w.length && (w[k].startsWith('-') || ASSIGNMENT.test(w[k]))) {
        if (w[k] === '-u' || w[k] === '-C' || w[k] === '-S') k++;
        k++;
      }
      continue;
    }
    break;
  }
  return w.slice(k);
}

function programName(word) {
  return word.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
}

function longName(arg) {
  const eq = arg.indexOf('=');
  return { name: arg.slice(2, eq < 0 ? undefined : eq), value: eq < 0 ? undefined : arg.slice(eq + 1) };
}

const GIT_GLOBAL_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source']);

function splitGit(args) {
  let k = 0;
  while (k < args.length && args[k].startsWith('-')) {
    if (GIT_GLOBAL_WITH_ARG.has(args[k])) k++;
    k++;
  }
  return { sub: args[k], rest: args.slice(k + 1) };
}

function gitAddStagesEverything(rest) {
  let endOfOptions = false;
  for (const a of rest) {
    if (!endOfOptions && a === '--') {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && a.startsWith('--')) {
      const { name } = longName(a);
      if ((name.length >= 1 && 'all'.startsWith(name)) || name === 'no-ignore-removal') return true;
      continue;
    }
    if (!endOfOptions && a.startsWith('-') && a.length > 1) {
      if (a.slice(1).includes('A')) return true;
      continue;
    }
    if (a === '.' || a === './' || a === ':/' || a === '*') return true;
  }
  return false;
}

const COMMIT_SHORT_WITH_ARG = new Set(['m', 'F', 'c', 'C', 't']);
const COMMIT_SHORT_OPTIONAL = new Set(['S', 'u']);
const COMMIT_LONG_WITH_ARG = new Set(['reuse-message', 'reedit-message', 'template', 'author', 'date', 'cleanup', 'fixup', 'squash', 'trailer', 'pathspec-from-file']);

function parseCommit(rest) {
  const r = { all: false, amend: false, noVerify: false, messages: [], files: [] };
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '--') break;
    if (a.startsWith('--')) {
      const { name, value } = longName(a);
      if (name === 'all') r.all = true;
      else if (name.length >= 2 && 'amend'.startsWith(name)) r.amend = true;
      else if (name.length >= 7 && 'no-verify'.startsWith(name)) r.noVerify = true;
      else if (name === 'message' || name === 'file') {
        const v = value !== undefined ? value : rest[++k];
        if (v !== undefined) (name === 'message' ? r.messages : r.files).push(v);
      } else if (COMMIT_LONG_WITH_ARG.has(name) && value === undefined) k++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let p = 1; p < a.length; p++) {
        const ch = a[p];
        if (COMMIT_SHORT_WITH_ARG.has(ch)) {
          const v = p + 1 < a.length ? a.slice(p + 1) : rest[++k];
          if (v !== undefined && ch === 'm') r.messages.push(v);
          if (v !== undefined && ch === 'F') r.files.push(v);
          break;
        }
        if (COMMIT_SHORT_OPTIONAL.has(ch)) break;
        if (ch === 'a') r.all = true;
        if (ch === 'n') r.noVerify = true;
      }
    }
  }
  return r;
}

const PUSH_LONG_WITH_ARG = new Set(['repo', 'receive-pack', 'exec', 'push-option']);

function pushForces(rest) {
  let endOfOptions = false;
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (!endOfOptions && a === '--') {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && a.startsWith('--')) {
      const { name, value } = longName(a);
      if (name === 'force' || (name.length >= 7 && 'force-with-lease'.startsWith(name))) return true;
      if (PUSH_LONG_WITH_ARG.has(name) && value === undefined) k++;
      continue;
    }
    if (!endOfOptions && a.startsWith('-') && a.length > 1) {
      for (let p = 1; p < a.length; p++) {
        if (a[p] === 'o') {
          if (p + 1 >= a.length) k++;
          break;
        }
        if (a[p] === 'f') return true;
      }
      continue;
    }
    if (a.startsWith('+') && a.length > 1) return true; // +main は強制 push
  }
  return false;
}

function rmRecursiveOrForce(rest) {
  for (const a of rest) {
    if (a === '--') break;
    if (a.startsWith('--')) {
      const { name } = longName(a);
      if (name.length >= 1 && ('recursive'.startsWith(name) || 'force'.startsWith(name))) return true;
      continue;
    }
    if (a.startsWith('-') && a.length > 1 && /[rRf]/.test(a.slice(1))) return true;
  }
  return false;
}

function readMessageFile(file, cwd) {
  if (file === '-') return '';
  try {
    const p = path.resolve(cwd, file);
    if (fs.statSync(p).size > 1024 * 1024) return '';
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function analyze(segments, cwd) {
  const blocks = [];
  let ask = false;
  segments.forEach((seg, index) => {
    const words = commandWords(seg.words);
    if (!words.length) return;
    const prog = programName(words[0]);
    const shown = words.join(' ').slice(0, 160);
    const block = (msg) => blocks.push(`${msg}\n対象: ${shown}`);

    if (prog === 'rm') {
      if (rmRecursiveOrForce(words.slice(1))) ask = true;
      return;
    }
    if (prog !== 'git') return;
    const { sub, rest } = splitGit(words.slice(1));
    if (sub === 'add' || sub === 'stage') {
      if (gitAddStagesEverything(rest)) block(MSG.addAll);
    } else if (sub === 'commit') {
      const c = parseCommit(rest);
      if (c.all) block(MSG.commitAll);
      if (c.amend) block(MSG.amend);
      if (c.noVerify) block(MSG.noVerify);
      const texts = [...c.messages, ...seg.heredocs, ...c.files.map((f) => readMessageFile(f, cwd))];
      const prev = segments[index - 1];
      if (seg.sep === '|' && prev) texts.push(prev.words.map((w) => w.text).join(' '), ...prev.heredocs);
      if (texts.some((t) => SKIP_CI_MARK.test(t))) block(MSG.skipCi);
    } else if (sub === 'push') {
      if (pushForces(rest)) block(MSG.pushForce);
    }
  });
  return { blocks: [...new Set(blocks)], ask };
}

// ---------- 本体 ----------

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  if (!input || typeof input !== 'object') return;
  if (input.tool_name !== undefined && input.tool_name !== 'Bash') return;
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || !/\b(?:git|rm)\b/.test(command)) return;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (!isDocddProject(cwd)) return;

  let result;
  try {
    result = analyze(tokenize(command), cwd);
  } catch {
    return; // 解析できないコマンドは止めない
  }

  if (result.blocks.length) {
    process.stderr.write(result.blocks.join('\n\n') + '\n');
    process.exitCode = 2;
    return;
  }
  if (result.ask) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: MSG.rmAsk,
        },
      }) + '\n',
    );
  }
}

main().catch(() => {
  process.exitCode = 0;
});
