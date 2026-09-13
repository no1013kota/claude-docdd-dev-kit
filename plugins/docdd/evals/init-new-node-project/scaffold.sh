#!/usr/bin/env bash
# 土台のある Node.js プロジェクト（docdd 未導入・git 管理済み・名前とメール設定済み）を作る。
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
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
JSON
cat > package-lock.json <<'JSON'
{
  "name": "yomilog",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "yomilog",
      "version": "0.1.0"
    }
  }
}
JSON
mkdir -p app
cat > app/page.tsx <<'TSX'
export default function Page() {
  return <main>よみログ</main>;
}
TSX
git add package.json package-lock.json app/page.tsx
git commit -q -m "chore: アプリの土台"
