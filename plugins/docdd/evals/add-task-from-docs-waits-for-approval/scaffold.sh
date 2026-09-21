#!/usr/bin/env bash
# docdd 導入済みで、docs/PRD.md の機能一覧（Must 3 件・Should 1 件）を記入済みのプロジェクトを作る。
# tasks/BACKLOG.md のタスクは「テスト基盤の導入」（done）の 1 件だけ。
set -euo pipefail
git init -q
git config user.name "docdd eval"
git config user.email "eval@example.com"
cat > package.json <<'JSON'
{
  "name": "yomilog",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "node --test"
  }
}
JSON
mkdir -p docs tasks tests
cat > tests/smoke.test.mjs <<'JS'
import test from "node:test";
import assert from "node:assert/strict";

test("smoke", () => {
  assert.equal(1 + 1, 2);
});
JS
cat > CLAUDE.md <<'MD'
# よみログ 開発ガイド

読書記録アプリ。

- 仕様の正本は `docs/`。
- 手順書（スキル）はプラグイン `docdd` が提供する。`/docdd:` と打つと一覧が出る。

<!-- docdd:tables:begin -->
## 検証コマンド

| 用途 | コマンド |
|---|---|
| 開発サーバー起動 | `npm run dev`（http://127.0.0.1:3000 で開く） |
| テスト用 DB | ③ DB 無し |
| 型検査 | 無い |
| lint | 無い |
| 単体・DBテスト | `npm test` |
| ビルド | `npm run build` |
| 本番モード起動 | 無い |
| E2E（実際に動かす） | 無い |
| 全検査（push 前に1回） | `npm test && npm run build` |
| docs の検査 | 無い |
| 未記入欄の検査 | 無い |
| 依存の脆弱性 | 無い |
| 実物1周の費用上限 | 無い |

## 反映コマンド

| 用途 | コマンド・値 |
|---|---|
| 作業ブランチ | main |
| 本番ブランチ | main |
| 反映の方式 | まだ公開しない |
| staging へ反映 | 無い |
| 本番へ反映 | 無い |
| 公開先 URL | 無い |

## スキルへの追加指示

| スキル | 追加指示 |
|---|---|

<!-- docdd:tables:end -->
MD
cat > docs/PRD.md <<'MD'
# PRD：よみログ

| 項目 | 内容 |
|---|---|
| バージョン | v0.1 |
| 更新日 | 2026-09-01 |

## 1. 何を作るか（1段落）

本を読む人が、読んだ本と感想を記録し、あとで振り返れるようにする。

## 2. 使う人

本を月に数冊読む個人。最初に、読み終えた本を 1 冊登録する。

## 3. スコープ

### 3.1 やること（機能一覧）

| ID | 機能 | 説明 | 優先度 |
|---|---|---|---|
| A-1 | 本を登録する | 書名と著者を入れて保存する | Must |
| A-2 | 読んだ本の一覧 | 登録した本を、読み終えた日の新しい順に並べる | Must |
| A-3 | 感想を書く | 本ごとに感想を 1 つ書いて保存する | Must |
| A-4 | 感想を共有する | 感想を共有用の URL で見せる | Should |

### 3.2 やらないこと（最初の版では作らない）

- 複数人での共同編集
- 本の情報を外部の書籍 API から取ること

### 3.3 主な画面（ゲームならシーン）と利用者の流れ

本の一覧 → 本の登録 → 本の詳細（感想を書く）の順に使う。

## 5. 非機能（守りたい性質）

- 黙って壊れない／原因が辿れる／手順を記憶に依存させない

## 6. 変更履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v0.1 | 2026-09-01 | 初版 |
MD
cat > tasks/BACKLOG.md <<'MD'
# 開発バックログ

作業キュー。`/docdd:dev-loop` はこのファイルを読んでタスクを選ぶ。

## 運用ルール

- ステータス: `todo` → `doing` → `done`。外部要因で進められないものは `blocked`（理由を必ず書く）、取り下げたものは `dropped`（理由を必ず書く）
- WIP = 1（`doing` は常に1件以下）。1タスク = 1コミット
- 優先順: 上のタスクほど優先。「依存」のタスク・要決定が片付いていないタスクには着手しない
- サイズ: S（半日以内）／M（1日）／L（それ以上。分けて起票する）
- 参照の書き方: `PRD A-1 / requirements/<ファイル名> <見出しID>`。requirements がまだ無ければ `PRD A-1（requirements は本タスクで追記）`

## タスク

### T-01: テスト基盤の導入 `done`
- 参照: docs/operations/development-and-testing.md §4 / 依存: なし / サイズ: S
- 完了条件:
  - node:test の見本テスト 1 件が緑
  - CLAUDE.md「検証コマンド」表の『単体・DBテスト』行が埋まっている
- 実装メモ: `npm test`（node --test）で tests/ の下を回す

## 要決定・外部準備（ユーザー作業）
MD
git add package.json tests/smoke.test.mjs CLAUDE.md docs/PRD.md tasks/BACKLOG.md
git commit -q -m "chore: docdd を導入し、PRD とテスト基盤を用意"
