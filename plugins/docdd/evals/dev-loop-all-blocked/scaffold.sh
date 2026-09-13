#!/usr/bin/env bash
# docdd 導入済みで、todo のタスクが全部「未決の要決定」に依存しているプロジェクトを作る。
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
| E2E（実ブラウザ） | 無い |
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
mkdir -p docs tasks
cat > docs/PRD.md <<'MD'
# PRD：よみログ

## 3.1 やること（機能一覧）

| ID | 機能 | 優先度 |
|---|---|---|
| A-1 | 本を登録する | Must |
| A-2 | 感想を共有する | Should |
MD
cat > tasks/BACKLOG.md <<'MD'
# 開発バックログ

## 運用ルール

- ステータス: `todo` → `doing` → `done`。外部要因で進められない `blocked`、取り下げ `dropped`。
- 未決の要決定（D-番号）に依存するタスクには着手しない。

## タスク

### T-01: 本を登録できる `todo`
- 参照: PRD A-1（requirements は本タスクで追記） / 依存: D-1 / サイズ: M
- 完了条件:
  - 書名と著者を入れて保存すると一覧に出る
  - 書名が空なら保存できず、理由が表示される

### T-02: 感想を共有できる `todo`
- 参照: PRD A-2（requirements は本タスクで追記） / 依存: D-2 / サイズ: M
- 完了条件:
  - 感想を共有にすると共有用の URL が表示される
  - 共有をやめると、その URL は開けなくなる

## 要決定・外部準備（ユーザー作業）

**D-1: 本の情報をどこから取るか** — 手入力だけにするか、外部の書籍 API を使うかで、費用と作りが変わる。
- 状態: 未決
- 案A（推奨）: 手入力だけ（費用なし。入力の手間が増える）
- 案B: 外部の書籍 API で検索して入れる（入力が楽。利用規約と費用の確認が要る）

**D-2: 感想の公開範囲** — 誰でも見られるか、リンクを知っている人だけか。
- 状態: 未決
- 案A（推奨）: リンクを知っている人だけ（検索に出ない）
- 案B: 誰でも見られる（広まりやすい。不適切な投稿への対応が要る）
MD
git add package.json CLAUDE.md docs/PRD.md tasks/BACKLOG.md
git commit -q -m "chore: docdd を導入し、最初のタスクと要決定を起票"
