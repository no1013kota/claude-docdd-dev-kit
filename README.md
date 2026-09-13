# docdd — 非エンジニアのための Claude Code 開発キット

Claude Code のプラグイン マーケットプレイスです。プラグイン `docdd` を入れると、1 人の非エンジニアが Web アプリを作り続けるための「約束（CLAUDE.md）・仕様書（docs）・作業キュー（BACKLOG）・手順書（スキル）」がそろいます。
要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で Claude Code に進めさせます。
作るものの技術（React・Vue・Python など）は問いません。ただし、検査スクリプトは Node.js 18 以上、本番反映の手順は GitHub を前提にしています。

**English summary**: docdd is a Japanese-language Claude Code plugin for solo non-engineers who build and run web apps. It sets up a spec-driven workflow in your project: a `CLAUDE.md` with verification and release command tables, a PRD and requirements docs as the single source of truth, a task backlog with a "decisions needed" queue, and doc-consistency check scripts. Its skills turn a request into a task, implement and verify it, sync the docs, commit, and release, and a PreToolUse hook blocks risky git operations (bulk `git add`, `--amend`, `--no-verify`, force push) in docdd projects. Requires a paid Claude Code plan, git, and Node.js 18+.

## 入れ方

Claude Code の中で次を順に打ちます。入れるのに GitHub のアカウントは要りません（不具合の報告には、無料の GitHub アカウントが要ります）。

1. `/plugin marketplace add no1013kota/claude-docdd-dev-kit`
2. `/plugin install docdd@claude-docdd-dev-kit`
3. プロジェクトのフォルダで Claude Code を起動し、`/docdd:init`

まだアプリのコードが無いなら、先に土台（例: Next.js）を作って動かしてから、そのフォルダで 3 を打ちます。

**詳しい説明書（前提・init がすること・英語の確認への答え方・更新・やめるとき）は [plugins/docdd/README.md](plugins/docdd/README.md) にあります。** 変更履歴は [plugins/docdd/CHANGELOG.md](plugins/docdd/CHANGELOG.md)。

## 困ったら

[Issues](https://github.com/no1013kota/claude-docdd-dev-kit/issues/new?template=bug.yml) へ。`claude --version` の結果・OS・docdd の版（`/plugin list`）・打ったスキル・失敗したときの文面をそのまま書いてください。

## ライセンス

Apache-2.0（[LICENSE](LICENSE)）。
`plugins/docdd/skills/playwright-cli/references/` の 9 本と、playwright-cli スキルの frontmatter は [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli)（Apache-2.0、Copyright (c) Microsoft Corporation）に由来します。詳しくは [NOTICE](NOTICE)。
