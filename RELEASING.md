# リリース手順（著者用）

1. `plugins/docdd/CHANGELOG.md` の先頭に新しい版を書く（追加・変更・削除と「雛形への影響: あり／なし（対象）」）。
2. `plugins/docdd/.claude-plugin/plugin.json` の `version` を上げる（`.claude-plugin/marketplace.json` には版を書かない）。
3. 雛形の刻印 `docdd-kit vX.Y.Z`（templates の rules と scripts/*.mjs）と `plugins/docdd/scripts/init.mjs` の `FALLBACK_VERSION` を揃え、`node scripts/check-version-stamps.mjs` で確かめる。
4. `npm test`（Node 18 以上・git 2.32 以上。v0.1.4 の移行テストは履歴全体が要る）。
5. `claude plugin validate --strict .` と `claude plugin validate --strict plugins/docdd`。CI（`.github/workflows/ci.yml`）の Claude Code は `@anthropic-ai/claude-code@2.1.270` に固定している。検証に使う版を上げるときは、ここも上げる。
6. `node scripts/check-skill-refs.mjs`（3・6 はまとめて `npm run check`）。
7. 空の git リポジトリで `claude --plugin-dir <このリポジトリ>/plugins/docdd` を起動し、`/docdd:init` を最後まで通す。
8. 雛形の `.mcp.json` の版を `npm view shadcn version` と `npm view next-devtools-mcp version` で確かめて上げ、Next.js のプロジェクトで 1 回起動確認する。
9. evals（手動・費用が出る）: `claude plugin eval plugins/docdd --trust-plugin --scaffold --runs 1 --ablation none --threshold 0.8 --no-publish --max-cost-usd 10 --allow-tools Bash Write Edit`。
   - 6 ケースで約 4 ドル（2026-09-14 の実績）。macOS では評価のサンドボックスの中で `/usr/bin/git`（xcrun）が一時キャッシュを書けず、git が動かないことがある（ログに `xcrun_db` と `Operation not permitted`）。そのケースだけ `--case <名前>` で回し直し、ログで原因を確かめてから判断する。
10. コミットの件名に変更内容を書く（版番号だけにしない）。push し、CI が緑になったコミットだけをリリースする。
11. `claude plugin tag plugins/docdd --push`（タグ `docdd--vX.Y.Z`）。
