#!/usr/bin/env node
// 配布リポジトリ用（プラグインには同梱しない）。`npm test` から呼ぶ。Node 18 以上・依存なし。
// tests/*.test.mjs を名前順に並べて、`node --test` にファイル名で渡す。
// 次の 2 つの書き方は、Node の版や OS で動きが変わるので使わない（2026-09-15 に Node 18.20.8・20.19.5・22.23.1・24.21.0・26.5.0 で確かめた）。
// - `node --test tests/*.test.mjs`: Windows の npm は cmd.exe で動き、* を展開しない。Node 18・20 はそのままの名前を探して「Could not find」で落ちる
// - `node --test tests/`: Node 18・20 はフォルダの中を再帰で探し、test-*.mjs などの補助のファイルまで回す。Node 22 以上は 1 本も回さずに落ちる
// `npm test -- --test-name-pattern=<名前>` のように後ろに付けた引数は、node にそのまま渡す。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = fs.readdirSync(path.join(ROOT, "tests")).filter((n) => n.endsWith(".test.mjs")).sort();

if (!names.length) {
  console.error("run-tests: tests/*.test.mjs が 1 本も無い");
  process.exit(1);
}
// Node 22 以上は、渡した名前を glob のパターンとして読む。パターンの記号を含む名前は、別のファイルに当たるおそれがあるので止める
const odd = names.filter((n) => /[*?[\]{}!]/.test(n));
if (odd.length) {
  console.error(`run-tests: テストのファイル名に glob の記号（* ? [ ] { } !）を使わない: ${odd.join("、")}`);
  process.exit(1);
}

// パスの区切りは / にする（Windows でも読める。\ は glob では記号の打ち消しに読まれることがある）
const files = names.map((n) => `tests/${n}`);
const r = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], { cwd: ROOT, stdio: "inherit" });
if (r.error) {
  console.error(`run-tests: node を起動できなかった（${r.error.message}）`);
  process.exit(1);
}
process.exit(r.status ?? 1);
