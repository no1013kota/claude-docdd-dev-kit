# docdd — 非エンジニアのための Claude Code 開発キット

Claude Code のプラグイン マーケットプレイスです。プラグイン `docdd` を入れると、1 人の非エンジニアが Web アプリやゲームなどを作り続けるための「約束（CLAUDE.md）・仕様書（docs）・作業キュー（BACKLOG）・手順書（スキル）」がそろいます。
要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で Claude Code に進めさせます。
作るものの技術（React・Vue・Python など）は問いません。Web アプリが中心ですが、Unity などのゲーム・ネイティブアプリでも、仕様書・タスク・検証の表の進め方は使えます（Web 専用のスキルは「該当なし」で止まります）。検査スクリプトは Node.js 18 以上、本番反映の手順は GitHub を前提にしています。
Claude Code（ターミナル・Desktop・IDE）向けです。git・Node.js・ターミナルが要るので、Cowork では動作を確かめていません。
背景と考え方はブログ記事「[コードを書けなくても Claude Code でアプリを壊さず作り続ける「4つのファイル」の仕組み](https://exosai.net/blog/claude-code-non-engineer-workflow)」にあります。

**English summary**: docdd is a Japanese-language Claude Code plugin for solo non-engineers who build and run web apps, games and more. It sets up a spec-driven workflow in your project: a `CLAUDE.md` with verification and release command tables, a PRD and requirements docs as the single source of truth, a task backlog with a "decisions needed" queue, and doc-consistency check scripts. Its skills turn a request into a task, implement and verify it, sync the docs, commit, and release. In docdd projects, a PreToolUse hook blocks risky git operations (bulk `git add`, `--amend`, `--no-verify`, force push) and commits that contain secrets such as private keys, known API key formats and `.env` files. Web apps come first: in non-web projects such as Unity games, the web-only skills report "not applicable" and stop. Requirements: a paid Claude Code plan (Pro, Max, Team or Enterprise) or a Console account, git, Node.js 18 or later, and a terminal. It is built for Claude Code in the terminal, the Desktop app and IDE extensions, and has not been tested in Cowork.

## 入れ方

Claude Code の中で次を順に打ちます。入れるのに GitHub のアカウントは要りません（不具合の報告には、無料の GitHub アカウントが要ります）。

1. `/plugin marketplace add no1013kota/claude-docdd-dev-kit`
2. `/plugin install docdd@claude-docdd-dev-kit`
3. プロジェクトのフォルダで Claude Code を起動し、`/docdd:init`

まだアプリのコードが無いなら、先に土台（例: Next.js）を作って動かしてから、そのフォルダで 3 を打ちます。

ほかの配布元から docdd を入れた場合は、`@` の右の名前（配布元の名前）が `claude-docdd-dev-kit` と違います。更新ややめるときのコマンドでは、`/plugin list` に出る名前を使います。

**詳しい説明書（前提・init がすること・英語の確認への答え方・Web 以外のプロジェクトで使う・更新・やめるとき）は [plugins/docdd/README.md](plugins/docdd/README.md) にあります。** 変更履歴は [plugins/docdd/CHANGELOG.md](plugins/docdd/CHANGELOG.md)。

## 困ったら

[Issues](https://github.com/no1013kota/claude-docdd-dev-kit/issues/new/choose) へ。不具合・質問（分かりにくい所）・要望の中から選べます。日本語でも英語でも書けます。
不具合なら、`claude --version` の結果・OS・docdd の版（`/plugin list`）・打ったスキル・失敗したときの文面をそのまま書いてください。API キーや `.env` の中身は貼らないでください。

## ライセンス

Apache-2.0（[LICENSE](LICENSE)）。
playwright-cli スキルの frontmatter（name・description・allowed-tools）は [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli)（Apache-2.0、Copyright (c) Microsoft Corporation）に由来します。v0.4.0 から、上流の英語の手順書（`references/`）は同梱せず、入っている道具の中の公式の手順書を読みます。詳しくは [NOTICE](NOTICE)。
