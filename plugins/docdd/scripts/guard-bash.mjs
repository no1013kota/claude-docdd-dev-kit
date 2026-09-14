#!/usr/bin/env node
// docdd guard-bash — Claude Code の PreToolUse hook（Bash ツールと PowerShell ツール用）。
// docdd のプロジェクトでだけ、取り消しにくい git 操作を止め（exit 2）、rm・Remove-Item の再帰・強制削除では確認を出す（permissionDecision "ask"）。
// git commit の直前には、コミットに入る中身から秘密の値（API キー・秘密鍵・.env）を探し、確実な形は止め、怪しい形は確認を出す。
// 依存なし・Node 18 以上。読めない入力・解析の失敗・対象外のプロジェクト・git が動かないときは何もしない（exit 0）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
    'docdd: フォルダごと、または確認なしでファイルを消すコマンド（rm の -r／-R／-f、Remove-Item の -Recurse／-Force）です。' +
    '消す場所が合っているか（大事なファイルや別のフォルダが含まれていないか）を確かめてから許可してください。',
  envForceAdd:
    'docdd: .env の形のファイル（.env・.env.local など）を git add -f（--force）で stage することはできません。' +
    '.gitignore で外しているのは、API キーなどの秘密の値が入るからです。' +
    '設定の見本を共有したいときは、値を空にした .env.example を作り、それを git add してください。',
  envCommit:
    'docdd: .env の形のファイル（.env・.env.local など）はコミットに入れられません。API キーなどの秘密の値が入るからです。' +
    '「git rm --cached <パス>」で stage から外し（作業中のファイルは残ります）、.gitignore に .env と .env.* があるかを確かめてください。' +
    '設定の見本を共有したいときは、値を空にした .env.example をコミットしてください。',
  secretBlock:
    'docdd: コミットに入る中身に、秘密の値（API キー・秘密鍵など）の形があります。コミットすると履歴に残り、漏れると不正に使われるおそれがあります。' +
    'キーは .env に移し、コードでは環境変数から読んでください（process.env.OPENAI_API_KEY など）。直したら、そのファイルをもう一度 git add してください。' +
    '秘密の値でない（偽の値・公開してよい値）なら、運営者に確かめてから、その行に docdd-allow-secret と書いてください。',
  secretAsk:
    'docdd: 秘密の値かもしれない行があります（api_key・secret・token・password などの名前に、長い文字列を直接書いています）。' +
    '本物のキーやパスワードなら許可せず、.env に移して環境変数から読むよう伝えてください。偽の値や公開してよい値なら、許可して構いません。',
  secretTooLarge:
    'docdd: コミットに入る中身が大きく（2MB を超える）、秘密の値の検査を最後までできませんでした。' +
    'API キーや .env が混ざっていないか（git diff --cached --stat などで）確かめてから許可してください。',
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

// ---------- PowerShell の小さな字句解析 ----------
// ' と "（` のエスケープ、'' と ""）、here-string（@' '@・@" "@）、$( ) と @( ) の中のコマンド、# と <# #> のコメント、行末の ` の行継続を扱い、
// ; | && || 改行 ( ) { } でコマンドを区切る。リダイレクト（> >> 2> 2>&1 *> など）は書き込み先ごと飛ばし、コマンドの頭の &（呼び出し演算子）は読み飛ばす。

// src[i] が ' の次の位置。閉じる ' の位置を返す（'' は ' の文字）。
function psSingleEnd(src, i) {
  while (i < src.length) {
    if (src[i] === "'") {
      if (src[i + 1] !== "'") return i;
      i += 2;
      continue;
    }
    i++;
  }
  throw new ParseError("閉じていない '");
}

// src[i] が " の次の位置。閉じる " の位置を返す。subs が配列なら、中で動く $( ) の中身を積む。
function psDoubleEnd(src, i, subs) {
  while (i < src.length) {
    const c = src[i];
    if (c === '`') {
      i += 2;
      continue;
    }
    if (c === '"') {
      if (src[i + 1] !== '"') return i;
      i += 2;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const end = psSubexprEnd(src, i + 2);
      if (subs) subs.push(src.slice(i + 2, end));
      i = end + 1;
      continue;
    }
    i++;
  }
  throw new ParseError('閉じていない "');
}

// src[i] が @' または @" の位置。here-string なら { body, end（続きの位置） }、そうでなければ null。
function psHereString(src, i) {
  const open = /^[ \t]*\r?\n/.exec(src.slice(i + 2, i + 66));
  if (!open) return null;
  const start = i + 2 + open[0].length;
  const close = src[i + 1] === "'" ? /\n'@/g : /\n"@/g;
  close.lastIndex = start - 1;
  const m = close.exec(src);
  if (!m) throw new ParseError('閉じていない here-string');
  return { body: src.slice(start, Math.max(start, m.index)), end: m.index + m[0].length };
}

// src[i] が $( または @( の次の位置。対応する ) の位置を返す。
function psSubexprEnd(src, i) {
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '`') {
      i += 2;
      continue;
    }
    if (c === "'") {
      i = psSingleEnd(src, i + 1) + 1;
      continue;
    }
    if (c === '"') {
      i = psDoubleEnd(src, i + 1) + 1;
      continue;
    }
    if (c === '@' && (src[i + 1] === "'" || src[i + 1] === '"')) {
      const h = psHereString(src, i);
      if (h) {
        i = h.end;
        continue;
      }
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

// 戻り値の形は tokenize と同じ。
function tokenizePowerShell(src) {
  const segments = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quotedAt = -1;
  let dropNext = false; // 次の語はリダイレクトの書き込み先
  let sep = '';

  const endWord = () => {
    if (inWord) {
      if (dropNext) dropNext = false;
      else words.push({ text: word, quotedAt });
    }
    word = '';
    inWord = false;
    quotedAt = -1;
  };
  const addQuoted = (text) => {
    if (quotedAt < 0) quotedAt = word.length;
    word += text;
    inWord = true;
  };
  const endSegment = (nextSep) => {
    endWord();
    dropNext = false;
    if (words.length) segments.push({ words, heredocs: [], sep });
    words = [];
    sep = nextSep;
  };
  const addInner = (inner) => {
    for (const s of tokenizePowerShell(inner)) segments.push({ ...s, sep: s.sep || '(' });
  };
  const addInnerQuietly = (inner) => {
    try {
      addInner(inner);
    } catch {
      // 中身が読めなければ外側のコマンドだけ見る
    }
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];

    if (c === '`') {
      if (src[i + 1] === '\n') {
        i += 2;
        continue;
      }
      if (src[i + 1] === '\r' && src[i + 2] === '\n') {
        i += 3;
        continue;
      }
      addQuoted(i + 1 < n ? src[i + 1] : '');
      i += 2;
      continue;
    }
    if (c === "'") {
      const j = psSingleEnd(src, i + 1);
      addQuoted(src.slice(i + 1, j).replace(/''/g, "'"));
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const subs = [];
      const j = psDoubleEnd(src, i + 1, subs);
      addQuoted(src.slice(i + 1, j).replace(/`([\s\S])/g, '$1').replace(/""/g, '"'));
      subs.forEach(addInnerQuietly);
      i = j + 1;
      continue;
    }
    if (c === '@' && (src[i + 1] === "'" || src[i + 1] === '"') && !inWord) {
      const h = psHereString(src, i);
      if (h) {
        addQuoted(h.body);
        if (src[i + 1] === '"') {
          for (let p = h.body.indexOf('$('); p >= 0; p = h.body.indexOf('$(', p + 2)) {
            try {
              const end = psSubexprEnd(h.body, p + 2);
              addInner(h.body.slice(p + 2, end));
              p = end;
            } catch {
              break;
            }
          }
        }
        i = h.end;
        continue;
      }
    }
    if ((c === '$' || c === '@') && src[i + 1] === '(') {
      const end = psSubexprEnd(src, i + 2);
      word += src.slice(i, end + 1);
      inWord = true;
      addInner(src.slice(i + 2, end));
      i = end + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === '{') {
      const end = src.indexOf('}', i + 2);
      if (end < 0) throw new ParseError('閉じていない ${');
      word += src.slice(i, end + 1);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '<' && src[i + 1] === '#') {
      const end = src.indexOf('#>', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '#' && !inWord) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '>') {
      // 2> や *> の番号は語ではなくリダイレクトの一部
      if (inWord && quotedAt < 0 && /^(?:\d|\*)$/.test(word)) {
        word = '';
        inWord = false;
      } else {
        endWord();
      }
      i += src[i + 1] === '>' ? 2 : 1;
      if (src[i] === '&' && /\d/.test(src[i + 1] || '')) {
        i += 2;
        continue;
      }
      dropNext = true;
      continue;
    }
    if (c === '\n' || c === ';') {
      endSegment(c);
      i += 1;
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') {
        endSegment('&&');
        i += 2;
        continue;
      }
      if (!inWord && !words.length) {
        i += 1; // 呼び出し演算子（& git …・& "C:\…\git.exe" …）
        continue;
      }
      endSegment('&');
      i += 1;
      continue;
    }
    if (c === '|') {
      if (src[i + 1] === '|') {
        endSegment('||');
        i += 2;
        continue;
      }
      endSegment('|');
      i += 1;
      continue;
    }
    if (c === '(' || c === ')' || c === '{' || c === '}') {
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

// dirs は -C <dir> の並び（git はこの順に移動してから動く）
function splitGit(args) {
  let k = 0;
  const dirs = [];
  while (k < args.length && args[k].startsWith('-')) {
    if (args[k] === '-C' && k + 1 < args.length) dirs.push(args[k + 1]);
    if (GIT_GLOBAL_WITH_ARG.has(args[k])) k++;
    k++;
  }
  return { sub: args[k], rest: args.slice(k + 1), dirs };
}

// git add の -f／-u と、stage するパス
function parseAdd(rest) {
  const r = { force: false, update: false, paths: [] };
  let endOfOptions = false;
  for (const a of rest) {
    if (!endOfOptions && a === '--') {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && a.startsWith('--')) {
      const { name } = longName(a);
      if (name.length >= 1 && 'force'.startsWith(name)) r.force = true;
      else if (name.length >= 2 && 'update'.startsWith(name)) r.update = true;
      continue;
    }
    if (!endOfOptions && a.startsWith('-') && a.length > 1) {
      if (a.slice(1).includes('f')) r.force = true;
      if (a.slice(1).includes('u')) r.update = true;
      continue;
    }
    r.paths.push(a);
  }
  return r;
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
  const r = { all: false, amend: false, noVerify: false, dryRun: false, messages: [], files: [], paths: [] };
  for (let k = 0; k < rest.length; k++) {
    const a = rest[k];
    if (a === '--') {
      r.paths.push(...rest.slice(k + 1));
      break;
    }
    if (!a.startsWith('-') || a === '-') {
      r.paths.push(a);
      continue;
    }
    if (a.startsWith('--')) {
      const { name, value } = longName(a);
      if (name.length >= 2 && 'dry-run'.startsWith(name)) r.dryRun = true;
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

const PS_REMOVE = new Set(['remove-item', 'rm', 'del', 'erase', 'rd', 'rmdir', 'ri']);
const CD_BASH = new Set(['cd', 'pushd']);
const CD_PS = new Set(['cd', 'chdir', 'set-location', 'sl', 'push-location', 'pushd']);

// Remove-Item の -Recurse・-Force（PowerShell は引数名を略せる。-f は -Filter と区別できずエラーになるので数えない）
function psRemoveRecursiveOrForce(rest) {
  for (const a of rest) {
    const m = /^-([A-Za-z]+)(?::.*)?$/.exec(a);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if ('recurse'.startsWith(name) || (name.length >= 2 && 'force'.startsWith(name))) return true;
  }
  return false;
}

// cd の行き先（分からなければ null）
function cdTarget(args) {
  const rest = args.filter((a) => a !== '--' && !/^-(?:P|L|e|Path|LiteralPath)$/i.test(a));
  if (rest.length !== 1) return null;
  const t = rest[0];
  if (t === '-' || /[$*?`]/.test(t)) return null;
  if (t === '~' || t.startsWith('~/') || t.startsWith('~\\')) return path.join(os.homedir(), t.slice(1));
  return t;
}

// shell: 'bash' | 'powershell'
function analyze(segments, cwd, shell = 'bash') {
  const ps = shell === 'powershell';
  const blocks = [];
  let ask = false;
  let dir = cwd; // cd を追う
  const adds = [];
  const commits = [];
  // PowerShell（Windows）では、パスを \ で書ける。git はどの OS でも / を受け付けるので、/ に揃える
  const slash = (p) => (ps ? p.replace(/\\/g, "/") : p);
  segments.forEach((seg, index) => {
    let words = commandWords(seg.words);
    if (ps && words.length > 2 && words[0].startsWith('$') && words[1] === '=') words = words.slice(2); // $out = git …
    if (!words.length) return;
    const prog = ps ? programName(words[0]).toLowerCase() : programName(words[0]);
    const shown = words.join(' ').slice(0, 160);
    const block = (msg) => blocks.push(`${msg}\n対象: ${shown}`);

    if ((ps ? CD_PS : CD_BASH).has(prog)) {
      const target = cdTarget(words.slice(1));
      if (target) dir = path.resolve(dir, slash(target));
      return;
    }
    if (ps && PS_REMOVE.has(prog)) {
      const rest = words.slice(1);
      // macOS・Linux の pwsh では rm は OS の rm なので、-rf の形も見る
      if (psRemoveRecursiveOrForce(rest) || (prog === 'rm' && rest.some((a) => /^-[A-Za-z]{1,4}$/.test(a) && /[rRf]/.test(a)))) ask = true;
      return;
    }
    if (prog === 'rm') {
      if (rmRecursiveOrForce(words.slice(1))) ask = true;
      return;
    }
    if (prog !== 'git') return;
    const { sub, rest, dirs } = splitGit(words.slice(1));
    const gitDir = dirs.reduce((d, x) => path.resolve(d, slash(x)), dir);
    if (sub === 'add' || sub === 'stage') {
      if (gitAddStagesEverything(rest)) block(MSG.addAll);
      const a = parseAdd(rest);
      a.paths = a.paths.map(slash);
      if (a.force && a.paths.length && forceAddsEnv(exists(gitDir) ? gitDir : cwd, a.paths)) block(MSG.envForceAdd);
      adds.push({ dir: gitDir, ...a });
    } else if (sub === 'commit') {
      const c = parseCommit(rest);
      if (c.all) block(MSG.commitAll);
      if (c.amend) block(MSG.amend);
      if (c.noVerify) block(MSG.noVerify);
      const texts = [...c.messages, ...seg.heredocs, ...c.files.map((f) => readMessageFile(f, cwd))];
      const prev = segments[index - 1];
      if (seg.sep === '|' && prev) texts.push(prev.words.map((w) => w.text).join(' '), ...prev.heredocs);
      if (texts.some((t) => SKIP_CI_MARK.test(t))) block(MSG.skipCi);
      if (!c.dryRun) commits.push({ dir: gitDir, pending: adds.slice(), paths: c.paths.map(slash) });
    } else if (sub === 'push') {
      if (pushForces(rest)) block(MSG.pushForce);
    }
  });
  return { blocks: [...new Set(blocks)], ask, commits };
}

// ---------- 秘密の値の検査（git commit の直前） ----------
// コミットに入る中身（stage 済みの追加行と、同じコマンドで先に git add するファイル）を読み、
// 確実な形（秘密鍵・既知の形のキー・.env）は止め、怪しい形（名前が secret などの長い文字列）は確認を出す。

const SCAN = { maxScanChars: 2 * 1024 * 1024, maxDiffBuffer: 8 * 1024 * 1024, maxGenericLine: 2000 };
const ALLOW_MARK = 'docdd-allow-secret';

// .env・.env.* は秘密の値が入るファイル。.env.example・.env.sample・.env.template（.env.local.example なども）は見本なので除く。
function isEnvPath(p) {
  const base = String(p).replace(/[\\/]+$/, '').replace(/^.*[\\/]/, '');
  return /^\.env(?:\..+)?$/i.test(base) && !/\.(?:example|sample|template)$/i.test(base);
}

function jwtRole(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

// 見本・伏せ字の形（止めない）
const PLACEHOLDER = /example|sample|dummy|placeholder|your[-_]|x{4,}|\*{4,}|redacted|changeme|(.)\1{7,}/i;

// 止める形。kw のどれかを含む行だけ正規表現を当てる（速さのため）。
const SECRET_RULES = [
  { name: '秘密鍵', kw: ['PRIVATE KEY'], re: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/g, body: true },
  { name: 'AWS のアクセスキー ID', kw: ['AKIA', 'ASIA', 'ABIA', 'ACCA', 'A3T'], re: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g },
  { name: 'Anthropic の API キー', kw: ['sk-ant-'], re: /\bsk-ant-[a-z]{2,10}\d{2}-[A-Za-z0-9_-]{80,}/g },
  {
    name: 'OpenAI の API キー',
    kw: ['sk-'],
    re: /\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}(?![A-Za-z0-9]))/g,
  },
  { name: 'Stripe の本番の秘密キー', kw: ['_live_'], re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/g },
  {
    name: 'GitHub のトークン',
    kw: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'],
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_\w{82})(?![A-Za-z0-9_])/g,
  },
  {
    name: 'Slack のトークン',
    kw: ['xox', 'xapp-', 'hooks.slack.com'],
    re: /\bxox[abeoprs]-\d+-[A-Za-z0-9-]{10,}|\bxoxe(?:\.xox[bp])?-\d-[A-Za-z0-9]{140,}|\bxapp-\d-[A-Za-z0-9]+-\d+-[A-Za-z0-9]{16,}|hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g,
  },
  { name: 'Google の API キー', kw: ['AIza'], re: /\bAIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g },
  {
    name: 'role が service_role の JWT（Supabase など）',
    kw: ['eyJ'],
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    check: (v) => jwtRole(v) === 'service_role',
  },
  { name: 'Supabase の秘密キー', kw: ['sb_secret_'], re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
];

// 確認を出す形: 名前が api_key・secret・token・password などで、16 文字以上の文字列を直接書いている
const SECRET_NAME_HINT = /key|secret|token|passw|pwd/i;
const ENV_REFERENCE = /process\.env|import\.meta\.env|os\.environ|getenv|Deno\.env|ENV\[/i;
const GENERIC_ASSIGN =
  /(?:api[_-]?key|secret|token|passw(?:or)?d|private[_-]?key|access[_-]?key|auth[_-]?key)[A-Za-z0-9_]{0,24}["']?\s*(?::=|=>|[:=])\s*["'`]([^"'`\s]{16,})["'`]/gi;
const DOTENV_ASSIGN =
  /^\s*(?:export\s+)?[A-Z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*([^\s"'`#$]{16,})\s*$/;

function entropy(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  let e = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

function looksLikeSecretValue(v) {
  if (PLACEHOLDER.test(v) || /test|fake|mock/i.test(v)) return false;
  if (/^\$|\$\{|\{\{/.test(v)) return false; // テンプレートの差し込み
  if (/^(?:https?:\/\/|\.{0,2}\/|~\/)/.test(v)) return false; // URL・パス
  if (/^[A-Z][A-Z0-9_]+$/.test(v)) return false; // 環境変数の名前
  if (/^[a-z]+(?:[-_.:][a-z]{2,}\d*)+$/.test(v)) return false; // ことばをつないだ名前（auth-token-header など）
  return entropy(v) >= 3.5;
}

// 秘密鍵の見出しのあとに、鍵の本体（base64 の長い並び）が同じ行か次の行にあるか
function hasKeyBody(rest, next, line) {
  if (/[A-Za-z0-9+/]{40,}/.test(rest)) return true;
  return Boolean(next && next.line === line + 1 && /^[\s"'`]*[A-Za-z0-9+/]{40,}/.test(next.text));
}

const mask = (v) => `${v.slice(0, 7)}…、${v.length} 文字`;

// files: [{ path, added: [{ line, text }] }]。見つけたものを out に足す。検査した文字数が上限を超えたら out.truncated。
// .env の形のファイルはパスだけで止める（envCommit）。中身のキーも並べると「.env に移す」「docdd-allow-secret と書く」の文面が出て食い違うので、読まない。
function scanAddedLines(files, out) {
  for (const f of files) {
    if (isEnvPath(f.path)) {
      out.envPaths.add(f.path);
      continue;
    }
    const lines = f.added;
    for (let i = 0; i < lines.length; i++) {
      const { line, text } = lines[i];
      out.scanned += text.length + 1;
      if (out.scanned > SCAN.maxScanChars) {
        out.truncated = true;
        return;
      }
      if (text.includes(ALLOW_MARK)) continue;
      const where = `${f.path}:${line}`;
      let blocked = false;
      for (const rule of SECRET_RULES) {
        if (!rule.kw.some((k) => text.includes(k))) continue;
        for (const m of text.matchAll(rule.re)) {
          const v = m[0];
          if (rule.body ? !hasKeyBody(text.slice(m.index + v.length), lines[i + 1], line) : PLACEHOLDER.test(v)) continue;
          if (rule.check && !rule.check(v)) continue;
          out.blocks.add(`- ${where} ${rule.name}（${rule.body ? v : mask(v)}）`);
          blocked = true;
        }
      }
      if (blocked || text.length > SCAN.maxGenericLine || !SECRET_NAME_HINT.test(text) || ENV_REFERENCE.test(text)) continue;
      const values = [...text.matchAll(GENERIC_ASSIGN)].map((m) => m[1]);
      const dotenv = DOTENV_ASSIGN.exec(text);
      if (dotenv) values.push(dotenv[1]);
      const hit = values.find(looksLikeSecretValue);
      if (hit) out.asks.add(`- ${where}（${mask(hit)}）`);
    }
  }
}

function unquoteGitPath(p) {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  const bytes = [];
  const ESC = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 };
  for (let i = 1; i < p.length - 1; i++) {
    if (p[i] !== '\\') {
      const cp = p.codePointAt(i);
      bytes.push(...Buffer.from(String.fromCodePoint(cp), 'utf8'));
      if (cp > 0xffff) i++;
      continue;
    }
    const d = p[++i];
    if (/[0-7]/.test(d)) {
      bytes.push(parseInt(p.slice(i, i + 3), 8));
      i += 2;
    } else {
      bytes.push(ESC[d] ?? d.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

// git diff -U0 の出力から、ファイルごとの追加行（新しい側の行番号つき）を取り出す
function parseDiff(text) {
  const files = [];
  let cur = null;
  let ln = 0;
  let inHunk = false;
  for (const raw0 of text.split('\n')) {
    const raw = raw0.endsWith('\r') ? raw0.slice(0, -1) : raw0;
    if (raw.startsWith('diff --git ')) {
      if (cur) settlePath(cur);
      cur = { path: '', added: [], headerPath: headerPath(raw.slice(11)), deleted: false };
      files.push(cur);
      inHunk = false;
      continue;
    }
    if (!cur) continue;
    // 消したファイルは、見出しのパスを使わない（.env を消すコミットを止めないため）
    if (!inHunk && (raw.startsWith('deleted file mode') || raw === '+++ /dev/null' || / and \/dev\/null differ$/.test(raw))) {
      cur.deleted = true;
    }
    if (!inHunk && raw.startsWith('+++ ')) {
      const p = unquoteGitPath(raw.slice(4));
      if (p !== '/dev/null') cur.path = p.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('@@')) {
      inHunk = true;
      const m = /\+(\d+)/.exec(raw);
      ln = m ? Number(m[1]) : 0;
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith('+')) {
      cur.added.push({ line: ln, text: raw.slice(1) });
      ln++;
    } else if (raw.startsWith(' ')) {
      ln++;
    }
  }
  if (cur) settlePath(cur);
  return files;
}

// バイナリの差分には +++ の行が無い。そのときは diff --git の見出しの b/ 側のパスを使う
function settlePath(f) {
  if (!f.path && !f.deleted) f.path = f.headerPath;
  delete f.headerPath;
  delete f.deleted;
}

// 「a/X b/Y」。空白や日本語を含むパスは、引用符で囲まれて来ることがある
function headerPath(s) {
  const q = /(?:^| )("b\/(?:[^"\\]|\\.)*")$/.exec(s);
  if (q) return unquoteGitPath(q[1]).replace(/^b\//, '');
  const i = s.lastIndexOf(' b/');
  return i >= 0 ? s.slice(i + 3) : '';
}

function runGit(args, cwd, maxBuffer = 4 * 1024 * 1024) {
  return spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer,
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
}

const DIFF_ARGS = ['--no-color', '--no-ext-diff', '--no-textconv', '-U0', '--src-prefix=a/', '--dst-prefix=b/'];

// 失敗（リビジョンが無いなど）は null。出力が大きすぎたら読めた分だけ返し、out.truncated にする。
function readDiff(args, cwd, out) {
  const r = runGit(['diff', ...DIFF_ARGS, ...args], cwd, SCAN.maxDiffBuffer);
  if (r.error && r.error.code === 'ENOBUFS') out.truncated = true;
  else if (r.error || r.status !== 0) return null;
  return parseDiff(r.stdout || '');
}

// stage 済みの中身。git が動かない・リポジトリでないときは false。
function collectStaged(dir, out) {
  const names = runGit(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'], dir);
  if (names.error && names.error.code !== 'ENOBUFS') return false;
  if (!names.error && names.status !== 0) return false;
  if (names.error) out.truncated = true;
  const list = (names.stdout || '').split('\0').filter(Boolean);
  for (const p of list) if (isEnvPath(p)) out.envPaths.add(p);
  if (!list.length) return true;
  const files = readDiff(['--cached', '--diff-filter=ACMRT'], dir, out);
  if (files) scanAddedLines(files, out);
  return true;
}

// まだ stage していないファイル（未追跡）をまるごと読む
function readUntracked(dir, rel, out) {
  if (isEnvPath(rel)) {
    out.envPaths.add(rel);
    return;
  }
  if (out.truncated) return;
  const abs = path.join(dir, rel);
  let fd;
  try {
    fd = fs.openSync(abs, 'r');
    const head = Buffer.alloc(8000);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    if (head.subarray(0, n).includes(0)) return; // バイナリ
    if (out.scanned + fs.fstatSync(fd).size > SCAN.maxScanChars) {
      out.truncated = true;
      return;
    }
  } catch {
    return;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return;
  }
  const added = text.split('\n').map((t, k) => ({ line: k + 1, text: t.endsWith('\r') ? t.slice(0, -1) : t }));
  scanAddedLines([{ path: rel, added }], out);
}

// 同じコマンドで git commit より前にある git add（や git commit <パス>）が入れる中身。
// 追跡済みは HEAD との差分の追加行（コミットがまだ無ければ index との差分）、未追跡はファイル全体。
function collectPending({ dir, paths, force, update }, out) {
  if (!paths.length && !update) return;
  const spec = paths.length ? ['--', ...paths] : [];
  const files = readDiff(['HEAD', ...spec], dir, out) || readDiff(spec, dir, out);
  if (files) scanAddedLines(files, out);
  if (!paths.length) return;
  const lists = [['ls-files', '-z', '--others', '--exclude-standard', '--', ...paths]];
  if (force) lists.push(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...paths]);
  for (const args of lists) {
    const r = runGit(args, dir);
    if (r.error || r.status !== 0) continue;
    for (const rel of r.stdout.split('\0')) if (rel) readUntracked(dir, rel, out);
  }
}

// git add -f のパスに .env の形が含まれるか（ディレクトリや * で指したときは、無視されているファイルを git に聞く）
function forceAddsEnv(dir, paths) {
  if (paths.some(isEnvPath)) return true;
  const r = runGit(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...paths], dir);
  return !r.error && r.status === 0 && r.stdout.split('\0').some((p) => p && isEnvPath(p));
}

function listFindings(set) {
  const all = [...set];
  const shown = all.slice(0, 10).join('\n');
  return all.length > 10 ? `${shown}\n- ほか ${all.length - 10} 件` : shown;
}

// commits: [{ dir, pending: [{ dir, paths, force, update }], paths }]
function scanSecrets(commits, cwd) {
  const out = { blocks: new Set(), asks: new Set(), envPaths: new Set(), scanned: 0, truncated: false };
  const usable = (d) => (d && exists(d) ? d : cwd);
  const stagedDone = new Set();
  for (const c of commits) {
    const dir = usable(c.dir);
    if (!stagedDone.has(dir)) {
      stagedDone.add(dir);
      if (!collectStaged(dir, out)) continue;
    }
    const pending = [...c.pending];
    if (c.paths.length) pending.push({ dir: c.dir, paths: c.paths, force: false, update: false });
    for (const p of pending) collectPending({ ...p, dir: usable(p.dir) }, out);
  }
  const blocks = [];
  if (out.envPaths.size) blocks.push(`${MSG.envCommit}\n${listFindings(new Set([...out.envPaths].map((p) => `- ${p}`)))}`);
  if (out.blocks.size) blocks.push(`${MSG.secretBlock}\n${listFindings(out.blocks)}`);
  const asks = [];
  if (out.asks.size) asks.push(`${MSG.secretAsk}\n${listFindings(out.asks)}`);
  if (out.truncated) asks.push(MSG.secretTooLarge);
  return { blocks, asks };
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
  const tool = input.tool_name === undefined ? 'Bash' : input.tool_name;
  if (tool !== 'Bash' && tool !== 'PowerShell') return;
  const shell = tool === 'PowerShell' ? 'powershell' : 'bash';
  const command = input.tool_input && input.tool_input.command;
  const mentions = shell === 'powershell' ? /\b(?:git|rm|remove-item|del|erase|rd|rmdir|ri)\b/i : /\b(?:git|rm)\b/;
  if (typeof command !== 'string' || !mentions.test(command)) return;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (!isDocddProject(cwd)) return;

  let result;
  try {
    result = analyze(shell === 'powershell' ? tokenizePowerShell(command) : tokenize(command), cwd, shell);
  } catch {
    return; // 解析できないコマンドは止めない
  }

  if (result.blocks.length) {
    process.stderr.write(result.blocks.join('\n\n') + '\n');
    process.exitCode = 2;
    return;
  }

  const reasons = [];
  if (result.commits.length) {
    let scan = { blocks: [], asks: [] };
    try {
      scan = scanSecrets(result.commits, cwd);
    } catch {
      // 検査できないときは止めない
    }
    if (scan.blocks.length) {
      process.stderr.write(scan.blocks.join('\n\n') + '\n');
      process.exitCode = 2;
      return;
    }
    reasons.push(...scan.asks);
  }
  if (result.ask) reasons.push(MSG.rmAsk);
  if (reasons.length) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: reasons.join('\n\n'),
        },
      }) + '\n',
    );
  }
}

main().catch(() => {
  process.exitCode = 0;
});
