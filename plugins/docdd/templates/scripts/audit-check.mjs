#!/usr/bin/env node
// docdd-kit v0.2.0 — scripts/audit-check.mjs（キットが管理するファイル。直すと /docdd:update-kit が差分を見せて聞く）
//
// 依存ライブラリの脆弱性ゲート（npm と package-lock.json を使うプロジェクト向け）。
//
//   node scripts/audit-check.mjs
//
// 判定は **本番依存（--omit=dev）** に対して行う:
//   - critical は必ず失敗（allowlist に関わらず）
//   - high は allowlist 外なら失敗
//   - moderate / low は報告のみ
// devDependencies だけに存在する脆弱性は利用者へ配布されないため、件数の報告に留める。
//
// 終了コード: 0 = 問題なし／1 = 直すものがある（allowlist 外の high・critical、据え置きの期限切れ）／
//             2 = 判定できない（package-lock.json が無い・古い形式、allowlist の書き方の誤り、通信できない など）
//
// npm audit が監査レポートを返さないときは、bulk advisory endpoint へ直接問い合わせる
// （npm が Content-Encoding 無しの gzip 応答を解釈できずに失敗することがあるため）。
// 監査結果を取得できなければ **必ず exit 2 で止める**（「0件」と誤認して素通りさせない）。
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_FILE = path.join(SCRIPT_DIR, "audit-allowlist.json");
const ALLOWLIST_NAME = path.relative(process.cwd(), ALLOWLIST_FILE) || "audit-allowlist.json";
const BULK_ENDPOINT = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/*
  **package-lock.json を探す。** まず scripts/ の 1 つ上（ふつうのプロジェクト）。
  無ければ git の一番上のフォルダ（npm workspaces では lock がそこに 1 つだけできる）。
*/
function findLockFile() {
  const beside = path.join(SCRIPT_DIR, "..", "package-lock.json");
  if (existsSync(beside)) return beside;
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: SCRIPT_DIR, encoding: "utf8" });
  if (!top.error && top.status === 0) {
    const atRoot = path.join(top.stdout.trim(), "package-lock.json");
    if (existsSync(atRoot)) return atRoot;
  }
  return null;
}

/*
  **package-lock.json が無ければ、監査の前に止める。**
  `npm audit` も下のフォールバックも lock を読むので、無いと 2 段の失敗文だけが出て次の一手が読めない。
*/
const LOCK_FILE = findLockFile();
if (!LOCK_FILE) {
  console.error("audit-check: package-lock.json がありません（scripts/ の 1 つ上と、git の一番上のフォルダを探しました）。`npm install` を1回実行して作ってください");
  console.error("  （npm workspaces で複数のパッケージを 1 つのリポジトリに置いている場合は、一番上のフォルダで `npm audit` を回してください）");
  console.error("  （pnpm / yarn のプロジェクトではこの検査は使えません。CLAUDE.md「検証コマンド」表の『依存の脆弱性』行を、そのツールの監査コマンドに書き換えてください）");
  process.exit(2);
}
const LOCK_DIR = path.dirname(LOCK_FILE);
const LOCK_NAME = path.relative(process.cwd(), LOCK_FILE) || "package-lock.json";
if (path.resolve(LOCK_DIR) !== path.resolve(SCRIPT_DIR, "..")) {
  console.log(`audit-check: scripts/ の 1 つ上に package-lock.json が無いため、git の一番上の ${LOCK_NAME} で監査します`);
}

/*
  **古い形式（lockfileVersion 1）は作り直してもらう。** v1 には `packages` が無く、
  npm audit が使えないときの直接問い合わせで依存を 1 件も読めず「0 件」に見えてしまう。
*/
let lock;
try {
  lock = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
} catch (err) {
  console.error(`audit-check: ${LOCK_NAME} を読めません（${err.message}）。\`npm install\` で作り直してください`);
  process.exit(2);
}
if (!(Number(lock?.lockfileVersion) >= 2) || lock.packages === null || typeof lock.packages !== "object") {
  console.error(
    `audit-check: ${LOCK_NAME} が古い形式です（lockfileVersion ${lock?.lockfileVersion ?? "なし"}）。npm 7 以上で \`npm install\` を実行して作り直してください`,
  );
  console.error("  （古い形式のままだと、脆弱性の問い合わせで依存を読めず、見落とすことがあります）");
  process.exit(2);
}

/**
 * 既知の high のうち、すぐには上げられないもの（据え置き）。critical には適用しない。
 *
 * 一覧は隣の `audit-allowlist.json`。値は次のどちらかで、**理由の無い項目は受け付けない**:
 *   { "<package>": { "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" } }   … 期限を過ぎたら exit 1 で知らせる
 *   { "<package>": "<なぜ今直さないか>" }                                     … 期限なし（毎回警告を出す）
 * ファイルが無ければ「何も許さない」（最も厳しい側に倒す）。
 *
 * 据え置きを外すときは、依存を上げる（必要なら package.json の overrides で nested の版も寄せる）
 * → ビルドが通ることを確かめる → 一覧から消す、の順にする。
 */
function isDate(value) {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return new Map();
  const shape = '{ "<パッケージ名>": { "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" } }';
  let raw;
  try {
    raw = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
  } catch (err) {
    console.error(`audit-check: ${ALLOWLIST_NAME} を読めません（${err.message}）。${shape} の形の JSON にしてください`);
    process.exit(2);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    console.error(`audit-check: ${ALLOWLIST_NAME} は ${shape} の形にしてください（据え置きが無ければ {}）`);
    process.exit(2);
  }
  const list = new Map();
  for (const [name, value] of Object.entries(raw)) {
    const entry = typeof value === "string" ? { why: value } : value;
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.why !== "string" ||
      entry.why.trim() === ""
    ) {
      console.error(`audit-check: ${ALLOWLIST_NAME} の "${name}" に「なぜ今直さないか」（why）を書いてください。形: ${shape}`);
      process.exit(2);
    }
    if (entry.until !== undefined && !isDate(entry.until)) {
      console.error(`audit-check: ${ALLOWLIST_NAME} の "${name}" の until は YYYY-MM-DD の日付で書いてください（いまの値: ${JSON.stringify(entry.until)}）`);
      process.exit(2);
    }
    list.set(name, { why: entry.why.trim(), until: entry.until });
  }
  return list;
}
const HIGH_ALLOWLIST = loadAllowlist();

/*
  **据え置きの期限切れは、監査の前に止める。** 期限を決めた据え置きは、その日までに上げる約束。
  脆弱性がまだあるかどうかに関わらず、上げるか・理由を書いて期限を延ばすかを決めてもらう。
*/
const TODAY = today();
const expired = [...HIGH_ALLOWLIST].filter(([, e]) => e.until !== undefined && e.until < TODAY);
if (expired.length > 0) {
  console.error(`audit-check FAILED — 据え置き期限切れ（${ALLOWLIST_NAME} の until を過ぎています。今日は ${TODAY}）:`);
  for (const [name, e] of expired) console.error(`  - ${name}（期限 ${e.until}。理由: ${e.why}）`);
  console.error("依存を上げて一覧から消すか、まだ上げられないなら why に延ばす理由を書き足し、until を新しい日付にしてください。");
  process.exit(1);
}
for (const [name, e] of HIGH_ALLOWLIST) {
  if (e.until === undefined) {
    console.warn(
      `audit-check: 警告 — ${ALLOWLIST_NAME} の "${name}" に期限（until）がありません。{ "why": "…", "until": "YYYY-MM-DD" } の形にすると、期限が来たときにこの検査が知らせます`,
    );
  }
}

function runAudit(extraArgs = "") {
  try {
    // vuln があると npm audit は非0終了するが JSON は stdout に出る。
    return execSync(`npm audit --json ${extraArgs}`.trim(), {
      cwd: LOCK_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    const out = err.stdout ? err.stdout.toString() : "";
    if (out) return out;
    throw err;
  }
}

function parseAudit(extraArgs) {
  try {
    return JSON.parse(runAudit(extraArgs));
  } catch {
    return null;
  }
}

/**
 * registry がエラーを返すと npm は `{ "message": ..., "error": {...} }` を stdout へ出す。
 * これも valid JSON なので、監査レポートの体裁を確認しないと「脆弱性0件」に見えてしまう。
 */
function looksLikeReport(audit) {
  const counts = audit?.metadata?.vulnerabilities;
  return (
    audit?.auditReportVersion !== undefined &&
    counts !== null &&
    typeof counts === "object" &&
    typeof counts.total === "number"
  );
}

/** package-lock.json のインストール済みパッケージを {name: [version]} にする。 */
function lockedPackages({ productionOnly }) {
  const byName = new Map();
  for (const [pkgPath, info] of Object.entries(lock.packages)) {
    if (!pkgPath.includes("node_modules/") || !info.version) continue;
    if (productionOnly && (info.dev || info.devOptional)) continue;
    const name = pkgPath.slice(pkgPath.lastIndexOf("node_modules/") + "node_modules/".length);
    const versions = byName.get(name) ?? new Set();
    versions.add(info.version);
    byName.set(name, versions);
  }
  return Object.fromEntries([...byName].map(([n, v]) => [n, [...v]]));
}

/**
 * `npm audit` が使えないときのフォールバック。npm と違い依存元への伝播は行わず、
 * 実際に advisory を持つパッケージだけを報告する（ゲート判定には十分）。
 */
async function auditViaBulkEndpoint() {
  const packages = lockedPackages({ productionOnly: true });
  const names = Object.keys(packages);
  const found = {};
  const BATCH = 250;
  for (let i = 0; i < names.length; i += BATCH) {
    const body = {};
    for (const n of names.slice(i, i + BATCH)) body[n] = packages[n];
    const res = await fetch(BULK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`bulk endpoint が ${res.status} を返しました`);
    const raw = Buffer.from(await res.arrayBuffer());
    // この endpoint は Content-Encoding を付けずに gzip 本文を返すことがある。
    const text =
      raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    if (!text.trim()) continue;
    Object.assign(found, JSON.parse(text));
  }
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  const vulnerabilities = {};
  for (const [name, advisories] of Object.entries(found)) {
    let worst = "info";
    for (const a of advisories) {
      if (SEVERITY_ORDER.indexOf(a.severity) > SEVERITY_ORDER.indexOf(worst)) worst = a.severity;
    }
    vulnerabilities[name] = { severity: worst };
    counts[worst] += 1;
    counts.total += 1;
  }
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: counts },
    viaFallback: true,
  };
}

// --- 本番依存の監査（判定対象） ---
let prod = parseAudit("--omit=dev");
if (!looksLikeReport(prod)) {
  console.warn(
    `audit-check: npm audit が監査レポートを返しませんでした（${
      prod?.message ?? "npm が無いか、応答に metadata.vulnerabilities がありません"
    }）。bulk advisory endpoint へ直接問い合わせます。`,
  );
  if (typeof fetch !== "function") {
    console.error(`audit-check: 直接の問い合わせには Node.js 18 以上が必要です（いまの版: ${process.version}）。Node.js を上げてからもう一度実行してください`);
    process.exit(2);
  }
  try {
    prod = await auditViaBulkEndpoint();
  } catch (err) {
    const code = err?.cause?.code ? ` / ${err.cause.code}` : "";
    console.error(`audit-check: 監査結果を取得できませんでした（${err?.message ?? err}${code}）`);
    console.error("  → ネットワーク接続と registry.npmjs.org への到達（proxy の設定）を確認して、もう一度実行してください");
    process.exit(2);
  }
}

const counts = prod.metadata?.vulnerabilities ?? {};
const via = prod.viaFallback ? "（bulk endpoint 直接問い合わせ）" : "";
console.log(
  `audit${via} 本番依存: critical=${counts.critical ?? 0} high=${counts.high ?? 0} ` +
    `moderate=${counts.moderate ?? 0} low=${counts.low ?? 0}`,
);

// dev だけの脆弱性は配布されないため、参考として件数だけ出す（取得できたときのみ）。
const all = parseAudit("");
if (looksLikeReport(all)) {
  const a = all.metadata.vulnerabilities;
  console.log(
    `（参考）dev込み: critical=${a.critical} high=${a.high} moderate=${a.moderate} low=${a.low}`,
  );
}

const blocking = [];
for (const [name, info] of Object.entries(prod.vulnerabilities ?? {})) {
  if (info.severity === "critical") blocking.push(`${name} (critical)`);
  else if (info.severity === "high" && !HIGH_ALLOWLIST.has(name)) blocking.push(`${name} (high)`);
}

if (blocking.length > 0) {
  console.error("audit-check FAILED — allowlist 外の high/critical（本番依存）:");
  for (const b of blocking) console.error(`  - ${b}`);
  console.error(
    `依存を上げて直すか、すぐに上げられない high は要決定で合意のうえ ${ALLOWLIST_NAME} に { "<パッケージ名>": { "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" } } の形で足してください（critical は据え置けません）。`,
  );
  process.exit(1);
}

console.log("audit-check OK");
for (const [name, e] of HIGH_ALLOWLIST) {
  if (prod.vulnerabilities?.[name]) {
    console.log(`  allowlisted high: ${name} — ${e.why}${e.until ? `（期限 ${e.until}）` : "（期限なし）"}`);
  }
}
