# docdd — 非エンジニアのための Claude Code 開発キット

**何か**: Claude Code のプラグインです。約束ごと・仕様書・作業キューの雛形と、決まった手順書（スキル）をまとめて入れます。
**誰向けか**: 1 人で Web アプリを作り続ける非エンジニア（日本語で使う人）。
**何ができるか**: 要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で Claude Code に進めさせます。

## 前提

| | 要るもの | 使う場面 | 無いと |
|---|---|---|---|
| 必須 | Claude Code（有料プラン: Pro・Max・Team・Enterprise、または Console のアカウント） | すべて | 使えない |
| 必須 | git | init とすべてのスキル（変更の記録と検査） | init が止まり、入れ方を案内する |
| 必須 | Node.js 18 以上（LTS＝長く保守される版を推奨） | init・検査スクリプト・hook | init が止まる。hook は起動できず（会話に hook error の通知が出る）、止めるはずの操作もそのまま実行される |
| 必須（release を使うなら） | GitHub のリポジトリ | `/docdd:release` | PR と CI 待ちの手順が使えない |
| 任意 | gh（GitHub をコマンドで操作する道具） | `/docdd:release` の PR 作成と CI 待ち | push の前に止まり、`gh auth login` するか GitHub の画面で PR を作るかを聞く |
| 任意 | playwright-cli とブラウザ | `/docdd:ui-polish`・`/docdd:verify-e2e`・release の公開先確認 | 手作業の確認に切り替えて、その旨を報告する |

- フレームワークは問いません（React・Vue・Python など）。ただし、検査スクリプトは Node.js、`/docdd:release` は GitHub を前提にしています。
- playwright-cli は、入れてよいかを聞いてから、動作を確かめた `@playwright/cli@0.1.17` を入れます。ブラウザは手元の Google Chrome を使い、無ければ Playwright 用のブラウザ（初回に数百 MB のダウンロード）を、聞いてから取得します。
- Windows: Git for Windows を入れるのがおすすめです。入れると Claude Code は bash でコマンドを実行します（無いと PowerShell で実行し、bash で書いた手順がそのまま動かないことがあります）。
- Desktop アプリ: 配布元（マーケットプレイス）の追加はターミナルで行います（ターミナルで使う Claude Code が要ります）。`claude plugin marketplace add no1013kota/claude-docdd-dev-kit` → `claude plugin install docdd@claude-docdd-dev-kit` を打ち、そのあと Desktop の入力欄の横の ＋ → Plugins で docdd が入っていることを確かめます。

## 全体像

docdd は、次の 4 つをプロジェクトにそろえ、Claude Code がいつも同じ順で動くようにします。

| 物 | 置き場 | 役割 |
|---|---|---|
| 約束 | `CLAUDE.md`・`.claude/rules/docdd-kit.md` | 毎回読まれる決まりごと。このプロジェクトの検証コマンドと反映コマンドの表 |
| 仕様書 | `docs/`（まず `docs/PRD.md`） | 何を作るか・どう作るかの正本（正しい 1 か所） |
| 作業キュー | `tasks/BACKLOG.md` | タスクと「要決定」（あなたに決めてほしいこと） |
| 手順書 | プラグインのスキル（`/docdd:…`） | 起票・開発・検証・反映の決まった手順 |

- 流れ: 要望 → `/docdd:add-task`（タスクにする）→ `/docdd:dev-loop`（1 タスクを実装・検証・仕様書の更新・コミット）→ 依頼が全部終わったら `/docdd:release`（本番へ反映）。
- 考え方: 手順書は、`CLAUDE.md` の表に書いたコマンドだけを実行します。表で「無い」の行は飛ばし、未記入（`{{…}}` のまま）の行は実行せずに報告します。表を埋めるほど、検証が確実になります。
- 背景（補足）: 記事『[コードを書けなくても Claude Code でアプリを壊さず作り続ける「4つのファイル」の仕組み](https://exosai.net/blog/claude-code-non-engineer-workflow)』。記事は v0.1 系の時点のもので、手順の細部はこの README が正です。

## 入れ方

Claude Code の中で次を順に打ちます。1・2 はどのフォルダで起動していてもよく、一度入れれば全プロジェクトで使えます。

1. `/plugin marketplace add no1013kota/claude-docdd-dev-kit`
2. `/plugin install docdd@claude-docdd-dev-kit`（範囲を聞かれたら User。そのまま有効になります。会話を読み直す旨の警告が出たときだけ `/reload-plugins --force`）
3. プロジェクトのフォルダで Claude Code を起動し、`/docdd:init`（前置きの無い `/init` は Claude Code 組み込みの別コマンドなので打たない）

3 の前に、どちらに当たるかを確かめます。

- **A. 既にアプリのコードがある** → そのフォルダで `/docdd:init`。
- **B. まだコードが無い** → 先に Claude Code に「Next.js（など）の土台を作って、動くところまで」と頼み、土台ができたフォルダで `/docdd:init`。多くの土台を作る道具（例: create-next-app）は空でないフォルダでは止まるので、雛形を先に置くと土台を作れなくなります（空のフォルダで init を打つと、この A／B を聞きます）。

`/docdd:init`・`/docdd:release`・`/docdd:update-kit` は、**あなたが自分で打ったときだけ動きます**。Claude が会話の流れで勝手に導入したり、本番へ出したりはしません。

### init がすること

- いまの状態を調べます（Node.js と git の有無、導入済みか、v0.1 系か）。導入済みなら次の一手を案内して止まり、v0.1 系なら `/docdd:update-kit` を案内します。
- git で管理していなければ `git init` の承知を取ります。コミットに残す名前とメールが無ければ聞き、このリポジトリだけに設定します。
- 分からないことだけを聞きます: プロジェクト名と何を作るか、既にある仕様書、PRD のやること・やらないこと、公開先 URL、反映の方式と本番ブランチ、テスト用 DB、有料 API の費用上限、`.claude/settings.json` を置いてよいか、既存の `CLAUDE.md` の扱い、既存の `tasks/BACKLOG.md` に書式の節を足すか、コミットしてよいか。選んで答える問い（反映の方式・テスト用 DB など）を先に選択の画面で、書いて答える問い（名前・機能・URL など）をあとで番号付きの 1 つのメッセージで、**分けて**聞きます。選ぶ問いが多いときは、選択の画面が 2 回になります。
- テスト用 DB は「① 手元で起動する／② ホスト型の開発専用／③ 使わない」から選びます。ホスト型の DB は、本番と別・開発専用・破棄可能な接続先だけにします（`CLAUDE.md` にこの語が無いと `/docdd:verify-integration` は止まります）。
- **検証コマンド（型検査・lint・テストなど）は聞きません。** `package.json`・`pyproject.toml` などから推定して表に書きます（違っていたら直します）。
- 雛形はスクリプト（`init.mjs`）がまとめて置くので、ファイルを 1 つずつ確認されることはありません。その代わり、`.claude/settings.json` だけは置く前に 1 回聞きます。置き場所がふさがっているとき（例: `tasks` という名前のファイルがある）は、1 つも置かずに止まって理由を伝えます（退けてから、もう一度 `/docdd:init`）。
- **既存のファイルは上書きしません。** 既存の `.claude/settings.json`・`.mcp.json` には触らず、雛形との差分を報告するだけです。既存の `CLAUDE.md` は「置き換える（元は `CLAUDE.md.bak` に残す）／表だけ末尾に足す（おすすめ）／そのまま（表が無いので、スキルは『先に `/docdd:init` を実行してください』で止まります）」から選びます。`.gitignore` は足りない行だけを足します。既存の `tasks/BACKLOG.md` にキットの書式の節（運用ルール・タスク・要決定）が無ければ、足すかを聞きます（書いてある内容は変えません）。
- `git add`（パスを指定）→ 参照の検査 → 日付の記入 → コミット前の安全確認（`.env` が除外されているか、ログイン状態のファイルが入っていないか）→ コミット → 日付の検査 → 未記入の欄の一覧、の順に進めます。
- 最後に、置いたもの・推定した行・未記入の欄（`ファイル:行`）・次の一手を報告します。

**何度打っても安全です。** 途中で止まったり、答えられない欄が残ったりしたら、もう一度 `/docdd:init` と打つと、足りないファイルを置き、答えられる欄を聞き直します。自動で推定できない行は一覧（`ファイル:行`）で示すので、そこを直接直します。

**答えを引数で渡すと、質問せずに最後まで進みます。** 例: `/docdd:init よみログ "読書記録アプリ" commit`（1 つめがプロジェクト名、2 つめが何を作るか、末尾の `commit` でコミットまで）。このときは settings を置き、既存の `CLAUDE.md` には表だけを足し、答えの無い欄は未記入のまま残します。git の管理や名前・メールが無ければ、止まってすることを報告します。

### 英語で出る確認と答え方

| いつ | 確認の内容 | 答え方 |
|---|---|---|
| Claude が `.claude/` のファイルを直接書き換えるとき（既存の settings.json に 2 つのキーを足すときなど） | 書き込んでよいか | Yes（"Yes, and allow Claude to edit files in this project's .claude folder for this session" でもよい。版によって文言が少し違う） |
| 導入後、次に起動したとき | このフォルダを信頼するか | Yes。これで `.claude/settings.json` の許可が有効になる |
| Next.js で `.mcp.json` を置いたあとの起動 | MCP サーバー（外部の道具とつなぐ仕組み）に接続してよいか | Next.js なら Yes、違えば No |
| コマンドを実行する前 | このコマンドを実行してよいか | 内容を読んで Enter。削除（`rm`）・送信（`git push`）・DB の操作を含み、迷ったら Esc で止めて「これは何をするの？」と聞く |
| 依存を足すとき（`npm install` など） | このコマンドを実行してよいか（"Yes, and don't ask again for …" の行もある） | 内容を読んで Yes。"don't ask again" は選ばない |

- `.claude/settings.json` を置くと、ファイルの編集（`.claude/` と `.mcp.json` への書き込みを除く）・`git add`／`git commit`・検査コマンドは確認なしで進みます。まとめて消す削除（`rm -r`・`rm -f`）・`git push`・依存の追加は必ず確認が出ます。`git add -A` は hook が止めます（下の「hook」の表）。強制 push・`--no-verify`・`sudo`・`.env` の読み取りは禁止です。
- 編集のたびに確認したいときは、Claude Code に「.claude/settings.json の defaultMode を "default" にして」と頼みます。**行を消すのは逆効果です。** Pro・Max・Team では、何も指定しないと自動で判断する auto モードで始まります。

### 目安

版・モデル・プロジェクトの大きさで変わるので、あくまで目安です。

- `/docdd:init` は数分〜10 分ほど。ヒアリングは 2〜3 回（選んで答える問いと、書いて答える問い）です。書く問いに番号どおりまとめて答えると往復が減ります。
- `/docdd:add-task` は数分、`/docdd:dev-loop` は 1 タスク 10〜20 分ほど。
- どれも Claude Code の利用枠（プランの使用量）を使います。

## init のあとにやること

### 既に仕様書やメモがあるとき

init のヒアリングで「既にある仕様書」を聞かれたら、そのファイル（README・docs の文書・Notion の書き出しなど）を選ぶか、中身を貼ります。
Claude がそこから `docs/PRD.md` の下書きを作り、あなたの承知を得て、原文を `docs/_imported/` へ移します（冒頭に「正本は docs/PRD.md」の 1 行。以後は原文を直しません）。
画面やデータの細かい記述はその場では分けず、「取り込んだ仕様を requirements へ分ける」タスクとして起票します。

### 最初の 3 手

1. init の報告に出た未記入の欄（`{{…}}`）を埋めます。特に `docs/PRD.md` の「やること（機能一覧）」「やらないこと」。記入例は [`examples/PRD.sample.md`](./examples/PRD.sample.md)（架空の美容室の予約アプリ）。分からない欄は Claude Code に「候補を挙げて質問して」と頼みます（勝手に確定させない）。もう一度 `/docdd:init` と打つと、答えられる欄を聞き直します。自動で推定できない行は一覧（`ファイル:行`）で示すので、そこを直接直します。
2. タスクを作ります。PRD に機能を複数書いたら `/docdd:tasks-from-prd`（まとめて下書き → 承認後に起票）。1 件だけなら `/docdd:add-task` の後ろにやりたいことを書きます（例: `/docdd:add-task メールアドレスで登録・ログインできるようにしたい`）。
3. `/docdd:dev-loop` と打ちます。init が「アプリの土台を作る」や「テスト基盤の導入」を起票していれば、それが最初のタスクです。テスト基盤の導入では依存を追加する確認（`npm install` など）が出ます。内容を読み、"Yes, and don't ask again for …" は選ばず Yes を選んでください。

### 途中から導入する場合（コードが既にある）

init は既存のコードを見つけると、次の一手に `/docdd:doc-sync --full` を案内します。
これは、いまのコードと docs を突き合わせます。docs が雛形のままなら、実装済みの機能を `docs/requirements/` の文書と PRD の機能一覧に書き起こし、1 コミットにします。
料金やスコープなど、あなたが決めることは書かずに `tasks/BACKLOG.md` の「要決定」へ回します。済んだら `/docdd:tasks-from-prd` か `/docdd:add-task` へ進みます。

## 中身

### init がプロジェクトへ置くもの

| パス | 役割 | 持ち主 |
|---|---|---|
| `CLAUDE.md` | このプロジェクトのコマンドの表（検証コマンド・反映コマンド）と「スキルへの追加指示」 | あなた |
| `.claude/rules/docdd-kit.md` | キット共通の約束（5 原則・変更影響 → 必須の検証・Definition of Done・規約）。毎回自動で読まれる | キット（直すと update-kit が聞く） |
| `.claude/settings.json` | 許可設定と、プラグインの取得元（別の PC で開いたとき、Claude Code がプラグインの入れ方を案内する）。置く前に聞く | あなた |
| `.gitignore` | `.env`・ログイン状態・一時ファイルを git に入れない。既にあれば足りない行だけ足す | あなた |
| `.mcp.json` | MCP サーバーの設定。Next.js なら shadcn/ui と Next.js DevTools（版を固定）、それ以外は空 | あなた |
| `docs/README.md` | 仕様書の地図と「どこに何を書くか」 | あなた |
| `docs/PRD.md` | 何を作るか | あなた |
| `docs/requirements/README.md`・`00_template.md` | どう作るか（画面・データ・処理）の分け方と、文書の雛形 | あなた・見本 |
| `docs/decisions/README.md`・`0000-template.md` | 技術判断の記録（ADR）の置き場と雛形 | あなた・見本 |
| `docs/operations/development-and-testing.md` | テストの層・いつ回すか・テスト基盤が無いとき・落とし穴 | あなた |
| `tasks/BACKLOG.md` | 作業キューと要決定 | あなた |
| `tasks/REFACTOR_PLAN.md` | リファクタ計画（`/docdd:refactor` が使う） | あなた |
| `scripts/check-doc-refs.mjs` | 仕様書が指すファイルが実在するか | キット |
| `scripts/check-doc-dates.mjs` | 仕様書の更新日がコミットより古くないか、版と変更履歴が合うか | キット |
| `scripts/check-doc-placeholders.mjs` | 未記入の欄（`{{…}}`）が残っていないか | キット |
| `scripts/audit-check.mjs` | 依存ライブラリの既知の脆弱性（npm と `package-lock.json` 用） | キット |
| `scripts/audit-allowlist.json` | 直さずに据え置く脆弱性の一覧（初期は空） | あなた |
| `.docdd/manifest.json` | キットの版と、置いたファイルの記録（update-kit が使う。手で直さない） | init が作る |
| `package.json` の `scripts` | `package.json` があれば 3 行（`check:doc-dates`・`check:doc-refs`・`check:doc-placeholders`）を足す。npm（`package-lock.json`、またはまだ lock が無い）なら `audit:check` も足して 4 行。無くても `node scripts/<名前>.mjs` で動く | あなた |

### プラグインが提供するスキル（15 本）

| スキル | いつ使う | 出力 |
|---|---|---|
| `/docdd:init` | 導入するとき、途中で止まった導入をやり直すとき（自分で打ったときだけ動く） | 雛形・推定した検証コマンド・未記入の欄の一覧・導入のコミット |
| `/docdd:add-task` | 要望や不具合を受け取ったとき（実装の前） | `tasks/BACKLOG.md` のタスクと要決定 |
| `/docdd:tasks-from-prd` | PRD に機能を複数書いたあと、最初の dev-loop の前 | 最初のタスク群（承認後に起票） |
| `/docdd:dev-loop` | 起票したタスクを 1 件進めるとき（`/docdd:dev-loop T-01` で指定もできる） | 実装・検証・docs の更新・コミットと報告 |
| `/docdd:doc-sync` | コミットの前（dev-loop が呼ぶ）。`--full` でコード全体と docs のずれを監査 | docs の更新と検査の結果 |
| `/docdd:verify-integration` | DB・migration（DB の変更手順）・権限・サーバー側の処理を変えたあと | テスト用 DB で通した統合検証の結果 |
| `/docdd:verify-e2e` | 利用者の操作の流れを変えたあと | ブラウザで最後まで通した確認の結果 |
| `/docdd:ui-polish` | 画面や UI 部品を作る・直すとき | 主な状態・画面幅・アクセシビリティ・実ブラウザの確認 |
| `/docdd:playwright-cli` | ブラウザ操作の道具箱（ほかのスキルから使う） | 画面の操作・スクショ・コンソールの確認 |
| `/docdd:refactor` | 振る舞いを変えずに中身を整えるとき（単体テストが無ければ監査だけ） | `tasks/REFACTOR_PLAN.md` と小さな改善のコミット |
| `/docdd:speed-up` | 画面が遅いと感じたとき（サーバー描画の Web アプリ向け。単体テストが無ければ計測と候補出しだけ） | 計測結果と改善のコミット |
| `/docdd:security-audit` | 公開前や、認証・課金・外部連携を触ったあと | 見つけた穴の報告。直すのは 1 件ずつあなたの「はい」を得てから |
| `/docdd:maintenance` | 週 1 回（`/docdd:maintenance monthly` で月次も） | 外部 API の変化・脆弱性・溜まったデータ・費用の点検結果 |
| `/docdd:release` | 依頼を全部終えたあと（自分で打ったときだけ動く） | 反映の方式（A: push で自動公開／B: staging → PR／C: 反映コマンド／まだ公開しない）で経路を選ぶ。本番へ出す前に必ずあなたの「はい」を得る。公開先の確認結果 |
| `/docdd:update-kit` | プラグインを更新したあと（自分で打ったときだけ動く） | 置いた雛形を新しい版へ（手付かずは置き換え、手を入れたものは 1 件ずつ決める） |

### hook（取り消しにくい操作を止める柵）

プラグインを入れると、Claude が Bash でコマンドを実行する直前に `hooks/hooks.json` と `scripts/guard-bash.mjs` が確かめます。
効くのは docdd のプロジェクト（`.docdd/manifest.json` がある、または `tasks/BACKLOG.md` があり `CLAUDE.md` に `/docdd:` を含む）だけで、ほかのプロジェクトの作業は止めません。Claude の文脈（トークン）は使いません。

| 扱い | コマンド | 代わりにすること |
|---|---|---|
| 止める | まとめて全部を stage する `git add`（`-A`・`--all`・`.`・`:/`・`*`） | `git add <パス>` で変えたファイルだけを指定 |
| 止める | `git commit -a`（`-am` などを含む） | `git add <パス>` してから `git commit` |
| 止める | `git commit --amend`（直前のコミットの書き換え） | 新しいコミットを足す |
| 止める | `git commit --no-verify`・`-n`（コミット前の検査を飛ばす） | 検査が落ちた理由を直す |
| 止める | コミットメッセージに、角括弧つきの CI 省略の印（skip ci など） | 印を書かない |
| 止める | 強制 push（`--force`・`--force-with-lease`・`-f`・`+ブランチ名`） | 新しいコミットを足して、ふつうに push |
| 確認を出す | `rm` に `-r`・`-R`・`-f`・`--recursive`・`--force` | 内容を読んで決める |

## 手順書を直したいとき

1. **まず `CLAUDE.md` の「スキルへの追加指示」表に 1 行足します。** 例: `| /docdd:release | PR は作らず main へ直接 push する |`。行があるスキルは、その行を本文より優先します。プラグインを更新しても、この表はそのまま残ります。
2. 手順書を全部自分で持ちたいときだけ、Claude Code に「docdd の手順書を .claude/skills/ に写して」と頼みます。写したスキルは `/add-task` のような前置きの無い名前になり、プラグインのスキル（`/docdd:add-task`）と並んで**両方呼べます**。`CLAUDE.md`・`docs/README.md`・`tasks/` の中の呼び名を、写した側に揃えてください。`init` は組み込みの `/init` と同じ名前になるので写しません。写した手順書は、プラグインを更新しても新しくなりません。

## 更新

- このマーケットプレイス（Anthropic 以外の配布元）は、**自動更新が既定でオフ**です。自動にするには `/plugin` → Marketplaces → claude-docdd-dev-kit → Enable auto-update。
- 手動で受け取るときは、まず `/plugin marketplace update claude-docdd-dev-kit`（配布元の一覧を取り直す）。そのあと `/plugin` の画面で docdd を更新するか、Claude Code を終了したターミナルで `claude plugin update docdd@claude-docdd-dev-kit`（反映には起動し直し）。入っている版は `/plugin list` で確かめます。
- 何が変わったかは [`CHANGELOG.md`](./CHANGELOG.md) に書きます。リリースは CI（自動の検査）が緑になったコミットだけから作ります。
- **プラグインを更新しても、プロジェクトに置いた雛形（`CLAUDE.md`・`scripts/` など）は変わりません。** 更新したら、プロジェクトのフォルダで `/docdd:update-kit` と打ちます。手付かずのファイルはまとめて置き換え、手を入れたファイルは差分を見て 1 件ずつ決めます。v0.1 系からの移行もこれで行います。
- update-kit が足すのは、新しい版で増えた節と表の行だけです。既存の節の中の文言の変更は提案しないので、CHANGELOG の「雛形への影響」を見て、必要なら手で直します。
- `.claude/settings.json` にはプラグインの取得元が書いてあります。別の PC や入れ直したあとにフォルダを開いて信頼すると、マーケットプレイスが追加され、プラグインが入っていなければ入れ方のコマンドが表示されます。

## やめるとき

`/plugin uninstall docdd@claude-docdd-dev-kit` で外すと、プラグインの設定とキャッシュは消えます。hook も一緒に効かなくなります。**プロジェクトに置いたファイルは残ります。**

docdd を入れたプロジェクト（`.claude/settings.json` で有効にしている）で外すと、「自分だけ無効にする／全員から外す」を聞かれます。全員から外すを選ぶと、`.claude/settings.json` の `enabledPlugins` にある docdd の行は Claude Code が消します（`extraKnownMarketplaces` は残ります）。

| 残るもの | そのままだと | 消すなら |
|---|---|---|
| `/docdd:…` の参照（`CLAUDE.md`・`docs/README.md`・`tasks/` の中） | 無いスキルを案内し続ける | その行を消すか書き換える（`CLAUDE.md` の表は自分のコマンド表として残してよい） |
| `.claude/rules/docdd-kit.md` | 毎回読み込まれ、無いスキルを案内する | ファイルを消す（残すなら `/docdd:` の行を直す） |
| `.claude/settings.json` の `extraKnownMarketplaces`（「自分だけ無効にする」を選んだときは `enabledPlugins` も） | フォルダを開くと配布元が追加され、`enabledPlugins` が残っていればプラグインの入れ方が表示される | 残ったキーを消す（許可設定は残してよい） |
| `.mcp.json` | MCP サーバーの設定が残る | 使っていなければ消す |
| `scripts/` の 4 本と `package.json` に足した行（npm は 4 行、それ以外は 3 行） | 害はない（そのまま動く） | 消すなら `CLAUDE.md` の「docs の検査」「未記入欄の検査」「依存の脆弱性」行と、`docs/README.md` の検査の説明も直す |
| `.docdd/manifest.json`・`.gitignore` の `# docdd` の塊 | 害はない | 消してよい（`.gitignore` は残すのがおすすめ） |
| `docs/`・`tasks/` | あなたの仕様書と作業キュー | 残してよい |

消すときは Claude Code に「docdd の参照（`/docdd:`）と、上の表のファイルを消して」と頼み、差分を確かめてからコミットします。

## 注意

- 検査は git が追跡しているファイルだけを見ます。新しく作ったファイルは、先に `git add` してから検査します。
- `check-doc-dates` はコミットの日付を読むので、コミットの後に回します（コミットが 1 件も無いと判定できません）。
- `audit-check.mjs` は npm と `package-lock.json` のプロジェクト用です。pnpm・yarn・Python などは、`CLAUDE.md`「検証コマンド」表の『依存の脆弱性』行に、そのツールのコマンド（例: `pnpm audit --audit-level=high`・`pip-audit`）を書きます。
- 直さずに据え置く脆弱性は `scripts/audit-allowlist.json` に、理由（`why`）と期限（`until`）を付けて書きます。期限を過ぎると検査が落ちます（依存を上げるか、理由を書き足して期限を延ばす）。

  ```json
  { "パッケージ名": { "why": "なぜ今は直さないか", "until": "YYYY-MM-DD" } }
  ```

- `.env` と `.env.*` は `.claude/settings.json` で**読み取り禁止**にしています。`.env.example` も読めなくなります。変数名を Claude に見せたいときは、その部分をチャットに貼るか、deny の `Read(./.env.*)` を `Read(./.env.local)` などの個別の名前に書き換えてもらいます。
- Claude Code のサンドボックス（`/sandbox`）を有効にしていると、init が `.claude/settings.json` と `.mcp.json` を書けないことがあります。その場合も残りの雛形は置き、Claude が確認つきで書き直すか、置けなかった中身を報告に載せます。
- hook と許可設定は「うっかり」を止める柵で、完全な守りではありません。別の書き方（`bash -c '…'` など）までは止められません（安全の仕組みの補助です）。
- `claude -p` のような確認を出せない実行では、`rm -r`・`rm -f` は実行されずに終わります。`/loop` は開いている会話の中で動くので確認が出て、答えるまでそこで止まります。
- コミットの名前やメールを間違えたときは、push する前なら `git commit --amend --reset-author` で直せます。hook は Claude の `--amend` を止めるので、Claude Code の外のターミナルで自分で打ちます。
- このキットは 2026 年 9 月時点の Claude Code（2.1 系）の仕組みを前提にしています。公式ドキュメント: https://code.claude.com/docs/en/plugins ／ https://code.claude.com/docs/en/skills ／ https://code.claude.com/docs/en/memory

## 困ったら

- 不具合や分かりにくい所は [Issues](https://github.com/no1013kota/claude-docdd-dev-kit/issues/new?template=bug.yml) へ（無料の GitHub アカウントが要ります）。
- 書いてほしいこと: `claude --version` の結果、OS、docdd の版（`/plugin list`）、打ったスキル（引数も）、失敗したときの文面そのまま（英語も訳さずに）。
- API キーや `.env` の中身は貼らないでください。

## 保守する人へ

- リリースの手順は [`RELEASING.md`](../../RELEASING.md)。検査は `npm run check`、テストは `npm test`（リポジトリの一番上で）。
- スキルの `allowed-tools` に runner 単体（`Bash(npx:*)`・`Bash(npm:*)`・`Bash(pnpm:*)`・`Bash(bash -c *)` など）を書かないでください。そのスキルを呼んだターンの間、中で動く何でもが確認なしで通ります。`Bash(npx playwright-cli *)` のように、runner と内側のコマンドの組で書きます（`npm run check` が見ます）。
- hook の動作は `tests/guard-bash.test.mjs` で確かめます。例: `git add -A && git commit`・`git commit --amend`・`git push -f origin main` は止まり、`rm -rf build` は確認が出て、`git add CLAUDE.md docs/PRD.md`・`git push origin stg` は通ります。
