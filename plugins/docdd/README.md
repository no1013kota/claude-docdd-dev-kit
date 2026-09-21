# docdd — 非エンジニアのための Claude Code 開発キット

**何か**: Claude Code のプラグインです。約束ごと・仕様書・作業キューの雛形と、決まった手順書（スキル）をまとめて入れます。
**誰向けか**: 1 人で Web アプリやゲームなどを作り続ける非エンジニア（日本語で使う人）。
**何ができるか**: 要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で Claude Code に進めさせます。
**使える環境**: Claude Code（ターミナル・Desktop・IDE）向けです。git・Node.js・ターミナルが要るので、Cowork では動作を確かめていません。

**English summary**: docdd is a Japanese-language Claude Code plugin for solo non-engineers who build and run web apps, games and more. It sets up a spec-driven workflow in your project: a `CLAUDE.md` with verification and release command tables, a PRD and requirements docs as the single source of truth, a task backlog with a "decisions needed" queue, and doc-consistency check scripts. Its skills turn a request into a task, implement and verify it, sync the docs, commit, and release. In docdd projects, a PreToolUse hook blocks risky git operations (bulk `git add`, `--amend`, `--no-verify`, force push) and commits that contain secrets such as private keys, known API key formats and `.env` files. Web apps come first: in non-web projects such as Unity games, the web-only skills report "not applicable" and stop. Requirements: a paid Claude Code plan (Pro, Max, Team or Enterprise) or a Console account, git, Node.js 18 or later, and a terminal. It is built for Claude Code in the terminal, the Desktop app and IDE extensions, and has not been tested in Cowork.

## 前提

| | 要るもの | 使う場面 | 無いと |
|---|---|---|---|
| 必須 | Claude Code（有料プラン: Pro・Max・Team・Enterprise、または Console のアカウント） | すべて | 使えない |
| 必須 | git | init とすべてのスキル（変更の記録と検査） | init が止まり、入れ方を案内する |
| 必須 | Node.js 18 以上（LTS＝長く保守される版を推奨） | init・検査スクリプト・hook | init が止まる。hook は起動できず（会話に hook error の通知が出る）、止めるはずの操作もそのまま実行される |
| 必須（release を使うなら） | GitHub のリポジトリ | `/docdd:release` | PR と CI 待ちの手順が使えない |
| 任意 | gh（GitHub をコマンドで操作する道具） | `/docdd:release` の PR 作成と CI 待ち | push の前に止まり、`gh auth login` するか GitHub の画面で PR を作るかを聞く |
| 任意 | playwright-cli とブラウザ | Web のプロジェクトの `/docdd:ui-polish`・`/docdd:verify-e2e`・release の公開先確認 | 手作業の確認に切り替えて、その旨を報告する |

- 作るものの技術は問いません（React・Vue・Python など）。ただし、検査スクリプトは Node.js、`/docdd:release` は GitHub を前提にしています。Web アプリが中心で、Unity などのゲーム・ネイティブアプリでは Web 専用のスキルが「該当なし」で止まります（下の「[Web 以外のプロジェクトで使う（例: Unity）](#web-以外のプロジェクトで使う例-unity)」）。
- playwright-cli は、プロジェクトの Playwright で代用できればそれを使い、できなければ、入れてよいかを聞いてから、動作を確かめた `@playwright/cli@0.1.17` を入れます。詳しい使い方は、道具の中にある公式の手順書（英語）を読みます（作業フォルダの外なので、読むときに確認が出ることがあります）。ブラウザは手元の Google Chrome を使い、無ければ Playwright 用のブラウザ（初回に数百 MB のダウンロード）を、聞いてから取得します。
- Windows: **Git for Windows を入れてください**（git は init とすべてのスキルで要ります。hook の秘密の値の検査も git を動かします）。
  - Claude Code は、Git for Windows が無いと PowerShell でコマンドを実行します。Git for Windows があっても、claude.ai・Console のアカウントでは PowerShell のツールが既定で有効です（公式: https://code.claude.com/docs/en/tools-reference）。
  - docdd の hook は、Bash と PowerShell の両方で効くように設定しています。ただし、Windows の実機では確かめていません。
  - bash で書いた手順（`mkdir -p` など）は、PowerShell ではそのまま動かないことがあります。
  - 雛形の許可設定（`.claude/settings.json`）の規則は `Bash(…)` の形だけで、PowerShell のコマンド用の規則（`PowerShell(…)`）はありません。
- Desktop アプリ: 配布元（マーケットプレイス）の追加はターミナルで行います（ターミナルで使う Claude Code が要ります）。`claude plugin marketplace add no1013kota/claude-docdd-dev-kit` → `claude plugin install docdd@claude-docdd-dev-kit` を打ち、そのあと Desktop の入力欄の横の ＋ → Plugins で docdd が入っていることを確かめます。

## 全体像

docdd は、次の 4 つをプロジェクトにそろえ、Claude Code がいつも同じ順で動くようにします。**流れの図は [リポジトリの README](../../README.md#全体像)** にあります（この README は、その細部を書いたものです）。

| 物 | 置き場 | 役割 |
|---|---|---|
| 約束 | `CLAUDE.md`・`.claude/rules/docdd-kit.md` | 毎回読まれる決まりごと。このプロジェクトの検証コマンドと反映コマンドの表 |
| 仕様書 | `docs/`（まず `docs/PRD.md`） | 何を作るか・どう作るかの正本（正しい 1 か所） |
| 作業キュー | `tasks/BACKLOG.md` | タスクと「要決定」（あなたに決めてほしいこと） |
| 手順書 | プラグインのスキル（`/docdd:…`） | 起票・開発・検証・反映の決まった手順 |

- 流れ: 要望 → `/docdd:add-task`（タスクにする）→ `/docdd:dev-loop`（1 タスクを実装・検証・仕様書の更新・コミット）→ 依頼が全部終わったら `/docdd:release`（本番へ反映）。
- 考え方: 手順書は、`CLAUDE.md` の表に書いたコマンドだけを実行します。表で「無い」の行は飛ばし、未記入（`{{…}}` のまま）の行は実行せずに報告します。表を埋めるほど、検証が確実になります。
- 背景（補足）: 記事『[コードを書けなくても Claude Code でアプリを壊さず作り続ける「4つのファイル」の仕組み](https://exosai.net/blog/claude-code-non-engineer-workflow)』。手順の細部はこの README が正です。

**この README の読み方**: 導入は「[前提](#前提)」→「[入れ方](#入れ方)」→「[init のあとにやること](#init-のあとにやること)」。困ったときは「[英語で出る確認と答え方](#英語で出る確認と答え方)」「[注意](#注意)」。Unity などは「[Web 以外のプロジェクトで使う](#web-以外のプロジェクトで使う例-unity)」。中身の一覧は「[中身](#中身)」（置くファイル・スキル 15 本・hook）。

## 入れ方

Claude Code の中で次を順に打ちます。1・2 はどのフォルダで起動していてもよく、一度入れれば全プロジェクトで使えます。

1. `/plugin marketplace add no1013kota/claude-docdd-dev-kit`
2. `/plugin install docdd@claude-docdd-dev-kit`（範囲を聞かれたら User。そのまま有効になります。会話を読み直す旨の警告が出たときだけ `/reload-plugins --force`）
3. プロジェクトのフォルダで Claude Code を起動し、`/docdd:init`（前置きの無い `/init` は Claude Code 組み込みの別コマンドなので打たない）

ほかの配布元から docdd を入れた場合は、`@` の右の名前（配布元の名前）が `claude-docdd-dev-kit` と違います。この README の `docdd@claude-docdd-dev-kit` と `claude-docdd-dev-kit` は、`/plugin list` に出る名前に読み替えてください。

3 の前に、どちらに当たるかを確かめます。

- **A. 既にアプリのコードがある** → そのフォルダで `/docdd:init`。
- **B. まだコードが無い** → 先に Claude Code に「Next.js（など）の土台を作って、動くところまで」と頼み、土台ができたフォルダで `/docdd:init`。多くの土台を作る道具（例: create-next-app）は空でないフォルダでは止まるので、雛形を先に置くと土台を作れなくなります（空のフォルダで init を打つと、この A／B を聞きます）。

`/docdd:init`・`/docdd:release`・`/docdd:update-kit` は、**あなたが自分で打ったときだけ動きます**。Claude が会話の流れで勝手に導入したり、本番へ出したりはしません。

### init がすること

- いまの状態を調べます（Node.js と git の有無、導入済みか、v0.1 系か）。導入済みなら次の一手を案内して止まり、v0.1 系なら `/docdd:update-kit` を案内します。
- git で管理していなければ `git init` の承知を取ります。コミットに残す名前とメールが無ければ聞き、このリポジトリだけに設定します。
- 分からないことだけを聞きます。**選んで答える問いを先に**（選択の画面。多いときは 2 回に分かれます）、**書いて答える問いをあとで**（番号付きの 1 つのメッセージ）、分けて聞きます。
  - 選んで答える: 反映の方式（自動公開／確認してから公開／コマンドで公開／まだ公開しない）・テスト用 DB・`.claude/settings.json` を置いてよいか（まだ無いときだけ）・既存の `CLAUDE.md` の扱い・既存の `tasks/BACKLOG.md` に書式の節を足すか・終わったらコミットしてよいか
  - 書いて答える: プロジェクト名と何を作るか・既にある仕様書・PRD のやること／やらないこと・公開先 URL・本番ブランチ（「確認してから公開」なら作業ブランチも）・テスト用 DB の起動コマンドかキー名・有料 API の費用上限・推定できなかった検証コマンドの行
- 『本番 DB のバックアップ』と『戻し方』は init では聞きません（未記入のまま置きます）。migration を含む反映のとき・公開先が壊れたときに、`/docdd:release` が候補を示して聞き、その場で表へ書きます。
- テスト用 DB は「① 手元で起動する／② ホスト型の開発専用／③ 使わない」から選びます。ホスト型の DB は、本番と別・開発専用・破棄可能な接続先だけにします（`CLAUDE.md` にこの語が無いと `/docdd:verify-integration` は止まります）。
- **検証コマンド（型検査・lint・テストなど）は聞きません。** `package.json`・`pyproject.toml` などから推定して表に書きます（違っていたら直します）。Web 以外のプロジェクトでは一部しか推定できません（下の「Web 以外のプロジェクトで使う（例: Unity）」）。
- 雛形はスクリプト（`init.mjs`）がまとめて置くので、ファイルを 1 つずつ確認されることはありません。その代わり、`.claude/settings.json` だけは、まだ無ければ置く前に 1 回聞きます。置き場所がふさがっているとき（例: `tasks` という名前のファイルがある）は、1 つも置かずに止まって理由を伝えます（退けてから、もう一度 `/docdd:init`）。
- **既存のファイルは上書きしません。** 既存の `.claude/settings.json`・`.mcp.json` には触らず、雛形との差分を報告するだけです（settings.json に始まりのモード `defaultMode` があれば、その値も報告します）。既存の `CLAUDE.md` は「置き換える（元は `CLAUDE.md.bak` に残す）／表だけ末尾に足す（おすすめ）／そのまま（表が無いので、スキルは『先に `/docdd:init` を実行してください』で止まります）」から選びます。`.gitignore` は足りない行だけを足します。`.env` などの共通の行はいつも、Web 向けの行（`node_modules/` など）は Web のプロジェクトだけ、Python 向けの行（`__pycache__/`・`.venv/` など）は Python を見つけたときだけ足します。既存の `tasks/BACKLOG.md` にキットの書式の節（運用ルール・タスク・要決定）が無ければ、足すかを聞きます（書いてある内容は変えません）。
- `git add`（パスを指定）→ 参照の検査 → 日付の記入 → コミット前の安全確認（`.env` が除外されているか、ログイン状態のファイルが入っていないか）→ コミット → 日付の検査 → 未記入の欄の一覧、の順に進めます。
- 最後に、置いたもの・推定した行・未記入の欄（`ファイル:行`）・次の一手を報告します。

**何度打っても安全です。** 途中で止まったり、答えられない欄が残ったりしたら、もう一度 `/docdd:init` と打つと、足りないファイルを置き、答えられる欄を聞き直します。自動で推定できない行は一覧（`ファイル:行`）で示すので、そこを直接直します。

**答えを引数で渡すと、質問せずに最後まで進みます。** 例: `/docdd:init よみログ "読書記録アプリ" commit`（1 つめがプロジェクト名、2 つめが何を作るか、末尾の `commit` でコミットまで）。このときは settings（まだ無ければ）を置き、既存の `CLAUDE.md` には表だけを足し、答えの無い欄は未記入のまま残します。git の管理や名前・メールが無ければ、止まってすることを報告します。

### 英語で出る確認と答え方

| いつ | 確認の内容 | 答え方 |
|---|---|---|
| Claude が `.claude/` のファイルを直接書き換えるとき（許可設定に行を足してと頼んだときなど） | 書き込んでよいか | Yes（"Yes, and allow Claude to edit files in this project's .claude folder for this session" でもよい。版によって文言が少し違う） |
| 導入後、次に起動したとき | このフォルダを信頼するか | Yes。これで `.claude/settings.json` の許可が有効になる |
| Next.js で `.mcp.json` を置いたあとの起動 | MCP サーバー（外部の道具とつなぐ仕組み）に接続してよいか | Next.js なら Yes、違えば No |
| コマンドを実行する前 | このコマンドを実行してよいか | 内容を読んで Enter。削除（`rm`）・送信（`git push`）・DB の操作を含み、迷ったら Esc で止めて「これは何をするの？」と聞く |
| 依存を足すとき（`npm install` など） | このコマンドを実行してよいか（"Yes, and don't ask again for …" の行もある） | 内容を読んで Yes。"don't ask again" は選ばない |

- `.claude/settings.json` を置くと、`git add`／`git commit`・検査コマンドは確認なしで進みます（allow の行）。まとめて消す削除（`rm -r`・`rm -f`）・`git push`・依存の追加は、auto モードでも必ず確認が出ます（ask の行）。強制 push・`--no-verify`・`sudo`・`.env` の読み取りは、どのモードでも禁止です（deny の行）。
- `git add -A` や、秘密の値の入ったコミットは、hook が止めます（下の「hook」の表）。hook は、許可の確認より前に動きます。
- **ファイルの編集のたびに確認が出るか**は、Claude Code の始まりのモードで決まります。雛形の `.claude/settings.json` は、モードを決めません。
  - Pro・Max・Team の人がターミナルで起動し、プロジェクトの `.claude/settings.json` にも、自分の PC 全体の設定（`~/.claude/settings.json`）にも `defaultMode` が無ければ、auto モード（別のモデルが安全を確かめて、自動で許可する）で始まります。これは Claude Code v2.1.228 以降（Windows でネイティブに動かすときは v2.1.233 以降）の動きです。
  - Enterprise の人・Console の API キーの人・古い版は、毎回確認するモード（Manual）で始まります。Claude Code を入れた・更新したあとの最初の起動と、`claude -p` での実行も Manual です。
- モードを変えたいときは、Claude Code に次のように頼みます（`"auto"` はプロジェクトの `.claude/settings.json` に書いても効きません。VS Code 拡張は、プロジェクトの `defaultMode` を読みません）。

  | したいこと | 頼むこと |
  |---|---|
  | 編集のたびに確認したい | 「`.claude/settings.json` の permissions に `"defaultMode": "default"` を足して」 |
  | 編集を自動にしたい（Manual で始まる人） | 「`.claude/settings.json` の permissions に `"defaultMode": "acceptEdits"` を足して」。ファイルの編集と、`mkdir`・`mv` などのファイル操作が確認なしになります |
  | auto モードで始めたい（Pro・Max・Team） | 「`.claude/settings.json` の permissions から defaultMode を消して」。PC 全体の設定に `"auto"` 以外の `defaultMode` があれば、そこを `"auto"` にします |
  | auto モードで始めたい（Enterprise・Console の API キー） | PC 全体の設定（`~/.claude/settings.json`）の permissions に `"defaultMode": "auto"` を書きます。このファイルはほかのプロジェクトにも効きます |

  auto モードが使えないとき（組織が止めている、モデルが対応していない など）は、Manual で始まります。公式: https://code.claude.com/docs/en/permission-modes ／ https://code.claude.com/docs/en/permissions

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

## Web 以外のプロジェクトで使う（例: Unity）

docdd は Web アプリが中心です。Unity などのゲーム・ネイティブアプリでも、仕様書・タスク・検証の表の進め方は使えます。Web の画面を前提にした所は、`CLAUDE.md` の「検証コマンド」表と「スキルへの追加指示」表で、このプロジェクトに合わせます。

### init が判定すること

`/docdd:init` は、次の目印でプロジェクトの種類を見分けます。

| 種類 | 目印 |
|---|---|
| Unity | `ProjectSettings/ProjectVersion.txt`（版は中の `m_EditorVersion`） |
| Godot | `project.godot` |
| Flutter | `pubspec.yaml` に `flutter:` がある |
| Android | `settings.gradle`・`build.gradle`（`.kts` も）に `com.android` がある |
| Xcode・Swift | 一番上の `*.xcodeproj`・`Package.swift` |
| .NET | 一番上の `*.sln`・`*.csproj`（Unity でないとき） |

目印があり、Web のフレームワーク（Next.js・Vite・React・Django・FastAPI・Flask・Rails など）が無ければ「Web 以外」として進めます。両方あれば Web として扱います。

- 「検証コマンド」表の『開発サーバー起動』『本番モード起動』を「無い」にします。Unity と Godot では『依存の脆弱性』も「無い」にします。Unity では『型検査』『lint』も「無い」にします（C# のコンパイルエラーは EditMode テストで出るため）。
- 『単体・DBテスト』『E2E（実際に動かす）』『ビルド』は推定しません。下の例（雛形の `CLAUDE.md` の例にも同じ内容があります）を見て書きます。
- `.gitignore` には「# docdd: 共通」の塊（`.env` など）を足します。Web 向けの塊（`node_modules/` など）は足しません（Python を見つけたときは「# docdd: Python」の塊も足します）。
- `Library/`・`Temp/` など、エンジンやツールが作るフォルダの中は見ません。`ProjectSettings/`・`Packages/`・`Assets/` の下のファイルは、既にある仕様書の候補に出しません。

### 検証コマンド表の書き方（Unity の例）

- 先に Unity Hub にサインインし、ライセンスを有効にしておきます（Unity Personal はコマンドラインで認証できません）。
- コマンドの Unity の場所は、macOS の Unity Hub の既定の場所の例です。環境で違います。`<版>` は `ProjectSettings/ProjectVersion.txt` の `m_EditorVersion` です。
- 結果とログは `Logs/`、ビルドの出力は `Builds/` に出します。Unity 向けの一般的な `.gitignore` は `Logs/` と `Builds/` を除外しています（無ければ足します）。

| 行 | 書く値 |
|---|---|
| 開発サーバー起動・本番モード起動・依存の脆弱性 | 無い |
| テスト用 DB | ③ DB 無し |
| 型検査・lint | 無い（init が「無い」と書きます。コンパイルエラーは EditMode テストの実行で出ます） |
| 単体・DBテスト | 下の EditMode テストのコマンド |
| E2E（実際に動かす） | 下の PlayMode テストのコマンド |
| ビルド | 無い、または下のビルドのコマンド（ビルド用のスクリプトが無くても作れます。docdd では確かめていません） |
| 全検査（push 前に1回） | 『単体・DBテスト』と『E2E（実際に動かす）』のコマンドを `&&` でつなぐ |

EditMode テスト（表にはバッククォートで囲んで書きます）:

```sh
mkdir -p Logs && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -nographics -projectPath "$(pwd)" -runTests -testPlatform EditMode -testResults "$(pwd)/Logs/editmode.xml" -logFile "$(pwd)/Logs/editmode.log"
```

PlayMode テスト（docdd では確かめていません）:

```sh
mkdir -p Logs && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -projectPath "$(pwd)" -runTests -testPlatform PlayMode -testResults "$(pwd)/Logs/playmode.xml" -logFile "$(pwd)/Logs/playmode.log"
```

ビルド（docdd では確かめていません。書き方は Unity 6000.3 の公式ドキュメントのとおり）。macOS の例:

```sh
mkdir -p Logs Builds && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -quit -projectPath "$(pwd)" -buildTarget osxuniversal -build "$(pwd)/Builds/<名前>.app" -logFile "$(pwd)/Logs/build.log"
```

- ビルド用のスクリプトが無くても、`-build`（出力先）と `-buildTarget`（または `-activeBuildProfile`）で作れます。
- テストと違い、ビルドには `-quit` を付けます。
- 出力先は、macOS なら `.app`、Windows なら `.exe` で終えます。Windows は `-buildTarget win64` にします。
- ビルドプロファイルを使うなら、`-buildTarget osxuniversal` の代わりに `-activeBuildProfile "Assets/Settings/Build Profiles/<名前>.asset"`（プロジェクトからの相対パス）を付けます。
- ビルド用のスクリプト（`Editor` フォルダーに置いた static メソッド）を作ったなら、`-build` とその出力先の代わりに `-executeMethod <クラス名.メソッド名>` で呼びます。

注意:

- **Editor で同じプロジェクトを開いていると動きません**（batchmode で開けません）。Editor を閉じてから回すか、Editor の Test Runner で回します。`/docdd:verify-e2e` は Editor を閉じません。閉じてから回すかをあなたに 1 回聞き、閉じられなければ、あなたに確かめてもらう手順を示します（探索的確認）。
- **`-runTests` に `-quit` を付けません。** テストが終わる前に Editor が閉じます。
- **テストが 0 件でも終了コードは 0（成功）です。** `-testResults` の XML の件数（`total`）も見ます（`/docdd:verify-e2e` は件数も見ます）。
- **PlayMode テストには `-nographics` を付けません**（付けてよいかの公式の記載が見つからないため）。
- Unity CLI（`unity test`・`unity mcp` など）は experimental（試験提供）で、docdd では確かめていません。

公式ドキュメント: https://docs.unity3d.com/6000.3/Documentation/Manual/test-framework/reference-command-line.html ／ https://docs.unity3d.com/6000.3/Documentation/Manual/EditorCommandLineArguments.html ／ https://docs.unity3d.com/6000.3/Documentation/Manual/build-command-line.html

### おすすめの「スキルへの追加指示」

既存の `CLAUDE.md` や運用文書に、コミットの前に承知を得る・決まったブランチで作業する・手で直さないファイルがある、などの約束があれば、`CLAUDE.md`「スキルへの追加指示」表に行を足します。行があるスキルは、その行を本文より優先します。

```markdown
| `/docdd:dev-loop` | コミットの前に差分を見せて運営者の承知を得る。作業は feature ブランチ（例: feature/unit-movement）で行い、main へ直接コミットしない。シーン（.unity）・プレハブ（.prefab）・.meta は手で書き換えず、Unity Editor か Editor スクリプトで変える |
```

コミットするほかのスキル（`/docdd:add-task`・`/docdd:tasks-from-prd`・`/docdd:refactor` など）にも、同じ約束の行を足します。

### 許可設定の直し方

`.claude/settings.json` の雛形では、`git commit` は確認なしで進みます（allow の行）。ファイルの編集も、auto モードで始まる人（上の「英語で出る確認と答え方」）では確認なしで進みます。約束に合わせて、Claude Code に次のように頼みます。

- コミットの前に必ず確認を出す: 「`.claude/settings.json` の allow にある `Bash(git commit:*)` を ask へ移して」
- エンジンが保存するファイルを Claude に書き換えさせない: 「deny に `Edit(**/*.meta)`・`Edit(**/*.unity)`・`Edit(**/*.prefab)` を足して」

`Edit` の deny は、Claude のファイル編集と、Claude Code が見分けられる一部の Bash のファイル操作（`sed` など）に効きます。スクリプトの中でファイルを書き換える処理までは止まりません（公式: https://code.claude.com/docs/en/permissions）。

### Web 以外で変わる動き

| スキル・検査 | Web 以外のプロジェクトでは |
|---|---|
| `/docdd:ui-polish`・`/docdd:speed-up`・`/docdd:playwright-cli` | 「該当なし」と報告して止まる（『開発サーバー起動』行が「無い」とき） |
| `/docdd:verify-e2e` | ブラウザを使わず、『E2E（実際に動かす）』行のコマンドで確かめる。結果の件数・失敗数も見る。動かせなければ、運営者に確かめてもらう手順を示す（探索的確認） |
| `/docdd:release` | 公開先をブラウザで開かず、運営者に確かめてもらう手順（入れ方・起動・操作・期待する見え方）を示す。確かめてもらうまでは「運営者確認待ち」。ホスティングを使わなければ、ビルド成功を待つ手順を飛ばす |
| 変更影響表（`.claude/rules/docdd-kit.md`） | 「画面・操作（Web 以外）」行（自動テストと運営者の確認）と、「エンジンやツールが保存するファイル」行（手で書き換えず、対になる .meta などの増減を `git status` で確かめる）を使う |
| `scripts/check-doc-refs.mjs` | `.cs`・`.unity`・`.prefab`・`.asset` などへの参照も検査する。既存の文書に、まだ無いファイルを見本として書いた行があると「無いファイル」と出る。その行に「例」の字を入れる（「例外」の「例」は数えない）か、コードブロックか HTML コメントの中に書く。見本を箇条で並べるなら、前の行を「例えば:」や「for example:」で終えると、続く箇条を検査しない |

## 中身

### init がプロジェクトへ置くもの

| パス | 役割 | 持ち主 |
|---|---|---|
| `CLAUDE.md` | このプロジェクトのコマンドの表（検証コマンド・反映コマンド）と「スキルへの追加指示」 | あなた |
| `.claude/rules/docdd-kit.md` | キット共通の約束（5 原則・変更影響 → 必須の検証・Definition of Done・規約）。毎回自動で読まれる | キット（直すと update-kit が聞く） |
| `.claude/settings.json` | 許可設定（確認なしで進めるコマンド・必ず確認するコマンド・禁止する操作）。始まりのモードは決めない。まだ無いときだけ、置く前に聞く | あなた |
| `.gitignore` | `.env`・秘密鍵・DB の控え・ログイン状態・一時ファイルを git に入れない（控えは一度 git へ入れると履歴から消せない）。塊は「# docdd: 共通」「# docdd: Web（Node.js・ビルド出力・Playwright）」「# docdd: Python」の 3 つ。共通はいつも、Web は Web のプロジェクトだけ、Python は Python を見つけたときだけ使う。既にあれば足りない行だけ足す | あなた |
| `.mcp.json` | MCP サーバーの設定。Next.js なら shadcn/ui と Next.js DevTools（版を固定）、それ以外は空 | あなた |
| `docs/README.md` | 仕様書の地図と「どこに何を書くか」 | あなた |
| `docs/PRD.md` | 何を作るか | あなた |
| `docs/requirements/README.md`・`00_template.md` | どう作るか（画面・データ・処理）の分け方と、文書の雛形 | あなた・見本 |
| `docs/decisions/README.md`・`0000-template.md` | 技術判断の記録（ADR）の置き場と雛形 | あなた・見本 |
| `docs/operations/development-and-testing.md` | テストの層・いつ回すか・テスト基盤が無いとき・落とし穴 | あなた |
| `docs/operations/backup-and-restore.md` | 控えに何が入らないか・戻す手順・戻せたことを確かめた記録 | あなた |
| `tasks/BACKLOG.md` | 作業キューと要決定。まだ動いているものだけを置く | あなた |
| `tasks/archive/BACKLOG-done.md` | 終えたタスクと決まった要決定の置き場（`scripts/backlog-archive.mjs` が移す。丸ごと読まず検索する） | あなた |
| `scripts/check-doc-refs.mjs` | 仕様書が指すファイルが実在するか。`docs/decisions/` の ADR が `decisions/README.md` の「ADR 一覧」に載っているか（見出しが無いプロジェクトでは突き合わせず、その旨を出す） | キット |
| `scripts/check-doc-dates.mjs` | 仕様書の更新日がコミットより古くないか、版と変更履歴が合うか | キット |
| `scripts/check-doc-placeholders.mjs` | 未記入の欄（`{{…}}`）が残っていないか | キット |
| `scripts/audit-check.mjs` | 依存ライブラリの既知の脆弱性（npm と `package-lock.json` 用。本番の依存の high・critical で落ちる） | キット |
| `scripts/backlog-archive.mjs` | 終えたタスク（`done`・`dropped`）と決まった要決定を BACKLOG からアーカイブへ移す（`--check` は移さずに見るだけ）。BACKLOG が育つと、読むだけで作業の場所を使い、末尾の未着手を見落とすため。`/docdd:dev-loop` が最初と完了時に、`/docdd:release` が §0 の最初に回し、`/docdd:doc-sync` が `--check` で移し忘れを見る | キット |
| `scripts/audit-allowlist.json` | 直さずに据え置く脆弱性の一覧（脆弱性の ID の単位。読むのは npm の `audit-check.mjs` だけ。初期は空） | あなた |
| `.docdd/manifest.json` | キットの版と、置いたファイルの記録（update-kit が使う。手で直さない） | init が作る |
| `package.json` の `scripts` | `package.json` があれば 4 行（`check:doc-dates`・`check:doc-refs`・`check:doc-placeholders`・`backlog:archive`）を足す。npm（`package-lock.json`、またはまだ lock が無い）なら `audit:check` も足して 5 行。無くても `node scripts/<名前>.mjs` で動く | あなた |

### プラグインが提供するスキル（15 本）

| スキル | いつ使う | 出力 |
|---|---|---|
| `/docdd:init` | 導入するとき、途中で止まった導入をやり直すとき（自分で打ったときだけ動く） | 雛形・推定した検証コマンド・未記入の欄の一覧・導入のコミット |
| `/docdd:add-task` | 要望や不具合を受け取ったとき（実装の前） | `tasks/BACKLOG.md` のタスクと要決定 |
| `/docdd:tasks-from-prd` | PRD に機能を複数書いたあと、最初の dev-loop の前 | 最初のタスク群（承認後に起票） |
| `/docdd:dev-loop` | 起票したタスクを 1 件進めるとき（`/docdd:dev-loop T-01` で指定もできる） | 実装・検証・docs の更新・コミットと報告 |
| `/docdd:doc-sync` | コミットの前（dev-loop が呼ぶ）。`--full` でコード全体と docs のずれを監査 | docs の更新と検査の結果 |
| `/docdd:verify-integration` | DB・migration（DB の変更手順）・権限・サーバー側の処理を変えたあと | テスト用 DB で通した統合検証の結果 |
| `/docdd:verify-e2e` | 利用者の操作の流れを変えたあと | 最後まで通した確認の結果（Web はブラウザで、Web 以外は『E2E（実際に動かす）』行のテストで） |
| `/docdd:ui-polish` | 画面や UI 部品を作る・直すとき（**Web 専用**） | 主な状態・画面幅・アクセシビリティ・実ブラウザの確認 |
| `/docdd:playwright-cli` | ブラウザ操作の道具箱（ほかのスキルから使う。**Web 専用**） | 画面の操作・スクショ・コンソールの確認 |
| `/docdd:refactor` | 振る舞いを変えずに中身を整えるとき（単体テストが無ければ監査だけ） | 監査の結果（毎回その場で取り直す）と、承認を得た単位の `tasks/BACKLOG.md` への起票、小さな改善のコミット |
| `/docdd:speed-up` | 画面が遅いと感じたとき（**Web 専用**。サーバー描画の Web アプリ向け。単体テストが無ければ計測と候補出しだけ） | 計測結果と改善のコミット |
| `/docdd:security-audit` | 公開前や、認証・課金・外部連携を触ったあと | 見つけた穴の報告。直すのは 1 件ずつあなたの「はい」を得てから |
| `/docdd:maintenance` | 週 1 回（`/docdd:maintenance monthly` で月次も） | 外部 API の変化・脆弱性・溜まったデータ・控えの鮮度の点検結果。月次は費用の実績と、控えから戻せるかの復元テスト（結果は `docs/operations/backup-and-restore.md` §5 へ） |
| `/docdd:release` | 依頼を全部終えたあと（自分で打ったときだけ動く） | 反映の方式（自動公開／確認してから公開／コマンドで公開／まだ公開しない）で経路を選ぶ。本番へ出す前に必ずあなたの「はい」を得る。**migration（DB の構造変更）を含むなら、本番 DB を変える前にバックアップを取る**（『本番 DB のバックアップ』行）。公開先の確認結果（Web 以外は、あなたに確かめてもらう手順）。壊れていたら『戻し方』行の手順で前の版へ戻す（あなたの「はい」を得てから。行が「無い」・未記入なら戻さずに止めて聞く） |
| `/docdd:update-kit` | プラグインを更新したあと（自分で打ったときだけ動く） | 置いた雛形を新しい版へ（手付かずは置き換え、手を入れたものは 1 件ずつ決める） |

**Web 専用**のスキルは、`CLAUDE.md`「検証コマンド」表の『開発サーバー起動』行が「無い」プロジェクト（Web 以外）では、「該当なし」と報告して止まります。

### hook（取り消しにくい操作を止める柵と、更新のお知らせ）

プラグインを入れると、Claude が Bash か PowerShell でコマンドを実行する直前に、`hooks/hooks.json` と `scripts/guard-bash.mjs` が確かめます。
効くのは docdd のプロジェクト（`.docdd/manifest.json` がある、または `tasks/BACKLOG.md` があり `CLAUDE.md` に `/docdd:` を含む）だけで、ほかのプロジェクトの作業は止めません。Claude の文脈（トークン）は使いません。

| 扱い | コマンド | 代わりにすること |
|---|---|---|
| 止める | まとめて全部を stage する `git add`（`-A`・`--all`・`.`・`:/`・`*`） | `git add <パス>` で変えたファイルだけを指定 |
| 止める | `git commit -a`（`-am` などを含む） | `git add <パス>` してから `git commit` |
| 止める | `git commit --amend`（直前のコミットの書き換え） | 新しいコミットを足す |
| 止める | `git commit --no-verify`・`-n`（コミット前の検査を飛ばす） | 検査が落ちた理由を直す |
| 止める | コミットメッセージに、角括弧つきの CI 省略の印（skip ci など） | 印を書かない |
| 止める | 強制 push（`--force`・`--force-with-lease`・`-f`・`+ブランチ名`） | 新しいコミットを足して、ふつうに push |
| 止める | `.env`・`.env.*` のファイルが入るコミット（`.env.example`・`.env.sample`・`.env.template` など、末尾が `.example`・`.sample`・`.template` のものは除く） | `git rm --cached <パス>` で stage から外す（作業中のファイルは残る）。`.gitignore` に `.env` と `.env.*` があるかを確かめる |
| 止める | `git add -f`／`--force` で `.env` の形のファイルを stage する | 値を空にした `.env.example` を作り、それを `git add` |
| 止める | コミットに入る中身に、秘密の値の形がある: 秘密鍵、AWS のアクセスキー ID、Anthropic・OpenAI・Stripe（本番）・GitHub・Slack・Google の API キーやトークン、Slack の Webhook の URL、Supabase の秘密キー、role が service_role の JWT | キーは `.env` に移し、コードでは環境変数から読む（`process.env.OPENAI_API_KEY` など）。直したら、そのファイルをもう一度 `git add` |
| 確認を出す | コミットに入る中身に、秘密らしい名前（`api_key`・`secret`・`token`・`password` など）へ 16 文字以上の文字列を入れた行がある。中身が大きすぎて（2MB を超える）全部を検査できない | 内容を読んで決める |
| 確認を出す | `rm` に `-r`・`-R`・`-f`・`--recursive`・`--force`。PowerShell の `Remove-Item` に `-Recurse`・`-Force`（別名の `del`・`rm` などは下の注記） | 内容を読んで決める |

- 秘密の値の検査は、`git commit` を含むコマンドの直前に動きます。見るのは、stage 済みの追加した行と、同じコマンドの中で `git commit` より前に `git add` したファイルです。`git commit --dry-run` では検査しません。push の前には検査しません。止めるときも、キーそのものは表示しません。
- 見本の値（`example`・`dummy`・`your-`・`xxxx` などを含む値）と、環境変数から読む行（`process.env` など）は止めません。
- 秘密の値でない（偽の値・公開してよい値）のに止まったら、Claude は、あなたに確かめてから、その行に `docdd-allow-secret` と書きます。その行は検査しません（`.env` のファイルには効きません）。例: Firebase の Web 用の設定の `apiKey` は公開してよい値ですが、Google の API キーの形なので止まります。
- PowerShell でも同じ判定をするように設定していますが、Windows の実機では確かめていません。
  - `Remove-Item` の別名（`del`・`rm` など）でも確認が出るかは、確かめていません。hook の呼び出しの条件は `PowerShell(Remove-Item *)` です。公式には、許可の規則では別名も同じに扱うとありますが、hook の条件（`if`）で同じかは書かれていません。
  - macOS・Linux の PowerShell（pwsh）では、`rm` は `Remove-Item` の別名ではなく、OS の `rm` です。`rm -rf` でも確認が出ないことがあります。

**更新のお知らせ（SessionStart）**: docdd のプロジェクトで Claude Code を起動・再開したとき、`scripts/notify-update.mjs` が、プラグインの版と `.docdd/manifest.json` に記録された雛形の版を比べます。プラグインのほうが新しければ、`/docdd:update-kit` を 1 行だけ案内します（v0.1 系なら移行の案内）。

- **何も直しません。** 更新するかはあなたが決めます（`/docdd:update-kit` は、あなたが自分で打ったときだけ動きます）。
- 版が同じとき・docdd のプロジェクトでないとき・manifest が読めないときは、何も出しません。
- 案内を止めたいときは、`.docdd/manifest.json` に `"notifyUpdates": false` を足します（`/docdd:update-kit` はこの行を消しません）。

## 手順書を直したいとき

1. **まず `CLAUDE.md` の「スキルへの追加指示」表に 1 行足します。** 例: `| /docdd:release | PR は作らず main へ直接 push する |`。行があるスキルは、その行を本文より優先します。プラグインを更新しても、この表はそのまま残ります。
2. 手順書を全部自分で持ちたいときだけ、Claude Code に「docdd の手順書を .claude/skills/ に写して」と頼みます。写したスキルは `/add-task` のような前置きの無い名前になり、プラグインのスキル（`/docdd:add-task`）と並んで**両方呼べます**。`CLAUDE.md`・`docs/README.md`・`tasks/` の中の呼び名を、写した側に揃えてください。

写すときの注意:

- 写した手順書の中の `/docdd:` の呼び出しは、プラグインのスキルのままです（例: 写した `dev-loop` も `/docdd:doc-sync` を呼ぶ）。写した側を使わせたいなら、中の呼び名も書き換えてもらいます。
- `init` と `update-kit` は写しません。プラグインの中のスクリプトを `${CLAUDE_PLUGIN_ROOT}` で呼ぶので、写すと動きません（`init` は組み込みの `/init` とも名前が重なります）。
- `references/` のフォルダがあるスキル（`release`・`verify-e2e` など）は、フォルダごと写します。
- 写した手順書は、プラグインを更新しても新しくなりません（`/docdd:update-kit` も見ません）。新しい版の変更は、`CHANGELOG.md` を見て手で取り込みます。

## 更新

- このマーケットプレイス（Anthropic 以外の配布元）は、**自動更新が既定でオフ**です。自動にするには `/plugin` → Marketplaces → 入れた配布元（このリポジトリなら claude-docdd-dev-kit）→ Enable auto-update。
- 手動で受け取るときは、まず `/plugin marketplace update claude-docdd-dev-kit`（配布元の一覧を取り直す）。そのあと `/plugin` の画面で docdd を更新するか、Claude Code を終了したターミナルで `claude plugin update docdd@claude-docdd-dev-kit`（反映には起動し直し）。入っている版は `/plugin list` で確かめます。ほかの配布元から入れたなら、`claude-docdd-dev-kit` を `/plugin list` に出る名前に読み替えます。
- 何が変わったかは [`CHANGELOG.md`](./CHANGELOG.md) に書きます。docdd は main に入れた時点で配布されるので、main には CI（自動の検査）で緑にした変更だけを入れます。入れている人が新しい中身を受け取れるのは、版の番号が上がったときです。
- 更新したあと docdd のプロジェクトを開くと、版のずれを hook が 1 行で知らせます（上の「hook」）。
- **プラグインを更新しても、プロジェクトに置いた雛形（`CLAUDE.md`・`scripts/` など）は変わりません。** 更新したら、プロジェクトのフォルダで `/docdd:update-kit` と打ちます。手付かずのファイルはまとめて置き換え、手を入れたファイルは差分を見て 1 件ずつ決めます。v0.1 系からの移行もこれで行います。
- update-kit が足すのは、**新しい版で増えた `##` の節**と、**`CLAUDE.md` の 3 つの表に増えた行**だけです。既存の節の中の箇条や文言の変更、`CLAUDE.md` 以外の文書の表の行は提案しないので、CHANGELOG の「雛形への影響」の『手で直すもの』を見て手で足します。
- 別の PC で使うときや入れ直したあとは、上の「入れ方」の 1・2 をもう一度打ちます（雛形の `.claude/settings.json` には、プラグインの取得元を書いていません）。

## やめるとき

`/plugin uninstall docdd@claude-docdd-dev-kit`（`@` の右は `/plugin list` に出る名前）で外すと、プラグインの設定とキャッシュは消えます。hook も一緒に効かなくなります。**プロジェクトに置いたファイルは残ります。**

Project の範囲で入れた（プロジェクトの `.claude/settings.json` の `enabledPlugins` で docdd を有効にしている）場合は、外すときに「自分だけ無効にする／全員から外す」を聞かれます。全員から外すを選ぶと、Claude Code が `.claude/settings.json` から docdd を消します。自分だけ無効にするを選ぶと、`.claude/settings.local.json` に無効にする指定が書かれ、`.claude/settings.json` の行は残ります。

| 残るもの | そのままだと | 消すなら |
|---|---|---|
| `/docdd:…` の参照（`CLAUDE.md`・`docs/README.md`・`tasks/` の中） | 無いスキルを案内し続ける | その行を消すか書き換える（`CLAUDE.md` の表は自分のコマンド表として残してよい） |
| `.claude/rules/docdd-kit.md` | 毎回読み込まれ、無いスキルを案内する | ファイルを消す（残すなら `/docdd:` の行を直す） |
| `.claude/settings.json`（許可設定。Project の範囲で入れて「自分だけ無効にする」を選んだときは、`enabledPlugins` の docdd の行も） | 許可設定は害がない。`enabledPlugins` の行は、docdd を有効にする指定として残る | 要らなければ消す（許可設定は残してよい） |
| `.mcp.json` | MCP サーバーの設定が残る | 使っていなければ消す |
| `scripts/` の 4 本と `package.json` に足した行（npm は 4 行、それ以外は 3 行） | 害はない（そのまま動く） | 消すなら `CLAUDE.md` の「docs の検査」「未記入欄の検査」「依存の脆弱性」行と、`docs/README.md` の検査の説明も直す |
| `.docdd/manifest.json`・`.gitignore` の `# docdd:` で始まる見出しの塊 | 害はない | 消してよい（`.gitignore` は残すのがおすすめ） |
| `docs/`・`tasks/` | あなたの仕様書と作業キュー | 残してよい |

消すときは Claude Code に「docdd の参照（`/docdd:`）と、上の表のファイルを消して」と頼み、差分を確かめてからコミットします。

## 注意

- 本番 DB のバックアップは、`CLAUDE.md`「反映コマンド」表の『本番 DB のバックアップ』行に書いたコマンドを `/docdd:release` が実行するだけです。キットは DB のコマンドを持ちません。取れているかは終了コードと出力の大きさで見ますが、**戻せるか**は `/docdd:maintenance monthly` の復元テストで確かめ、結果は `docs/operations/backup-and-restore.md` §5 に残ります。『戻し方』行（壊れた版を前へ戻す手順）も同じで、キットは戻すコマンドを持ちません。
- 検査は git が追跡しているファイルだけを見ます。新しく作ったファイルは、先に `git add` してから検査します。
- `check-doc-dates` はコミットの日付を読むので、コミットの後に回します（コミットが 1 件も無いと判定できません）。
- `.env` と `.env.*` は `.claude/settings.json` で**読み取り禁止**にしています。`.env.example` も読めなくなります。変数名を Claude に見せたいときは、その部分をチャットに貼るか、deny の `Read(./.env.*)` を `Read(./.env.local)` などの個別の名前に書き換えてもらいます。
- Claude Code のサンドボックス（`/sandbox`）を有効にしていると、init が `.claude/settings.json` と `.mcp.json` を書けないことがあります。その場合も残りの雛形は置き、Claude が確認つきで書き直すか、置けなかった中身を報告に載せます。
- hook と許可設定は「うっかり」を止める柵で、完全な守りではありません。別の書き方（`bash -c '…'` など）までは止められません（安全の仕組みの補助です）。秘密の値の検査も、決まった形のキーと名前だけを見ます。文字列をつないだ値や base64 にした値は見逃し、npm のトークンや Stripe のテスト用のキーは対象外です。
- `claude -p` のような確認を出せない実行では、`rm -r`・`rm -f` は実行されずに終わります。`/loop` は開いている会話の中で動くので確認が出て、答えるまでそこで止まります。
- コミットの名前やメールを間違えたときは、push する前なら `git commit --amend --reset-author` で直せます。hook は Claude の `--amend` を止めるので、Claude Code の外のターミナルで自分で打ちます。
- このキットは 2026 年 9 月時点の Claude Code（2.1 系）の仕組みを前提にしています。公式ドキュメント: https://code.claude.com/docs/en/plugins ／ https://code.claude.com/docs/en/skills ／ https://code.claude.com/docs/en/memory

### 依存の脆弱性の行と、据え置きの書き方

『依存の脆弱性』行は、init がパッケージマネージャに合わせて推定します。npm 以外も、本番の依存（開発用の依存を除く）の high 以上を見る形です。Python などは自分で書きます（例: `pip-audit`）。

| パッケージマネージャ | 『依存の脆弱性』行 |
|---|---|
| npm（`package-lock.json` がある、またはまだ lock が無い） | `node scripts/audit-check.mjs` |
| npm（`npm-shrinkwrap.json` だけ） | `npm audit --audit-level=high` |
| pnpm | `pnpm audit --audit-level=high --prod` |
| yarn v1 | `yarn audit --level high --groups dependencies` |
| yarn v2 以上 | `yarn npm audit --recursive --severity high --environment production` |
| bun | `bun audit --audit-level=high --prod` |

- yarn v1 は、high 未満の脆弱性だけでも失敗の終了コードで終わります（`--level` は終了コードを変えない。公式: https://classic.yarnpkg.com/lang/en/docs/cli/audit/）。深刻度は出力で見ます。
- 直さずに据え置く脆弱性の書き方は、『依存の脆弱性』行のコマンドで違います。
  - **npm（`node scripts/audit-check.mjs`）**: `scripts/audit-allowlist.json` に、脆弱性の ID（`ids`。`GHSA-` で始まる）・理由（`why`）・期限（`until`）を書きます（下の形）。3 つとも必須で、欠けていたり古い書き方（値が文字列）だったりすると、検査は書き方を示して止まります。書くのは脆弱性を持つパッケージ（例: `qs`）で、それを使う親（例: `express`）ではありません。同じパッケージでも `ids` に無い脆弱性が出たら落ち、期限を過ぎても落ちます（依存を上げるか、理由を書き足して期限を延ばす）。critical は据え置けません。検査が落ちたときに、貼れる形の JSON が出ます。
  - **npm 以外（pnpm・yarn・bun・Python など）**: `scripts/audit-allowlist.json` は読まれません。据え置くなら、`tasks/BACKLOG.md` の「要決定・外部準備（ユーザー作業）」に、ID・理由・期限を書きます。その間、『依存の脆弱性』行は落ちたままです（`/docdd:maintenance` が毎週、出た ID と突き合わせます）。

```json
{ "<パッケージ名>": { "ids": ["GHSA-xxxx-xxxx-xxxx"], "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" } }
```

## 困ったら

- 不具合・質問（分かりにくい所）・要望は [Issues](https://github.com/no1013kota/claude-docdd-dev-kit/issues/new/choose) へ。3 つの中から選べます（無料の GitHub アカウントが要ります）。日本語でも英語でも書けます。
- 不具合で書いてほしいこと（必ず要るのは、起きたことと docdd の版だけです）: `claude --version` の結果、OS、docdd の版（`/plugin list`）、打ったスキル（引数も）、失敗したときの文面そのまま（英語も訳さずに）。
- API キーや `.env` の中身は貼らないでください。

## 保守する人へ

- リリースの手順は [`RELEASING.md`](../../RELEASING.md)。main に入れた時点で配布されるので、`plugins/docdd/` を変えたら同じ PR で版を上げます（`README.md`・`CHANGELOG.md`・`evals/` だけなら上げない）。検査は `npm run check`（版の上げ忘れも見る）、外部リンクは `npm run check:urls`、テストは `npm test`（リポジトリの一番上で）。
- スキルの `allowed-tools` に runner 単体（`Bash(npx:*)`・`Bash(npm:*)`・`Bash(pnpm:*)`・`Bash(bash -c *)` など）を書かないでください。そのスキルを呼んだターンの間、中で動く何でもが確認なしで通ります。`Bash(npx playwright-cli *)` のように、runner と内側のコマンドの組で書きます（`npm run check` が見ます）。
- hook の動作は `tests/guard-bash.test.mjs` で確かめます。例: `git add -A && git commit`・`git commit --amend`・`git push -f origin main`・`.env` の入ったコミットは止まり、`rm -rf build` は確認が出て、`git add CLAUDE.md docs/PRD.md`・`git push origin stg` は通ります。
