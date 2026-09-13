#!/usr/bin/env bash
# 自分で書いた CLAUDE.md が既にある Node.js プロジェクト（docdd 未導入）を作る。
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
    "start": "next start"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
JSON
mkdir -p app
cat > app/page.tsx <<'TSX'
export default function Page() {
  return <main>よみログ</main>;
}
TSX
cat > CLAUDE.md <<'MD'
# よみログ メモ

- 画面の文言は敬体（です・ます）で書く。
- 独自ルール: 本の表紙画像は 200KB 以下にする。
MD
git add package.json app/page.tsx CLAUDE.md
git commit -q -m "chore: アプリの土台とメモ"
