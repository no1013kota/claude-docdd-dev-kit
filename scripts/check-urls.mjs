#!/usr/bin/env node
// 配布リポジトリ用の検査（プラグインには同梱しない）。通信するので、リリースの前に手で回す: `npm run check:urls`。
// Node 18 以上・依存なし。CI には入れない（外部のサイトの一時的な不調で、関係ない変更まで止めないため）。
// README 2 本・RELEASING.md・plugins/docdd/CHANGELOG.md・plugins/docdd の skills・templates・examples に書いた
// http(s) の URL を集め、並列で HEAD（だめなら GET）を送る。開けなかった URL を、書いてある場所と一緒に並べて exit 1。
// - URL は、空白・全角の文字・括弧・引用符・バッククォート・< > { } | の直前で切り、末尾の . , ; : ! ? * を外す
// - 除くもの: localhost・127.0.0.1・0.0.0.0・example.com（サブドメインも）と、<...>・{{...}}・${...}・… の見本を含むもの
// - 転送は最後まで追う。# のあと（ページの中の見出し）までは確かめない
// - GET にも 405（その送り方は受け付けない）を返すものは、ある URL とみなす（POST だけの API など）
// - `node scripts/check-urls.mjs --list`: 通信せずに、集めた URL と書いてある場所だけを出す
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONCURRENCY = 8;
const TIMEOUT_MS = 15000;
const USER_AGENT = "docdd-check-urls (+https://github.com/no1013kota/docdd-dev-kit)";

// URL に使う文字（ASCII のうち、空白・括弧・引用符・バッククォート・< > { } | \ ^ 以外）。全角の文字もここで切れる
// `https://{{…}}` のように // の直後が見本の記号でも、除いたものとして数えるため、// のあとは 0 文字でも拾う
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]*/g;
const TRAILING = /[.,;:!?*]+$/;
// URL の直後がこの文字なら、<owner> や ${…}・{{…}} などの見本
const PLACEHOLDER_NEXT = new Set(["<", "{", "…"]);
const EXCLUDED_HOSTS = [/^localhost$/, /\.localhost$/, /^127\.0\.0\.1$/, /^0\.0\.0\.0$/, /^\[::1\]$/, /(^|\.)example\.(com|org|net)$/];

function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  if (fs.statSync(p).isFile()) {
    out.push(p);
    return out;
  }
  for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    walk(path.join(p, e.name), out);
  }
  return out;
}

/** 調べるファイル（root はテスト用に変えられる）。 */
export function targetFiles(root = ROOT) {
  const plugin = path.join(root, "plugins", "docdd");
  return [
    path.join(root, "README.md"),
    path.join(root, "RELEASING.md"),
    path.join(plugin, "README.md"),
    path.join(plugin, "CHANGELOG.md"),
    path.join(plugin, "skills"),
    path.join(plugin, "templates"),
    path.join(plugin, "examples"),
  ].flatMap((p) => walk(p));
}

/**
 * 文章から URL を取り出す。
 * 返り値: { urls: [{ url, line }], excluded: [{ url, line, reason }] }（line は 1 から）
 */
export function extractUrls(text) {
  const urls = [];
  const excluded = [];
  text.split(/\r?\n/).forEach((lineText, i) => {
    const line = i + 1;
    for (const m of lineText.matchAll(URL_RE)) {
      const next = lineText[m.index + m[0].length] ?? "";
      const url = m[0].replace(TRAILING, "");
      if (PLACEHOLDER_NEXT.has(next)) {
        excluded.push({ url, line, reason: "見本（<...>・{...}・…）" });
        continue;
      }
      let host;
      try {
        host = new URL(url).hostname;
      } catch {
        excluded.push({ url, line, reason: "URL の形でない" });
        continue;
      }
      if (!host || EXCLUDED_HOSTS.some((re) => re.test(host))) {
        excluded.push({ url, line, reason: "見本のホスト" });
        continue;
      }
      urls.push({ url, line });
    }
  });
  return { urls, excluded };
}

/** 対象のファイルから URL を集める。found: URL → ["ファイル:行", …] */
export function collectUrls(root = ROOT) {
  const found = new Map();
  let places = 0;
  let excludedCount = 0;
  for (const file of targetFiles(root)) {
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) continue; // バイナリ
    const { urls, excluded } = extractUrls(buf.toString("utf8"));
    excludedCount += excluded.length;
    const rel = path.relative(root, file).split(path.sep).join("/");
    for (const { url, line } of urls) {
      places++;
      if (!found.has(url)) found.set(url, []);
      found.get(url).push(`${rel}:${line}`);
    }
  }
  return { found, places, excludedCount };
}

async function request(url, method) {
  const res = await fetch(url, {
    method,
    redirect: "follow",
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  try {
    await res.body?.cancel();
  } catch {
    // 中身は読まない
  }
  return res.status;
}

/** HEAD、だめなら GET。{ ok, status } か { ok: false, detail }。 */
export async function checkUrl(url) {
  let detail = "";
  for (const method of ["HEAD", "GET"]) {
    try {
      const status = await request(url, method);
      if (status < 400) return { ok: true, status };
      if (status === 405 && method === "GET") return { ok: true, status };
      detail = status === 429 ? "429（アクセスが多すぎる。時間をおいてもう一度）" : String(status);
    } catch (e) {
      detail = e?.name === "TimeoutError" ? `${TIMEOUT_MS / 1000} 秒待っても応答が無い` : `接続できない（${e?.cause?.code ?? e?.message ?? e}）`;
    }
  }
  return { ok: false, detail };
}

async function main(args) {
  const unknown = args.filter((a) => a !== "--list");
  if (unknown.length) {
    console.error(`check-urls: 知らない引数 ${unknown.join(" ")}（使えるのは --list だけ）`);
    return 2;
  }
  const { found, places, excludedCount } = collectUrls();
  if (args.includes("--list")) {
    for (const [url, locs] of found) console.log(`${url}\t${locs.join(" ")}`);
    console.log(`URL ${found.size} 種類（${places} か所）。除いた見本 ${excludedCount} か所。`);
    return 0;
  }

  console.log(`check-urls: URL ${found.size} 種類（${places} か所）を確かめます。除いた見本 ${excludedCount} か所。`);
  const list = [...found.keys()];
  const results = new Map();
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const url = list[next++];
      results.set(url, await checkUrl(url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

  const failed = list.filter((u) => !results.get(u).ok);
  if (!failed.length) {
    console.log(`check-urls OK — ${list.length} 種類すべて開けた。`);
    return 0;
  }
  console.error(`check-urls FAILED — 開けない URL が ${failed.length} 種類あります`);
  for (const u of failed) console.error(`  - ${results.get(u).detail}  ${u}（${found.get(u).join("・")}）`);
  console.error("サイトの一時的な不調のこともあります。ブラウザで開いて確かめてから、リンクを直してください。");
  return 1;
}

const isMain = (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) process.exitCode = await main(process.argv.slice(2));
