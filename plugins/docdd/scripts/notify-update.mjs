#!/usr/bin/env node
// docdd notify-update — Claude Code の SessionStart hook。
// docdd のプロジェクトで、プラグインの版とプロジェクトに置いた雛形の版（.docdd/manifest.json の kitVersion）がずれていたら、
// 「運営者に /docdd:update-kit を案内してほしい」と 1 行だけ伝える。ファイルは何も直さない。
// 出力（stdout）は Claude の文脈に入るので、勝手に更新しないことも文に含める。
// 依存なし・Node 18 以上。対象外のプロジェクト・版が同じ・読めない入力では、何も出さずに終わる（exit 0）。
// 知らせを止めたいときは .docdd/manifest.json に "notifyUpdates": false を書く。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = /^(\d+)\.(\d+)\.(\d+)/;

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

function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** cwd から git のルートまで上り、docdd のプロジェクトのルートを返す（無ければ null）。判定は guard-bash と同じ。 */
export function findProjectDir(startDir) {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 128; depth += 1) {
    if (isFile(path.join(dir, '.docdd', 'manifest.json'))) return dir;
    if (isFile(path.join(dir, 'tasks', 'BACKLOG.md'))) {
      try {
        if (fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('/docdd:')) return dir;
      } catch {
        // CLAUDE.md が無い・読めない
      }
    }
    if (exists(path.join(dir, '.git'))) return null; // git のルートより上は見ない
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** a が b より新しければ 1、同じなら 0、古ければ -1。どちらかが読めない版なら null。 */
export function compareVersions(a, b) {
  const ma = VERSION.exec(String(a ?? ''));
  const mb = VERSION.exec(String(b ?? ''));
  if (!ma || !mb) return null;
  for (let i = 1; i <= 3; i += 1) {
    const x = Number(ma[i]);
    const y = Number(mb[i]);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** 伝える文（1 行）。伝えることが無ければ null。 */
export function noticeFor({ pluginVersion, manifestVersion, legacy, root = null }) {
  // サブフォルダで起動したときは、update-kit を打つ場所（docdd を入れたフォルダ）も「」の中で伝える
  const where = root ? `docdd を入れたフォルダ（${String(root).replace(/[\r\n]+/g, ' ')}）で Claude Code を開いてから、` : '';
  if (legacy) {
    return (
      'docdd: このプロジェクトは古い構成（v0.1 系）のままです。' +
      `プラグインは v${pluginVersion} です。運営者に「${where}/docdd:update-kit を実行すると、いまの版の雛形へ移行できます」と 1 行だけ伝えてください。` +
      'あなた（Claude）は雛形を勝手に移行しないでください。'
    );
  }
  if (compareVersions(pluginVersion, manifestVersion) !== 1) return null;
  return (
    `docdd: プラグインは v${pluginVersion}、このプロジェクトに置いた雛形は v${manifestVersion} です。` +
    `運営者に「${where}/docdd:update-kit を実行すると、検査スクリプトや表の行を新しい版へ追随できます（変更点: https://github.com/no1013kota/claude-docdd-dev-kit/blob/main/plugins/docdd/CHANGELOG.md）」と 1 行だけ伝えてください。` +
    'あなた（Claude）は雛形を勝手に更新しないでください。'
  );
}

/** hook の入力（JSON）から作業ディレクトリを読む。読めなければ環境変数か process.cwd()。 */
export function cwdFromInput(text) {
  try {
    const data = JSON.parse(text);
    const cwd = data?.cwd ?? data?.workspace?.current_dir;
    if (typeof cwd === 'string' && cwd) return cwd;
  } catch {
    // 入力が無い・JSON でない
  }
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function run(startDir) {
  const dir = findProjectDir(startDir);
  if (!dir) return null;
  const pluginVersion = readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'))?.version;
  if (!VERSION.test(String(pluginVersion ?? ''))) return null;
  const manifestPath = path.join(dir, '.docdd', 'manifest.json');
  const manifest = readJson(manifestPath);
  if (manifest?.notifyUpdates === false) return null; // 運営者が知らせを止めている
  // manifest が無い（v0.1 系。tasks/BACKLOG.md と CLAUDE.md で見つけた）なら移行を案内する
  const root = path.resolve(startDir) !== dir ? dir : null; // サブフォルダで起動した（そこでは update-kit が上の導入を指すだけになる）
  return noticeFor({ pluginVersion, manifestVersion: manifest?.kitVersion, legacy: !isFile(manifestPath), root });
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let notice = null;
  try {
    notice = run(cwdFromInput(readStdin()));
  } catch {
    notice = null; // 何が起きても、セッションの開始を邪魔しない
  }
  if (notice) process.stdout.write(`${notice}\n`);
  process.exit(0);
}
