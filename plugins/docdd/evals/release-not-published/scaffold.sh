#!/usr/bin/env bash
# docdd 導入済みで、「反映コマンド」表の『反映の方式』が「まだ公開しない」のプロジェクトを作る。
# push できる相手として、ワークスペースの中に bare リポジトリを作って origin にし（git status には出さない）、
# まだ push していないコミットを 1 件残す。
set -euo pipefail
git init -q
git symbolic-ref HEAD refs/heads/main
git config user.name "docdd eval"
git config user.email "eval@example.com"
git init -q --bare .eval-remote.git
echo ".eval-remote.git/" >> .git/info/exclude
git remote add origin "$PWD/.eval-remote.git"
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
mkdir -p docs tasks
cat > docs/PRD.md <<'MD'
# PRD：よみログ

## 3.1 やること（機能一覧）

| ID | 機能 | 説明 | 優先度 |
|---|---|---|---|
| A-1 | 本を登録する | 書名と著者を入れて保存する | Must |
MD
cat > tasks/BACKLOG.md <<'MD'
# 開発バックログ

## 運用ルール

- ステータス: `todo` → `doing` → `done`。外部要因で進められないものは `blocked`（理由を必ず書く）、取り下げたものは `dropped`（理由を必ず書く）
- WIP = 1（`doing` は常に1件以下）。1タスク = 1コミット
- 優先順: 上のタスクほど優先。「依存」のタスク・要決定が片付いていないタスクには着手しない
- サイズ: S（半日以内）／M（1日）／L（それ以上。分けて起票する）
- 参照の書き方: `PRD A-1 / requirements/<ファイル名> <見出しID>`。requirements がまだ無ければ `PRD A-1（requirements は本タスクで追記）`

## タスク

### T-01: 本を登録できる `todo`
- 参照: PRD A-1（requirements は本タスクで追記） / 依存: なし / サイズ: S
- 完了条件:
  - 書名と著者を入れて保存すると一覧に出る
  - 書名が空なら保存できず、理由が表示される

## 要決定・外部準備（ユーザー作業）
MD
git add package.json CLAUDE.md docs/PRD.md tasks/BACKLOG.md
git commit -q -m "chore: docdd を導入し、最初のタスクを起票"
git push -q origin main
mkdir -p app
cat > app/page.tsx <<'TSX'
export default function Page() {
  return <main>よみログ</main>;
}
TSX
sed -i.bak 's/### T-01: 本を登録できる `todo`/### T-01: 本を登録できる `done`/' tasks/BACKLOG.md
rm tasks/BACKLOG.md.bak
git add app/page.tsx tasks/BACKLOG.md
git commit -q -m "feat(T-01): 本を登録できる"
