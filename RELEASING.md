# リリース手順（著者用）

## フォルダの役割（plugins/docdd の中）

| フォルダ | 役割 |
|---|---|
| `skills/` | 手順書（スキル）14 本 |
| `templates/` | init が利用者のプロジェクトへ**置く**雛形（`package.scripts.json` だけは `package.json` へ足す）。置いたものは各プロジェクトの正本になるので、見本や試しのファイルは置かない |
| `examples/` | **置かない**、読むだけの記入例（いまは PRD の 1 本だけ） |
| `scripts/` | init・update-kit の処理と hook。利用者のプロジェクトには置かない |
| `hooks/` | hook の設定（PreToolUse・SessionStart） |
| `evals/` | `claude plugin eval` の評価ケース |

リポジトリ直下の `scripts/`・`tests/` は、配布しない、このリポジトリの検査とテスト（hook の動作は `tests/guard-bash.test.mjs`）。

- スキルの `allowed-tools` に runner 単体（`Bash(npx:*)`・`Bash(npm:*)`・`Bash(pnpm:*)`・`Bash(bash -c *)` など）を書かない。そのスキルを呼んだターンの間、中で動く何でもが確認なしで通る。`Bash(npx playwright-cli *)` のように、runner と内側のコマンドの組で書く（`npm run check` が見る）。

## main と配布

- **main に入れた時点で配布されます。** タグを打った時点ではありません。
  - 新しく入れる人は、main の最新を受け取ります。
  - すでに入れている人が更新を受け取るのは、`plugins/docdd/.claude-plugin/plugin.json` の `version` を上げたときだけです（公式: https://code.claude.com/docs/en/plugins-reference の「Users get updates only when you bump this field」）。
- そのため、main はいつ配布されてもよい状態に保ちます。変更は作業ブランチで作り、PR の CI（`.github/workflows/ci.yml`）が緑になってから main へ入れます。
- `plugins/docdd/` の中を変えたら、同じ PR で版を上げ、`plugins/docdd/CHANGELOG.md` に書きます。
  - `plugins/docdd/README.md`・`plugins/docdd/CHANGELOG.md`・`plugins/docdd/evals/` だけの変更では、版を上げません（入れている人の動きが変わらないため）。スキルのフォルダの中の README など、ほかのファイルは数えます。
  - `npm run check` の中の `scripts/check-version-bump.mjs` が、最新のタグ `docdd--vX.Y.Z` と比べて、版の上げ忘れ（上の 3 つ以外が変わったのに版が同じ）と、版の下げを落とします。

## 手順

1. 作業ブランチで、`plugins/docdd/CHANGELOG.md` の先頭に新しい版を書く。見出しは `## X.Y.Z（YYYY-MM-DD）`。中身は、追加・変更・削除、「雛形への影響: あり／なし」（update-kit で置き換わるものと、手で直すもの）、置いた仮説、「今回やらなかったこと（理由）」。
   - 先に、前の版のタグがあるかを確かめる。`git fetch --tags` のあと、`git tag -l 'docdd--v*'` に、上げる前の `plugin.json` の版のタグ（`docdd--v<今の版>`）があるかを見る。
   - 無ければ、前の版の手順 12 が抜けている。このままだと `check-version-bump` がもっと古いタグと比べるので、版の上げ忘れを見逃す。先に、その版を main に入れたコミット（`git log --oneline --first-parent origin/main -- plugins/docdd/.claude-plugin/plugin.json` の先頭）に、`git tag docdd--v<今の版> <コミット>` と `git push origin docdd--v<今の版>` でタグを打つ。
2. `plugins/docdd/.claude-plugin/plugin.json` の `version` を上げる（`.claude-plugin/marketplace.json` には版を書かない）。
3. 雛形の刻印 `docdd-kit vX.Y.Z`（templates の rules と scripts/*.mjs）と、`plugins/docdd/scripts/init.mjs` の `FALLBACK_VERSION` を揃える。
4. `npm run check`（`scripts/check-skill-refs.mjs`・`scripts/check-version-stamps.mjs`・`scripts/check-version-bump.mjs` をまとめて回す）。
5. `npm test`（Node 18 以上・git 2.32 以上。v0.1.4 の移行テストは履歴全体が要る）。
   - 回るのは `tests/` の直下の `*.test.mjs` だけ（`scripts/run-tests.mjs` が並べて渡す。補助のファイルの名前を `.test.mjs` で終えない）。
   - CI（`.github/workflows/ci.yml`）が回るのは PR と main への push のときだけ（作業ブランチへ push しただけでは回らない）。Windows のジョブ（`test-windows`）は落ちても CI を止めない。
6. `claude plugin validate --strict .` と `claude plugin validate --strict plugins/docdd`。CI の Claude Code は `.github/workflows/ci.yml` で版を固定している。検証に使う版を上げるときは、そこを上げる。
7. `npm run check:urls`（README 2 本・CHANGELOG・RELEASING・skills・templates・examples の外部リンクを開けるか。CI には入れていない）。
   - 落ちたら、まずそのリンクをブラウザで開く。サイトの一時的な不調や、機械からのアクセスを断るサイトもある。
   - 本当に移動・削除されていたら直す。
8. 空の git リポジトリで `claude --plugin-dir <このリポジトリ>/plugins/docdd` を起動し、`/docdd:init` を最後まで通す。
9. 雛形の `.mcp.json` の版を `npm view shadcn version` と `npm view next-devtools-mcp version` で確かめて上げ、Next.js のプロジェクトで 1 回起動確認する。
10. evals（手動・費用が出る）: `claude plugin eval plugins/docdd --trust-plugin --scaffold --runs 1 --ablation none --threshold 0.8 --no-publish --max-cost-usd 10 --allow-tools Bash Write Edit`。
    - 6 ケースで約 4 ドル（2026-09-14 の実績）。macOS では評価のサンドボックスの中で `/usr/bin/git`（xcrun）が一時キャッシュを書けず、git が動かないことがある（ログに `xcrun_db` と `Operation not permitted`）。そのケースだけ `--case <名前>` で回し直し、ログで原因を確かめてから判断する。
11. コミットの件名に変更内容を書く（版番号だけにしない）。push して PR を作り、CI が緑になってから main へマージする（この時点で配布される）。
12. main で `claude plugin tag plugins/docdd --push`（タグ `docdd--vX.Y.Z`）。次の版の `check-version-bump` は、このタグと比べる。

## コミュニティのマーケットプレイスへの申請

Anthropic のコミュニティのマーケットプレイス（`anthropics/claude-plugins-community`）に載せるときの材料です。申請は 1 回だけで、載ったあとの更新は push で取り込まれます（公式: https://code.claude.com/docs/en/plugins の「CI bumps the pin automatically as you push new commits to your repository」）。

- 申請先: 個人の作者は Console のフォーム https://platform.claude.com/plugins/submit （Console にログインして開く）。claude.ai のフォームは Team・Enterprise の組織向け（公式: https://code.claude.com/docs/en/plugins の「Submit your plugin to the community marketplace」）。
- 申請の前に、上の手順の 4〜7 を通す（審査でも `claude plugin validate` が回る）。
- 載ったかは、コミュニティのカタログ https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json で名前を探して確かめる（同期は毎晩なので、承認から少し遅れる）。
- 入れるときの `@` の右の名前は、公式の文書の中で食い違っている（discover-plugins と plugins は `claude-community`、申請の説明の頁は `claude-plugins-official`）。いまの README は、このリポジトリから入れる打ち方（`docdd@claude-docdd-dev-kit`）だけを書いている。載ったら実際の名前を確かめ、README の「入れ方」「更新」「やめるとき」に、その名前での打ち方を足す。
- 申請の文面を変えたら、`plugin.json`・`marketplace.json` の説明も揃える。

### フォームに入れる値

| 項目 | 入れる値 |
|---|---|
| プラグイン名 | docdd |
| 表示名 | docdd — 非エンジニアのための開発キット |
| リポジトリ | https://github.com/no1013kota/claude-docdd-dev-kit |
| プラグインの場所（サブディレクトリ） | plugins/docdd |
| マーケットプレイスの定義（聞かれたら） | リポジトリ直下の .claude-plugin/marketplace.json（名前 claude-docdd-dev-kit） |
| ドキュメント | https://github.com/no1013kota/claude-docdd-dev-kit/blob/main/plugins/docdd/README.md |
| ライセンス | Apache-2.0 |
| カテゴリ（聞かれたら） | development |
| 版 | 申請する時点の plugin.json の版とタグ（`X.Y.Z` なら `docdd--vX.Y.Z`） |
| 使える環境 | Claude Code（ターミナル・Desktop・IDE）。git と Node.js 18 以上が要る。claude.ai/code とクラウドのセッションには対応していない |
| 問い合わせ先 | https://github.com/no1013kota/claude-docdd-dev-kit/issues/new/choose |

### 説明（日本語）

1 人の非エンジニアが Claude Code で Web アプリやゲームなどを作り続けるための、日本語の開発キットです。`/docdd:init` が、約束（`CLAUDE.md`。検証コマンドと反映コマンドの表）・仕様書（PRD と requirements）・作業キュー（「要決定」つきの BACKLOG）・文書の検査スクリプトをプロジェクトに置きます。スキルが、要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で進めます。docdd のプロジェクトでは、PreToolUse の hook が、取り消しにくい git 操作（まとめての `git add`・`--amend`・`--no-verify`・強制 push）と、秘密の値（秘密鍵・既知の形の API キー・`.env`）が入ったコミットを止めます。Web アプリが中心で、Unity などの Web 以外のプロジェクトにも制限つきで対応します（Web 専用のスキルは「該当なし」で止まります）。Claude Code（ターミナル・Desktop・IDE）向けです。git と Node.js 18 以上が要ります（claude.ai/code とクラウドのセッションには対応していません）。

### 説明（英語）

A Japanese-language, spec-driven development kit for solo non-engineers who build apps and games with Claude Code. `/docdd:init` sets up a `CLAUDE.md` with verification and release command tables, a PRD and requirements docs as the single source of truth, a task backlog with a "decisions needed" queue, and doc-consistency check scripts. Skills turn a request into a task, implement and verify it, sync the docs, commit, and release, the same way every time. In docdd projects, a PreToolUse hook blocks risky git operations (bulk `git add`, `--amend`, `--no-verify`, force push) and commits that contain secrets (private keys, known API key formats, `.env` files). Web apps come first; Unity and other non-web projects are supported with limits (web-only skills report "not applicable"). Built for Claude Code in the terminal, the Desktop app and IDE extensions. It needs git and Node.js 18 or later (claude.ai/code and cloud sessions are not supported).

### 使い方の例（日本語）

1. **新しい Web アプリを始める**: Next.js などの土台を作ったフォルダで `/docdd:init` を打つ。プロジェクト名と作りたいものに答えると、検証コマンド（型検査・lint・テストなど）を `package.json` から推定した `CLAUDE.md` と、`docs/PRD.md`・`tasks/BACKLOG.md` が置かれ、最初のコミットまで進む。PRD などの仕様書に機能を書いたら、何も書かずに `/docdd:add-task` と打つと、タスクをまとめて下書きし、承認したら起票する。
2. **要望を 1 件、実装して反映する**: `/docdd:add-task メールアドレスで登録・ログインできるようにしたい` でタスクにし、`/docdd:dev-loop` で実装・検証・仕様書の更新・コミットまで進める。依頼が全部終わったら、`/docdd:release` が本番へ出す前に「はい」を取ってから反映し、公開先で確かめる。
3. **Unity のゲームで使う**: Unity のプロジェクトで `/docdd:init` を打つ。Web 以外と判定され、『開発サーバー起動』『型検査』『lint』などを「無い」にする。README の例を見て『単体・DBテスト』に EditMode テストのコマンドを書くと、`/docdd:dev-loop` が変更のたびにそのコマンドを回す。`/docdd:verify-e2e` は『E2E（実際に動かす）』行のコマンドで確かめ、テストが 0 件なら合格にしない。Web 専用の `/docdd:ui-polish` などは「該当なし」と報告して止まる。

### 使い方の例（英語）

1. **Start a new web app**: In a folder with a working scaffold such as Next.js, run `/docdd:init`. Answer the project name and what you are building. docdd places a `CLAUDE.md` whose verification commands (type check, lint, tests) are inferred from `package.json`, plus `docs/PRD.md` and `tasks/BACKLOG.md`, and makes the first commit. After you write features in the PRD or other spec docs, run `/docdd:add-task` with no request to draft the tasks and file them once you approve.
2. **Ship one request**: `/docdd:add-task` followed by the request (such as sign-up and login with an email address) turns it into a task. `/docdd:dev-loop` implements it, runs the verification commands, updates the docs, and commits. When all requests are done, `/docdd:release` asks for your OK before deploying to production, then checks the live site.
3. **Use it in a Unity game**: Run `/docdd:init` in a Unity project. docdd detects a non-web project and sets rows such as the dev server, type check and lint to "none". After you add the EditMode test command from the README to the unit test row, `/docdd:dev-loop` runs it for every change. `/docdd:verify-e2e` uses the command in the E2E row and does not pass when zero tests ran. Web-only skills such as `/docdd:ui-polish` report "not applicable" and stop.
