#!/usr/bin/env node
// 配布リポジトリ用の検査（プラグインには同梱しない）。`npm run check` から呼ぶ。Node 18 以上・依存なし。
// プラグインの版（plugins/docdd/.claude-plugin/plugin.json の version）と、次が一致するかを見る。
// - 雛形の刻印「docdd-kit vX.Y.Z」: templates/.claude/rules/docdd-kit.md と templates/scripts/*.mjs は先頭 3 行以内に必須。
//   ほかの雛形ファイルに刻印があれば、それも同じ版か
// - plugins/docdd/CHANGELOG.md の先頭の版見出し（## 0.2.0 …）
// - plugins/docdd/scripts/init.mjs が plugin.json を読めないときに使う版（FALLBACK_VERSION）
// - .claude-plugin/marketplace.json に version を書いていないこと（公式: 両方に書くと plugin.json が黙って勝つ）
// 問題があれば日本語で列挙して exit 1。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(ROOT, "plugins", "docdd");
const TEMPLATES = path.join(PLUGIN, "templates");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const STAMP = /docdd-kit v(\d+\.\d+\.\d+)/g;
const problems = [];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    problems.push(`読めない: ${rel(file)}（${e.message}）`);
    return null;
  }
}

function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  if (fs.statSync(p).isFile()) {
    out.push(p);
    return out;
  }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) walk(path.join(p, e.name), out);
  return out;
}

const pluginJson = readJson(path.join(PLUGIN, ".claude-plugin", "plugin.json"));
const version = pluginJson?.version;
if (pluginJson && !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  problems.push(`plugin.json の version が X.Y.Z の形でない（いまの値: ${version ?? "なし"}）`);
}

if (version) {
  // marketplace.json
  const market = readJson(path.join(ROOT, ".claude-plugin", "marketplace.json"));
  if (market) {
    if (market.metadata?.version !== undefined) {
      problems.push(`.claude-plugin/marketplace.json の metadata.version を消す（版は plugin.json だけに書く。いまの値: ${market.metadata.version}）`);
    }
    for (const entry of market.plugins ?? []) {
      if (entry.name === pluginJson.name && entry.version !== undefined) {
        problems.push(`.claude-plugin/marketplace.json の plugins「${entry.name}」の version を消す（版は plugin.json だけに書く。いまの値: ${entry.version}）`);
      }
    }
  }

  // 雛形の刻印
  const required = [
    path.join(TEMPLATES, ".claude", "rules", "docdd-kit.md"),
    ...fs.readdirSync(path.join(TEMPLATES, "scripts")).filter((n) => n.endsWith(".mjs")).map((n) => path.join(TEMPLATES, "scripts", n)),
  ];
  let stampCount = 0;
  for (const file of walk(TEMPLATES)) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    let inHead = false;
    lines.forEach((line, idx) => {
      for (const m of line.matchAll(STAMP)) {
        stampCount++;
        if (idx < 3) inHead = true;
        if (m[1] !== version) problems.push(`雛形の刻印が違う: ${rel(file)}:${idx + 1}  docdd-kit v${m[1]}（plugin.json は ${version}）`);
      }
    });
    if (required.includes(file) && !inHead) problems.push(`先頭 3 行以内に刻印「docdd-kit v${version}」が無い: ${rel(file)}`);
  }

  // CHANGELOG
  const changelog = path.join(PLUGIN, "CHANGELOG.md");
  if (!fs.existsSync(changelog)) {
    problems.push(`plugins/docdd/CHANGELOG.md が無い`);
  } else {
    const m = fs.readFileSync(changelog, "utf8").match(/^##\s+\[?v?(\d+\.\d+\.\d+)/m);
    if (!m) problems.push(`CHANGELOG.md に版の見出し（## ${version} …）が無い`);
    else if (m[1] !== version) problems.push(`CHANGELOG.md の先頭の版が ${m[1]}（plugin.json は ${version}。新しい版を先頭に書く）`);
  }

  // init.mjs の既定の版
  const initMjs = path.join(PLUGIN, "scripts", "init.mjs");
  const im = fs.existsSync(initMjs) && fs.readFileSync(initMjs, "utf8").match(/const\s+FALLBACK_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/);
  if (!im) problems.push(`plugins/docdd/scripts/init.mjs に FALLBACK_VERSION が見つからない`);
  else if (im[1] !== version) problems.push(`init.mjs の FALLBACK_VERSION が ${im[1]}（plugin.json は ${version}）`);

  if (!problems.length) {
    console.log(`check-version-stamps OK — v${version}（plugin.json）に、雛形の刻印 ${stampCount} 件・CHANGELOG の先頭・init.mjs の既定の版が一致。marketplace.json に version なし。`);
    process.exit(0);
  }
}

console.error(`check-version-stamps FAILED — 直すところが ${problems.length} 件あります`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
