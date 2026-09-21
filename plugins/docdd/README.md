# docdd — 非エンジニアのための Claude Code 開発キット

**何か**: Claude Code のプラグインです。約束ごと・仕様書・作業キューの雛形と、決まった手順書（スキル）をまとめて入れます。
**誰向けか**: 1 人で Web アプリやゲームなどを作り続ける非エンジニア（日本語で使う人）。
**何ができるか**: 要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で Claude Code に進めさせます。
**使える環境**: Claude Code（ターミナル・Desktop・IDE）向けです（詳しくは「[どこまで使えるか](#どこまで使えるか)」）。

## 前提

| 道具 | 要るか | 使う場面 | 無いと |
|---|---|---|---|
| Claude Code（有料プラン: Pro・Max・Team・Enterprise、または Console のアカウント） | 必須 | すべて | 使えない |
| git | 必須 | init とすべてのスキル（変更の記録と検査） | init が止まり、入れ方を案内する |
| Node.js 18 以上（LTS＝長く保守される版を推奨） | 必須 | init・検査スクリプト・hook | init が止まり、入れ方を案内する |
| git の push 先（`origin`） | release を使うなら必須 | `/docdd:release` | 反映できない（push で止まる） |
| gh（GitHub をコマンドで操作する道具） | 任意 | GitHub での `/docdd:release`（PR の作成・CI の待ち・ホスティングのビルドの待ち） | 「確認してから公開」「コマンドで公開」では push の前に止まり、`gh auth login` するか、CI の確認と PR を GitHub の画面で行うかを聞く。ビルドの成功はホスティングの画面で確かめる |
| playwright-cli とブラウザ | 任意 | Web のプロジェクトの `/docdd:ui-polish`・`/docdd:verify-e2e`・release の公開先確認 | 手作業の確認に切り替えて、その旨を報告する |

- どんな技術のプロジェクトでも入れられます。自動で整う範囲は技術で変わります（下の「[どこまで使えるか](#どこまで使えるか)」）。
- playwright-cli が無ければ、入れてよいかを聞いてから入れます（道具の中の英語の手順書を読んでよいかの確認が出たら、内容を読んで答えます。断っても進みます）。ブラウザは手元の Google Chrome を使い、無ければ Playwright 用のブラウザ（初回に数百 MB のダウンロード）を、聞いてから取得します。
- Windows: **Git for Windows を入れてください**。Windows の Claude Code は PowerShell でもコマンドを実行します（Git for Windows が無ければ PowerShell だけ。公式: https://code.claude.com/docs/en/tools-reference）。docdd の手順（`mkdir -p` など）と雛形の許可設定（`.claude/settings.json` の `Bash(…)` の規則）は bash 向けです。hook は PowerShell にも対応しています。
- Desktop アプリ・VS Code: 画面からも入れられます（Desktop は入力欄の横の ＋ → Plugins、VS Code は入力欄に `/plugins`。配布元に `no1013kota/claude-docdd-dev-kit` を足してから docdd を入れる）。画面で入らないときは、ターミナルで `claude plugin marketplace add no1013kota/claude-docdd-dev-kit` → `claude plugin install docdd@claude-docdd-dev-kit` を打ちます。ターミナルで入れた docdd も、Desktop・VS Code でそのまま使えます。

## どこまで使えるか

仕様書・タスク・要決定・コミットの流れ（add-task・dev-loop・doc-sync など）は、**どの技術のプロジェクトでも使えます**。技術や環境で変わることを、次にまとめます。

### 使える場所

| Claude Code の使い方 | 使えるか |
|---|---|
| ターミナル（macOS・Linux） | 使える |
| Desktop アプリ（手元のセッション）・VS Code などの IDE | 使える（入れ方は上の「前提」の Desktop アプリ・VS Code の箇条） |
| Windows | Git for Windows を入れて使う |
| Desktop アプリの WSL のセッション | 対応していない（プラグインが読み込まれない） |
| claude.ai/code・Desktop アプリのクラウドのセッション（クラウドで動く Claude Code） | 対応していない（`/plugin` が無く、手元で入れた docdd も持ち込まれない） |
| Cowork | この README の入れ方では出ない（Cowork は claude.ai のアカウントに入れたプラグインを使う） |

- 取り消しにくい操作を止める見張り（hook）には、Claude Code 2.1.139 以上が要ります（Windows の PowerShell では 2.1.147 以上）。`claude --version` で確かめ、古ければ `claude update` で更新します。
- 1 人の運営者が日本語で使う前提です。チームで使うための仕組み（担当の割り当て・作業の取り合いを防ぐ）はありません。
- 表の見出し・行の名前・タスクの状態（『検証コマンド』『型検査』『要決定』・`todo`／`done` など）は、スクリプトとスキルが字のまま読みます。訳したり言い換えたりせず、そのまま使います。

### プロジェクトの種類

init は、`CLAUDE.md` の「検証コマンド」表（テスト・lint・ビルドなど）を、プロジェクトの設定ファイルから**自動で埋められるだけ埋めます**。埋まらない行は init が聞くので、分かる範囲で答えます（未記入の行は、スキルが理由を添えて飛ばします）。

表の『開発サーバー起動』行が「無い」だと、docdd は Web の画面が無いプロジェクトと見なします。このとき ui-polish・speed-up は「該当なし」で止まり、verify-e2e はブラウザを使いません。画面をブラウザで確かめるなら、この行に起動のコマンドと開くアドレスを書きます。

| プロジェクト | 表の自動の埋まり方 | 『開発サーバー起動』行 |
|---|---|---|
| Node.js の Web アプリ（Next.js・Vite・React・Vue（Vite で作ったもの）・Svelte・SvelteKit・Remix など） | ほぼ全部（Nuxt・Astro は本番モード起動と型検査を自分で書く） | 自動で入る |
| Python の Web アプリ（Django・FastAPI・Flask） | テスト・lint・型検査・依存の脆弱性（設定か依存に書いてあるものだけ） | 自分で書く |
| Go | テスト・ビルド・lint だけ | 自分で書く |
| Rails・PHP（Laravel など）・Rust・Java・静的な HTML など | ほとんど自分で書く | 自分で書く（Laravel は自動で入るが、素材用のサーバーなので `php artisan serve` などに直す） |
| Unity・Godot・Flutter・Android・Xcode／Swift・.NET | ほとんど自分で書く（書き方の見本は Unity だけ） | 「無い」になる。ui-polish・speed-up は「該当なし」で止まり、verify-e2e は E2E 行のテストか、あなたの確認で確かめる（下の「[Web 以外のプロジェクトで使う](#web-以外のプロジェクトで使う例-unity)」） |

次のプロジェクトは、init のあとに表を直します。
- **Expo・React Native と、Vite や React を使う Electron** は Web と見なされ、『開発サーバー起動』行に `npm start` などが自動で入ります。画面のスキルを使わないなら、この行を「無い」にします。
- **Vue CLI（Vite を使わない Vue）** は Web と見なされず、この行が「無い」になります。画面のスキルを使うなら、起動のコマンドと開くアドレスを書きます（例: `npm run serve`（http://localhost:8080 で開く））。
- **ASP.NET Core・Flutter の Web アプリ**は Web 以外と見なされ、この行が「無い」になります（.csproj が下のフォルダにしか無いときは、init が聞きます）。画面のスキルを使うなら、起動のコマンドと開くアドレスを書きます（例: `dotnet watch`（http://localhost:5000 で開く））。
- **package.json も置いてある Python・Go・Rails・Laravel** は、package.json だけを見て表を埋めます。テスト・lint などが「無い」になり、init は聞きません。自分で直します（Go は『開発サーバー起動』も「無い」になります）。

### 機能ごとに要るもの

| スキル・機能 | 要るもの・対応している範囲 |
|---|---|
| `/docdd:release`（本番へ出す） | git の push 先（`origin`）。「確認してから公開」「コマンドで公開」では、GitHub と gh があれば PR の作成と CI の待ちまで自動（CI の自動の待ちは GitHub Actions だけ。ほかの CI は画面で確かめる）。「自動公開」は、push で公開するホスティング（Vercel など）が前提で、PR は作らない |
| 本番 DB の控え | migration を含む反映のときに、release が『本番 DB のバックアップ』行のコマンドで取る。行が未記入なら、控えのコマンドの候補を 1 つ示して聞く（手順書に例があるのは Supabase・PostgreSQL・MySQL・SQLite。ほかの DB は、示された候補を確かめてから書く）。DB サービスの自動の控えに任せることもできる |
| 依存の脆弱性の検査 | 直さずに据え置く一覧（`scripts/audit-allowlist.json`）は npm（`package-lock.json`）用。pnpm・yarn・bun・Python では、据え置く脆弱性を `tasks/BACKLOG.md` の「要決定」に書く（行の結果には出続けるので、`/docdd:maintenance` が毎週突き合わせる） |
| `/docdd:verify-integration`（DB の検証） | テスト用の DB（手元の DB か、本番と別の開発専用の DB）と、テストのコマンド（『単体・DBテスト』行）。テストが無ければ「未実施」と報告する。DB を使わないなら「該当なし」 |
| `/docdd:verify-e2e`（操作の検証） | 本番を指さない設定と、外部への送信・課金・メールを実物へ出さない設定（テスト用のキー・手元の受信箱など）。その機能が無ければ「該当なし」。機能があって設定が無ければ、止まって報告する |
| `/docdd:refactor`・`/docdd:speed-up` | 単体テスト。無いと止まる（`--audit` を付ければ、見るだけ・測るだけはできる）。speed-up はサーバーで画面を作る Web アプリ向け |

### 気をつけること

- **モノレポ**（`apps/web` のように 1 つのリポジトリに複数のアプリ）: docdd を入れたフォルダで Claude Code を開きます。
- **Python**: 検証コマンドは、仮想環境の中で動く形に直します（`uv run`・`poetry run` は自動で付く。pip・pipenv の人は自分で）。
- **テストのコマンドは、終わる形にします**（`jest --watchAll` など、見張り続けるものは Claude Code の中で止まらない）。
- **Windows の改行**: `/docdd:update-kit` が見せる差分の前後が同じ文に見えるとき（改行の違いだけ）は、「新しい版で置き換える」を選びます。

## 全体像

docdd は、約束（このプロジェクト用の `CLAUDE.md` と、キット共通の `.claude/rules/docdd-kit.md`）・仕様書（`docs/`）・作業キュー（`tasks/BACKLOG.md`）・手順書（スキル `/docdd:…`）の 4 つをプロジェクトにそろえ、Claude Code がいつも同じ順で動くようにします。**流れの図と、それぞれの置き場の役割は [リポジトリの README](../../README.md#全体像)** にあります（この README は、その細部を書いたものです）。

- **スキルを通さず自分でコードを直したとき（`/docdd:ui-polish` だけで画面を直したときも）は、コミットの前に `/docdd:doc-sync`** を打ちます（仕様書と実装がずれたままにしない）。dev-loop・refactor・speed-up・security-audit は中で呼ぶので要りません。
- **docs を自分で書き換えたときは、`/docdd:tasks-from-docs` で書き換えた所をタスクにします**（PRD・requirements・自分で置いた仕様書のどれでも）。docs を書き換えただけでは、アプリは変わりません。書き換えたら、コミットせずにそのまま打ちます（tasks-from-docs はコミットしていない書き換えの節を読み、そのタスクを進める `/docdd:dev-loop` が、書き換えた文書もコミットに含めます。表記の直しなど、タスクにならない書き換えは tasks-from-docs が聞いてからコミットします）。書き換えを先にコミットしたときは、直前のコミットなら `/docdd:tasks-from-docs HEAD~1`（2 つ前からなら `HEAD~2`）と打ちます。
- 検証と反映のコマンドは、`CLAUDE.md` の表に書いたものを使います。表で「無い」の行は飛ばし、未記入（`{{…}}` のまま）の行は実行せずに報告します。表を埋めるほど、検証が確実になります。

**この README の読み方**: 導入は「[前提](#前提)」→「[どこまで使えるか](#どこまで使えるか)」→「[入れ方](#入れ方)」→「[init のあとにやること](#init-のあとにやること)」。困ったときは「[英語で出る確認と答え方](#英語で出る確認と答え方)」「[注意](#注意)」。データの控えと、前の版へ戻す手順は「[控えと戻し方](#控えと戻し方)」。Unity などは「[Web 以外のプロジェクトで使う](#web-以外のプロジェクトで使う例-unity)」。中身の一覧は「[中身](#中身)」（置くファイル・スキル 15 本・hook）。

## 入れ方

**まだアプリのコードが無いとき**は、先にアプリの土台を作ります。空のフォルダで Claude Code に「Next.js（など）で新しいアプリの土台を作って、動くところまで」と頼み、画面が出たら次へ進みます（Unity などは Unity Hub で新しいプロジェクトを作る）。土台が無いまま init を打つと、先に土台を作るかを聞きます。

アプリのフォルダで Claude Code を開き、次を順に打ちます。1・2 は一度だけで、ほかのプロジェクトでも使えます。

1. `/plugin marketplace add no1013kota/claude-docdd-dev-kit`
2. `/plugin install docdd@claude-docdd-dev-kit`（範囲を聞かれたら User。そのまま有効になります。会話を読み直す旨の警告が出たときだけ `/reload-plugins --force`）
3. `/docdd:init`（前置きの無い `/init` は Claude Code 組み込みの別コマンドなので打たない）

`/docdd:init`・`/docdd:release`・`/docdd:update-kit` は、**あなたが自分で打ったときだけ動きます**。Claude が会話の流れで勝手に導入したり、本番へ出したりはしません。

### init がすること

- git で管理していなければ `git init` の承知を取ります。コミットに残す名前とメールが無ければ聞き、このリポジトリだけに設定します。
- 分からないことだけを聞きます。**選んで答える問いを先に**（選択の画面。多いときは 2 回に分かれます）、**書いて答える問いをあとで**（番号付きの 1 つのメッセージ）、分けて聞きます。
  - 選んで答える: 反映の方式（自動公開／確認してから公開／コマンドで公開／まだ公開しない）・テスト用 DB・`.claude/settings.json` を置いてよいか（まだ無いときだけ）・既存の `CLAUDE.md` の扱い・既存の `tasks/BACKLOG.md` に書式の節を足すか・終わったらコミットしてよいか
  - 書いて答える: プロジェクト名と何を作るか・既にある仕様書・PRD のやること／やらないこと・公開先 URL・本番ブランチ（「確認してから公開」なら作業ブランチも）・テスト用 DB の起動コマンドかキー名・有料 API の費用上限・推定できなかった検証コマンドの行
- 『本番 DB のバックアップ』と『戻し方』は init では聞きません（未記入のまま置きます。テスト用 DB で ③ を選んだときは、『本番 DB のバックアップ』に「無い（DB を使わない）」と書きます）。migration を含む反映のとき・公開先で不具合が見つかったときに、`/docdd:release` が候補を示して聞き、その場で表へ書きます。
- テスト用 DB は「① 手元で起動する／② ホスト型の開発専用／③ 使わない」から選びます。② は、本番と別・開発専用・破棄可能な接続先にします（init が『テスト用 DB』行にそう書き、`/docdd:verify-integration` はそう書いた接続先だけを使います）。
- **検証コマンド（型検査・lint・テストなど）は、まず推定します。** `package.json`・`pyproject.toml` などから表に書き、推定できなかった行だけを聞きます（違っていたら直します。どこまで推定できるかは「[どこまで使えるか](#どこまで使えるか)」）。
- **既存のファイルは上書きしません。** 既存の `.claude/settings.json`・`.mcp.json` には触らず、雛形との差分を報告するだけです。既存の `CLAUDE.md` は「置き換える（元は `CLAUDE.md.bak` に残す）／表だけ末尾に足す（おすすめ）／そのまま（表が無いので、スキルは『先に `/docdd:init` を実行してください』で止まります）」から選びます。`.gitignore` は足りない行だけを足します。
- 最後に、置いたもの・推定した行・未記入の欄（`ファイル:行`）・次の一手を報告します。

**何度打っても安全です。** 途中で止まったり、答えられない欄が残ったりしたら、もう一度 `/docdd:init` と打つと、足りないファイルを置き、答えられる欄を聞き直します。自動で推定できない行は一覧（`ファイル:行`）で示すので、そこを直接直します。

**答えを引数で渡すと、質問せずに最後まで進みます。** 例: `/docdd:init よみログ "読書記録アプリ" commit`（1 つめがプロジェクト名、2 つめが何を作るか、末尾の `commit` でコミットまで）。このときは settings（まだ無ければ）を置き、既存の `CLAUDE.md` には表だけを足し、答えの無い欄は未記入のまま残します。git の管理や名前・メールが無ければ、止まってすることを報告します。

### 英語で出る確認と答え方

| 確認の内容 | 出るとき | 答え方 |
|---|---|---|
| 書き込んでよいか | Claude が `.claude/` のファイルを直接書き換えるとき（許可設定に行を足してと頼んだときなど） | Yes（"Yes, and allow Claude to edit files in this project's .claude folder for this session" でもよい。版によって文言が少し違う） |
| このフォルダを信頼するか | 導入後、次に起動したとき | Yes。これで `.claude/settings.json` の許可が有効になる |
| MCP サーバー（外部の道具とつなぐ仕組み）に接続してよいか | Next.js で `.mcp.json` を置いたあとの起動 | Next.js なら Yes、違えば No |
| このコマンドを実行してよいか | コマンドを実行する前 | 内容を読んで Enter。削除（`rm`）・送信（`git push`）・DB の操作を含み、迷ったら Esc で止めて「これは何をするの？」と聞く |
| このコマンドを実行してよいか（"Yes, and don't ask again for …" の行もある） | 依存を足すとき（`npm install` など） | 内容を読んで Yes。"don't ask again" は選ばない |

- `.claude/settings.json` を置くと、`git add`／`git commit`・検査コマンドは確認なしで進みます（allow の行）。まとめて消す削除（`rm -r`・`rm -f`）・`git push`・依存の追加（`npm install`・`pnpm add`・`yarn add`・`pip install` の形）は、auto モードでも必ず確認が出ます（ask の行）。強制 push・`--no-verify`・`sudo`・`.env` の読み取りは、どのモードでも禁止です（deny の行）。
- `git add -A` や、秘密の値の入ったコミットは、hook が止めます（下の「hook」の表）。hook は、許可の確認より前に動きます。
- **ファイルの編集のたびに確認が出るか**は、Claude Code の始まりのモードで決まります。雛形の `.claude/settings.json` は、モードを決めません。
  - Pro・Max・Team の人がターミナルで起動すると、設定に `defaultMode` が無ければ、auto モード（別のモデルが安全を確かめて、自動で許可する）で始まります。
  - Enterprise の人・Console の API キーの人・古い版の Claude Code は、毎回確認するモード（Manual）で始まります。
- モードを変えたいときは、Claude Code に次のように頼みます（`"auto"` は、プロジェクトの `.claude/settings.json` ではなく PC 全体の設定に書きます。VS Code 拡張では、プロジェクトの `defaultMode` は使われません）。

  | したいこと | 頼むこと |
  |---|---|
  | 編集のたびに確認したい | 「`.claude/settings.json` の permissions に `"defaultMode": "default"` を足して」 |
  | 編集を自動にしたい（Manual で始まる人） | 「`.claude/settings.json` の permissions に `"defaultMode": "acceptEdits"` を足して」。ファイルの編集と、`mkdir`・`mv` などのファイル操作が確認なしになります |
  | auto モードで始めたい（Pro・Max・Team） | 「`.claude/settings.json` の permissions から defaultMode を消して」。PC 全体の設定（`~/.claude/settings.json`）に `"auto"` 以外の `defaultMode` があれば、そこを `"auto"` にします |
  | auto モードで始めたい（Enterprise・Console の API キー） | PC 全体の設定（`~/.claude/settings.json`）の permissions に `"defaultMode": "auto"` を書きます。このファイルはほかのプロジェクトにも効きます |

  auto モードが使えないとき（組織が止めている、モデルが対応していない など）は、Manual で始まります。公式: https://code.claude.com/docs/en/permission-modes ／ https://code.claude.com/docs/en/permissions

### 目安

版・モデル・プロジェクトの大きさで変わるので、あくまで目安です。

- `/docdd:init` は数分〜10 分ほど。ヒアリングは 2〜3 回（選んで答える問いと、書いて答える問い）です。書く問いに番号どおりまとめて答えると往復が減ります。
- `/docdd:add-task` は数分、`/docdd:dev-loop` は 1 タスク 10〜20 分ほど。
- どれも Claude Code の利用枠（プランの使用量）を使います。

## init のあとにやること

### 既に仕様書やメモがあるとき

init のヒアリングで「既にある仕様書」を聞かれたら、そのファイル（README・docs の文書・Notion の書き出しなど）のパスを書くか、中身を貼ります。原文を `docs/_imported/` へ移すかも答えます。
Claude がそこから `docs/PRD.md` の下書きを作って見せ、あなたの承知を得ます。移すと答えた原文（Markdown）は `docs/_imported/` へ移します（冒頭に「正本は docs/PRD.md」の 1 行。以後は原文を直しません）。
画面やデータの細かい記述はその場では分けず、「取り込んだ仕様を requirements へ分ける」タスクとして起票します。

### 最初の 3 手

1. init の報告に出た未記入の欄（`{{…}}`）を埋めます。特に `docs/PRD.md` の「やること（機能一覧）」「やらないこと」。記入例は [`examples/PRD.sample.md`](./examples/PRD.sample.md)（架空の美容室の予約アプリ）。分からない欄は Claude Code に「候補を挙げて質問して」と頼みます（勝手に確定させない）。
2. タスクを作ります。仕様書に機能を複数書いたら `/docdd:tasks-from-docs`（まとめて下書き → 承認後に起票）。1 件だけなら `/docdd:add-task` の後ろにやりたいことを書きます（例: `/docdd:add-task メールアドレスで登録・ログインできるようにしたい`）。
3. `/docdd:dev-loop` と打ちます。init が「アプリの土台を作る」や「テスト基盤の導入」を起票していれば、それが最初のタスクです。テスト基盤の導入では依存を追加する確認（`npm install` など）が出ます。内容を読み、"Yes, and don't ask again for …" は選ばず Yes を選んでください。

### 途中から導入する場合（コードが既にある）

init は既存のコードを見つけると、次の一手に `/docdd:doc-sync --full` を案内します。
これは、いまのコードと docs を突き合わせます。docs が雛形のままなら、実装済みの機能を `docs/requirements/` の文書と PRD の機能一覧に書き起こし、1 コミットにします。
料金やスコープなど、あなたが決めることは書かずに `tasks/BACKLOG.md` の「要決定」へ回します。済んだら `/docdd:tasks-from-docs` か `/docdd:add-task` へ進みます（tasks-from-docs は、実装済みに見える所をタスクにしません）。

## Web 以外のプロジェクトで使う（例: Unity）

docdd は Web アプリが中心です。Unity などのゲーム・ネイティブアプリでも、仕様書・タスク・検証の表の進め方は使えます。Web の画面を前提にした所は、`CLAUDE.md` の「検証コマンド」表と「スキルへの追加指示」表で、このプロジェクトに合わせます。

### init が判定すること

`/docdd:init` は、Unity・Godot・Flutter・Android・Xcode・Swift・.NET のプロジェクトで、Web のフレームワーク（Next.js・Django など）が無ければ「Web 以外」として進め、報告に「Web 以外のプロジェクトです」と出します（Web のフレームワークもあれば Web として扱います）。

- 「検証コマンド」表の『開発サーバー起動』『本番モード起動』を「無い」にします。Unity と Godot では『依存の脆弱性』も「無い」にします。Unity では『型検査』『lint』も「無い」にします（C# のコンパイルエラーは EditMode テストで出るため）。
- 『単体・DBテスト』『E2E（実際に動かす）』『ビルド』は推定しません。下の例（雛形の `CLAUDE.md` の例にも同じ内容があります）を見て書きます。

### 検証コマンド表の書き方（Unity の例）

- 先に Unity Hub にサインインし、ライセンスを有効にしておきます。
- コマンドの Unity の場所は、macOS の Unity Hub の既定の場所の例です。環境で違います。`<版>` は `ProjectSettings/ProjectVersion.txt` の `m_EditorVersion` です。
- 結果とログは `Logs/`、ビルドの出力は `Builds/` に出します。`.gitignore` に `Logs/` と `Builds/` が無ければ足します。

| 「検証コマンド」表の行 | 書く値 |
|---|---|
| テスト用 DB | ③ DB 無し |
| 単体・DBテスト | 下の EditMode テストのコマンド |
| E2E（実際に動かす） | 下の PlayMode テストのコマンド |
| ビルド | 無い、または下のビルドのコマンド |
| 全検査（push 前に1回） | 『単体・DBテスト』と『E2E（実際に動かす）』のコマンドを `&&` でつなぐ |

EditMode テスト（表にはバッククォートで囲んで書きます）:

```sh
mkdir -p Logs && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -nographics -projectPath "$(pwd)" -runTests -testPlatform EditMode -testResults "$(pwd)/Logs/editmode.xml" -logFile "$(pwd)/Logs/editmode.log"
```

PlayMode テスト（`-nographics` は付けません）:

```sh
mkdir -p Logs && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -projectPath "$(pwd)" -runTests -testPlatform PlayMode -testResults "$(pwd)/Logs/playmode.xml" -logFile "$(pwd)/Logs/playmode.log"
```

ビルド（書き方は Unity 6000.3 の公式ドキュメントのとおり）。macOS の例:

```sh
mkdir -p Logs Builds && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -quit -projectPath "$(pwd)" -buildTarget osxuniversal -build "$(pwd)/Builds/<名前>.app" -logFile "$(pwd)/Logs/build.log"
```

- Windows では `-buildTarget win64` にし、出力先を `.exe` で終えます。ビルドプロファイルやビルド用のスクリプトを使う書き方は、置かれた `CLAUDE.md`「検証コマンド」表の下のコメント（Unity のビルドの例）にあります。

注意:

- **コマンドで回すときは、Editor で同じプロジェクトを閉じておきます**（batchmode は、Editor で開いているプロジェクトを開けないため）。閉じられないときは、Editor の Test Runner で回します。`/docdd:verify-e2e` は Editor を閉じません。閉じてから回すかをあなたに 1 回聞き、閉じられなければ、あなたに確かめてもらう手順を示します（探索的確認）。
- **`-runTests` に `-quit` を付けません**（付けると、テストが終わる前に Editor が閉じます）。

公式ドキュメント: https://docs.unity3d.com/6000.3/Documentation/Manual/test-framework/reference-command-line.html ／ https://docs.unity3d.com/6000.3/Documentation/Manual/EditorCommandLineArguments.html ／ https://docs.unity3d.com/6000.3/Documentation/Manual/build-command-line.html

### おすすめの「スキルへの追加指示」

既存の `CLAUDE.md` や運用文書に、コミットの前に承知を得る・決まったブランチで作業する・手で直さないファイルがある、などの約束があれば、`CLAUDE.md`「スキルへの追加指示」表に行を足します。行があるスキルは、その行を本文より優先します。

```markdown
| `/docdd:dev-loop` | コミットの前に差分を見せて運営者の承知を得る。作業は feature ブランチ（例: feature/unit-movement）で行い、main へ直接コミットしない。シーン（.unity）・プレハブ（.prefab）・.meta は手で書き換えず、Unity Editor か Editor スクリプトで変える |
```

コミットするほかのスキル（`/docdd:add-task`・`/docdd:tasks-from-docs`・`/docdd:refactor` など）にも、同じ約束の行を足します。

### 許可設定の直し方

`.claude/settings.json` の雛形では、`git commit` は確認なしで進みます（allow の行）。ファイルの編集も、auto モードで始まる人（上の「英語で出る確認と答え方」）では確認なしで進みます。約束に合わせて、Claude Code に次のように頼みます。

- コミットの前に必ず確認を出す: 「`.claude/settings.json` の allow にある `Bash(git commit:*)` を ask へ移して」
- エンジンが保存するファイルを Claude に書き換えさせない: 「deny に `Edit(**/*.meta)`・`Edit(**/*.unity)`・`Edit(**/*.prefab)` を足して」

`Edit` の deny が止めるのは、Claude のファイル編集と、Claude Code が見分けられる一部の Bash のファイル操作（`sed` など）です（公式: https://code.claude.com/docs/en/permissions）。

### Web 以外で変わる動き

| スキル・ファイル | Web 以外のプロジェクトでは |
|---|---|
| `/docdd:ui-polish`・`/docdd:speed-up`・`/docdd:playwright-cli` | 「該当なし」と報告して止まる（『開発サーバー起動』行が「無い」とき） |
| `/docdd:verify-e2e` | ブラウザを使わず、『E2E（実際に動かす）』行のコマンドで確かめる。結果の件数・失敗数も見る。動かせなければ、運営者に確かめてもらう手順を示す（探索的確認） |
| `/docdd:release` | 公開先をブラウザで開かず、運営者に確かめてもらう手順（入れ方・起動・操作・期待する見え方）を示す。確かめてもらうまでは「運営者確認待ち」。ホスティングを使わなければ、ビルド成功を待つ手順を飛ばす |
| `.claude/rules/docdd-kit.md`（変更影響表） | 「画面・操作（Web 以外）」行（自動テストと運営者の確認）と、「エンジンやツールが保存するファイル」行（手で書き換えず、対になる .meta などの増減を `git status` で確かめる）を使う |
| `scripts/check-doc-refs.mjs` | `.cs`・`.unity`・`.prefab`・`.asset` などへの参照も検査する。まだ無いファイルを見本として書く行には「例」の字を入れる（決まりの全体はプロジェクトの `docs/README.md` §3「参照の検査の対象」） |

## 中身

### init がプロジェクトへ置くもの

| ファイル・フォルダ | 役割 | 持ち主 |
|---|---|---|
| `CLAUDE.md` | このプロジェクトだけの内容。コマンドの表（検証コマンド・反映コマンド）と「スキルへの追加指示」。検証と反映には、この表のコマンドを使う。毎回自動で読まれる | あなた |
| `.claude/rules/docdd-kit.md` | どのプロジェクトでも同じ、キット共通の約束（5 原則・変更影響 → 必須の検証・Definition of Done・規約）。毎回自動で読まれる。直さずに、変えたいことは `CLAUDE.md` の「スキルへの追加指示」へ書く | キット（update-kit が新しい版にする。直すと update-kit が聞く） |
| `.claude/settings.json` | 許可設定（確認なしで進めるコマンド・必ず確認するコマンド・禁止する操作）。始まりのモードは決めない。まだ無いときだけ、置く前に聞く | あなた |
| `.gitignore` | `.env`・秘密鍵・DB の控え・ログイン状態・一時ファイルを git に入れない。既にあれば足りない行だけを、`# docdd:` で始まる見出しの下に足す（Web 向けの塊は Web 以外のプロジェクトには、Python 向けの塊は Python が無ければ足さない） | あなた |
| `.mcp.json` | MCP サーバーの設定。Next.js なら shadcn/ui と Next.js DevTools（版を固定）、それ以外は空 | あなた |
| `docs/README.md` | 仕様書の地図と「どこに何を書くか」 | あなた |
| `docs/PRD.md` | 何を作るか | あなた |
| `docs/requirements/README.md`・`00_template.md` | どう作るか（画面・データ・処理）の分け方と、文書の雛形 | あなた・見本 |
| `docs/decisions/README.md`・`0000-template.md` | 技術判断の記録（ADR）の置き場と雛形 | あなた・見本 |
| `docs/operations/development-and-testing.md` | テストの層・いつ回すか・テスト基盤が無いとき・落とし穴 | あなた |
| `docs/operations/backup-and-restore.md` | 控えで何を守るか・置き場所・戻す手順・戻せたことを確かめた記録 | あなた |
| `tasks/BACKLOG.md` | 作業キューと要決定。まだ動いているものだけを置く | あなた |
| `tasks/archive/BACKLOG-done.md` | 終えたタスクと決まった要決定の置き場（`scripts/backlog-archive.mjs` が移す。丸ごと読まず検索する） | あなた |
| `scripts/check-doc-refs.mjs` | 仕様書が指すファイルが実在するか。`docs/decisions/` の ADR が `decisions/README.md` の「ADR 一覧」に載っているか（見出しが無いプロジェクトでは突き合わせず、その旨を出す） | キット |
| `scripts/check-doc-dates.mjs` | 仕様書の更新日がコミットより古くないか、版と変更履歴が合うか | キット |
| `scripts/check-doc-placeholders.mjs` | 未記入の欄（`{{…}}`）が残っていないか | キット |
| `scripts/audit-check.mjs` | 依存ライブラリの既知の脆弱性（npm と `package-lock.json` 用。本番の依存の high・critical で落ちる） | キット |
| `scripts/backlog-archive.mjs` | 終えたタスク（`done`・`dropped`）と決まった要決定を BACKLOG からアーカイブへ移す（`--check` は移さずに見るだけ）。dev-loop・refactor・doc-sync・release が自動で回す | キット |
| `scripts/audit-allowlist.json` | 直さずに据え置く脆弱性の一覧（読むのは npm の `audit-check.mjs` だけ。「[依存の脆弱性の行が落ちたとき](#依存の脆弱性の行が落ちたとき)」） | あなた |
| `.docdd/manifest.json` | キットの版と、置いたファイルの記録（update-kit が使う。更新のお知らせを止める `"notifyUpdates": false` を足すほかは、手で直さない） | init が作る |
| `package.json`（`scripts`） | `package.json` があれば 4 行（`check:doc-dates`・`check:doc-refs`・`check:doc-placeholders`・`backlog:archive`）を足す。npm（`package-lock.json`、またはまだ lock が無い）なら `audit:check` も足して 5 行。無くても `node scripts/<名前>.mjs` で動く | あなた |

### プラグインが提供するスキル（15 本）

| スキル | いつ使う | 出力 |
|---|---|---|
| `/docdd:init` | 導入するとき、途中で止まった導入をやり直すとき（自分で打ったときだけ動く） | 雛形・推定した検証コマンド・未記入の欄の一覧・導入のコミット |
| `/docdd:add-task` | 要望や不具合を受け取ったとき（実装の前） | `tasks/BACKLOG.md` のタスクと要決定 |
| `/docdd:tasks-from-docs` | 仕様書（PRD・requirements・自分で置いた仕様書）をまとめて書いた・書き換えたあと、dev-loop の前（`/docdd:tasks-from-docs docs/requirements/` のように文書・フォルダで、`HEAD~1` のようにコミットの範囲でも絞れる） | まだタスクになっていない所と書き換えた所のタスク（承認後に起票） |
| `/docdd:dev-loop` | 起票したタスクを 1 件進めるとき（`/docdd:dev-loop T-01` で指定もできる） | 実装・検証・docs の更新・コミットと報告 |
| `/docdd:doc-sync` | スキルを通さず自分でコードを直したあと（ui-polish だけで直したあとも）、コミットの前（dev-loop・refactor・speed-up・security-audit は中で呼ぶ）。`--full` でコード全体と docs のずれを監査 | docs の更新と検査の結果 |
| `/docdd:verify-integration` | DB・migration（DB の変更手順）・権限・サーバー側の処理を変えたあと | テスト用 DB で通した統合検証の結果 |
| `/docdd:verify-e2e` | 利用者の操作の流れを変えたあと | 最後まで通した確認の結果（Web はブラウザで、Web 以外は『E2E（実際に動かす）』行のテストで） |
| `/docdd:ui-polish` | 画面や UI 部品を作る・直すとき（**Web 専用**） | 主な状態・画面幅・アクセシビリティ・実ブラウザの確認 |
| `/docdd:playwright-cli` | **あなたは打ちません。** Claude が ui-polish・verify-e2e・release の中で使うブラウザ操作の道具箱（`/` メニューには出ない。**Web 専用**） | 画面の操作・スクショ・コンソールの確認 |
| `/docdd:refactor` | 振る舞いを変えずに中身を整えるとき（単体テストが無いと止まる。`--audit` なら監査だけ） | 監査の結果（毎回その場で取り直す）と、承認を得た単位の `tasks/BACKLOG.md` への起票、小さな改善のコミット |
| `/docdd:speed-up` | 画面が遅いと感じたとき（**Web 専用**。サーバー描画の Web アプリ向け。単体テストが無いと止まる。`--audit` なら計測と候補出しだけ） | 計測結果と改善のコミット |
| `/docdd:security-audit` | 公開前や、認証・課金・外部連携を触ったあと | 見つけた穴の報告。直すのは 1 件ずつあなたの「はい」を得てから |
| `/docdd:maintenance` | 週 1 回（`/docdd:maintenance monthly` で月次も） | 外部 API の変化・脆弱性・溜まったデータ・控えの鮮度の点検結果。月次は費用の実績と、控えから戻せるかの復元テスト（結果は `docs/operations/backup-and-restore.md` §5 へ） |
| `/docdd:release` | 依頼を全部終えたあと（自分で打ったときだけ動く） | 反映の方式（自動公開／確認してから公開／コマンドで公開／まだ公開しない）で経路を選ぶ。本番へ出す前に必ずあなたの「はい」を得る。公開先の確認結果（Web 以外は、あなたに確かめてもらう手順）。**migration（DB の構造変更）を含むなら本番 DB を変える前に控えを取り**、公開先に不具合があれば、あなたの「はい」を得て前の版へ戻す（詳しくは「[控えと戻し方](#控えと戻し方)」） |
| `/docdd:update-kit` | プラグインを更新したあと（自分で打ったときだけ動く） | 置いた雛形を新しい版へ（手付かずは置き換え、手を入れたものは 1 件ずつ決める） |

**Web 専用**のスキルは、Web 以外のプロジェクトでは「該当なし」で止まります（上の「[Web 以外で変わる動き](#web-以外で変わる動き)」）。

### hook（取り消しにくい操作を止める柵と、更新のお知らせ）

プラグインを入れると、Claude が Bash か PowerShell でコマンドを実行する直前に、プラグインの中の hook が確かめます（あなたのプロジェクトの `scripts/` には置かれません）。
効くのは docdd のプロジェクト（`.docdd/manifest.json` がある、または `tasks/BACKLOG.md` があり `CLAUDE.md` に `/docdd:` を含む）だけで、ほかのプロジェクトの作業は止めません。

| 操作 | 扱い | 代わりにすること |
|---|---|---|
| まとめて全部を stage する `git add`（`-A`・`--all`・`.`・`:/`・`*`） | 止める | `git add <パス>` で変えたファイルだけを指定 |
| `git commit -a`（`-am` などを含む） | 止める | `git add <パス>` してから `git commit` |
| `git commit --amend`（直前のコミットの書き換え） | 止める | 新しいコミットを足す |
| `git commit --no-verify`・`-n`（コミット前の検査を飛ばす） | 止める | 検査が落ちた理由を直す |
| コミットメッセージに、角括弧つきの CI 省略の印（skip ci など）を書く | 止める | 印を書かない |
| 強制 push（`--force`・`--force-with-lease`・`-f`・`+ブランチ名`） | 止める | 新しいコミットを足して、ふつうに push |
| `.env`・`.env.*` のファイルが入るコミット（`.env.example`・`.env.sample`・`.env.template` など、末尾が `.example`・`.sample`・`.template` のものは除く。大文字小文字は区別しない） | 止める | `git rm --cached <パス>` で stage から外す（作業中のファイルは残る）。`.gitignore` に `.env` と `.env.*` があるかを確かめる |
| ログイン状態を保存したファイル（`playwright/.auth/user.json` などの `.auth/*.json`・`storage-state*.json`・`*.auth-state.json`・`.playwright-cli/`）が入るコミット | 止める | `git rm --cached <パス>` で外し、`.gitignore` に足す（雛形は `/playwright/.auth/` を除外済み） |
| `git add -f`／`--force` で `.env` の形のファイルを stage する | 止める | 値を空にした `.env.example` を作り、それを `git add` |
| 中身に秘密の値の形があるコミット: 秘密鍵、AWS のアクセスキー ID、Anthropic・OpenAI・Stripe（本番）・GitHub・Slack・Google の API キーやトークン、Slack の Webhook の URL、Supabase の秘密キー、role が service_role の JWT | 止める | キーは `.env` に移し、コードでは環境変数から読む（`process.env.OPENAI_API_KEY` など）。直したら、そのファイルをもう一度 `git add` |
| 中身に、秘密らしい名前（`api_key`・`secret`・`token`・`password` など）へ 16 文字以上の文字列を入れた行があるコミット。中身が 2MB を超えるコミット | 確認を出す | 内容を読んで決める |
| `rm` に `-r`・`-R`・`-f`・`--recursive`・`--force`。PowerShell の `Remove-Item` に `-Recurse`・`-Force` | 確認を出す | 内容を読んで決める |

- 秘密の値の検査は、Claude が `git commit` を含むコマンドを実行する直前に動きます。push のときや、あなたが自分のターミナルで打つコミットでは検査しません。止めるときも、キーそのものは表示しません。
- 見本の値（`example`・`dummy`・`your-`・`xxxx` などを含む値）と、環境変数から読む行（`process.env` など）は止めません。
- 秘密の値でない（偽の値・公開してよい値）のに止まったら、Claude は、あなたに確かめてから、その行に `docdd-allow-secret` と書きます。その行は検査しません（`.env` のファイルは、この印があっても止めます）。例: Firebase の Web 用の設定の `apiKey` は公開してよい値ですが、Google の API キーの形なので止まります。

**更新のお知らせ（SessionStart）**: docdd のプロジェクトで Claude Code を起動・再開したとき、プラグインの版が、プロジェクトに置いた雛形の版より新しければ、`/docdd:update-kit` を 1 行だけ案内します（v0.1 系なら移行の案内）。

- **何も直しません。** 更新するかはあなたが決めます（`/docdd:update-kit` は、あなたが自分で打ったときだけ動きます）。
- 案内を止めたいときは、`.docdd/manifest.json` に `"notifyUpdates": false` を足します（`/docdd:update-kit` で更新しても残ります）。

## 控えと戻し方

**docdd は DB に触るコマンドを持ちません。** 控えと戻しには、あなたが `CLAUDE.md`「反映コマンド」表に書いた次の 2 行を使います。

| 「反映コマンド」表の行 | 何のためか |
|---|---|
| 『本番 DB のバックアップ』 | **データ**を前の状態へ戻すための控えを取るコマンド（または「自動（DB サービス側）: <戻せる範囲>」「無い」） |
| 『戻し方』 | 公開した**版**を前の版へ戻す手順（ホスティングの画面／`git revert` して push／機能を止める切り替え／配り直す／「無い」） |

**版を戻す手順と、データを戻す手順は別です。** migration（DB の構造変更）を含む反映を戻すときは、`/docdd:release` がデータも戻すかを聞きます。

### いつ何が起きるか

| 場面 | 動き |
|---|---|
| migration を含む反映 | `/docdd:release` が**本番 DB を変える前に**『本番 DB のバックアップ』行のコマンドを実行します。終了コードと出力ファイルの大きさ（0 バイトでないか）まで見て、**取れたときだけ反映します** |
| その行が未記入のとき | その場でこのプロジェクトに合う候補を 1 つ示して聞き、答えを表へ書きます（次からは自動で取ります）。「DB サービスの自動バックアップに任せる」「取らない」も選べます |
| 「取らない」を選んだとき | `tasks/BACKLOG.md` の「要決定」へ記録します。聞くのは 1 回だけで、次からはその記録を見て進みます |
| 公開先で不具合が見つかったとき | 原因を調べる前に、『戻し方』行の手順で前の版へ戻すかを聞きます（**あなたの「はい」を得てから**）。行が「無い」・未記入なら戻さずに止まり、手順の候補を 1 つ示して、行へ書くかを聞きます |
| 週 1 回 | `/docdd:maintenance` が控えの鮮度を見ます。『本番 DB のバックアップ』行がコマンドで、直近 1 か月に migration を含む反映が無く `/docdd:release` が控えを取っていなければ、取る間隔を「要決定」で聞きます（「自動（DB サービス側）」なら、戻せる範囲を報告に写します） |
| 月 1 回 | `/docdd:maintenance monthly` が、**本番以外の DB へ実際に戻して**確かめ、結果を `docs/operations/backup-and-restore.md` §5 に 1 行残します |

### 覚えておくこと

- 何を守るか（§1。控えに入るもの・入らないもの）・置き場所（§2）・データを戻す手順（§3）の正本は、プロジェクトの `docs/operations/backup-and-restore.md` です。表の 2 行はコマンドだけを持ちます。
- **控えはリポジトリの外へ置きます。** 中身は利用者の個人情報なので、公開フォルダ・共有リンクにも置きません。DB の接続情報は `.env` の変数で渡し、値は表にも文書にも書きません。
- **DB を使わないプロジェクト**でも `docs/operations/backup-and-restore.md` は残し、§1 の「守るもの」を、保存データの置き場所などに書き換えます。

## 手順書を直したいとき

1. **まず `CLAUDE.md` の「スキルへの追加指示」表に 1 行足します。** 例: `| /docdd:release | PR は作らず main へ直接 push する |`。行があるスキルは、その行を本文より優先します。プラグインを更新しても、この表はそのまま残ります。
2. 手順書を全部自分で持ちたいときだけ、Claude Code に「docdd の手順書を .claude/skills/ に写して」と頼みます。写したスキルは `/add-task` のような前置きの無い名前になり、プラグインのスキル（`/docdd:add-task`）と並んで**両方呼べます**。`CLAUDE.md`・`docs/README.md`・`tasks/` の中の呼び名を、写した側に揃えてください。

写すときの注意:

- 写した手順書の中の `/docdd:` の呼び出しは、プラグインのスキルのままです（例: 写した `dev-loop` も `/docdd:doc-sync` を呼ぶ）。写した側を使わせたいなら、中の呼び名も書き換えてもらいます。
- `init` と `update-kit` は写しません（プラグインの中のスクリプトを使うため）。
- `references/` のフォルダがあるスキル（`release`・`verify-e2e` など）は、フォルダごと写します。
- 写した手順書は、プラグインを更新しても新しくなりません（`/docdd:update-kit` も見ません）。新しい版の変更は、`CHANGELOG.md` を見て手で取り込みます。

## 更新

- docdd の配布元は Anthropic 以外なので、**自動更新が既定でオフ**です。自動にするには `/plugin` → Marketplaces → claude-docdd-dev-kit → Enable auto-update。
- 手動で受け取るときは、まず `/plugin marketplace update claude-docdd-dev-kit`（配布元の一覧を取り直す）。そのあと `/plugin` の画面で docdd を更新するか、Claude Code を終了したターミナルで `claude plugin update docdd@claude-docdd-dev-kit`（反映には起動し直し）。入っている版は `/plugin list` で確かめます。
- 何が変わったかは [`CHANGELOG.md`](./CHANGELOG.md) にあります。入れている人が新しい中身を受け取れるのは、版の番号が上がったときです。
- 更新したあと docdd のプロジェクトを開くと、版のずれを hook が 1 行で知らせます（上の「hook」）。
- **プラグインを更新しても、プロジェクトに置いた雛形（`CLAUDE.md`・`scripts/` など）は変わりません。** 更新したら、プロジェクトのフォルダで `/docdd:update-kit` と打ちます。手付かずのファイルはまとめて置き換え、手を入れたファイルは差分を見て 1 件ずつ決めます。v0.1 系からの移行もこれで行います。
- あなたのファイル（`CLAUDE.md`・`docs/`・`tasks/`）へ update-kit が足すのは、**新しい版で増えた節**と、**`CLAUDE.md` の 3 つの表（ディレクトリ構成・検証コマンド・反映コマンド）に増えた行**です。`CLAUDE.md` で名前の変わったスキルを指す行が雛形のまま残っていれば、新しい名前の行への置き換えも提案します（足すのも置き換えるのも、ファイルごとにあなたの承知を得てから）。ほかの表の行や、既存の節の中の箇条・文言の変更は提案しないので、CHANGELOG の「雛形への影響」の『手で直すもの』を見て手で直します。
- 別の PC で使うときや入れ直したあとは、上の「入れ方」の 1・2 をもう一度打ちます。

## やめるとき

`/plugin uninstall docdd@claude-docdd-dev-kit` で外すと、プラグインの設定とキャッシュは消え、hook も外れます。**プロジェクトに置いたファイルは残ります。**

Project の範囲で入れた（プロジェクトの `.claude/settings.json` の `enabledPlugins` で docdd を有効にしている）場合は、外すときに「自分だけ無効にする／全員から外す」を聞かれます。全員から外すを選ぶと、Claude Code が `.claude/settings.json` から docdd を消します。自分だけ無効にするを選ぶと、`.claude/settings.local.json` に無効にする指定が書かれ、`.claude/settings.json` の行は残ります。

| 残るファイル・フォルダ | そのままだと | 消すなら |
|---|---|---|
| `CLAUDE.md`・`docs/README.md`・`tasks/` の中の `/docdd:…` の参照 | 無いスキルを案内し続ける | その行を消すか書き換える（`CLAUDE.md` の表は自分のコマンド表として残してよい） |
| `.claude/rules/docdd-kit.md` | 毎回読み込まれ、無いスキルを案内する | ファイルを消す（残すなら `/docdd:` の行を直す） |
| `.claude/settings.json`（許可設定。Project の範囲で入れて「自分だけ無効にする」を選んだときは、`enabledPlugins` の docdd の行も） | 許可設定はそのまま使える。`enabledPlugins` の行は、docdd を有効にする指定として残る | 要らなければ消す（許可設定は残してよい） |
| `.mcp.json` | MCP サーバーの設定が残る | 使っていなければ消す |
| `scripts/` の 5 本（と `audit-allowlist.json`）と `package.json` に足した行（npm は 5 行、それ以外は 4 行） | そのまま動く | 消すなら `CLAUDE.md` の「docs の検査」「未記入欄の検査」「依存の脆弱性」行と、`docs/README.md` の検査の説明も直す。`backlog-archive.mjs` を消すなら、`tasks/BACKLOG.md` の運用ルールと `.claude/rules/docdd-kit.md` の該当する行も直す |
| `.docdd/manifest.json`・`.gitignore` の `# docdd:` で始まる見出しの塊 | そのままでよい | 消してよい（`.gitignore` は残すのがおすすめ） |
| `docs/`・`tasks/` | あなたの仕様書と作業キュー | 残してよい |

消すときは Claude Code に「docdd の参照（`/docdd:`）と、上の表のファイルを消して」と頼み、差分を確かめてからコミットします。

## 注意

- `.env` と `.env.*` は `.claude/settings.json` で**読み取り禁止**にしています（`.env.example` も含みます）。変数名を Claude に見せたいときは、その部分をチャットに貼るか、deny の `Read(./.env.*)` を `Read(./.env.local)` などの個別の名前に書き換えてもらいます。
- Claude Code のサンドボックス（`/sandbox`）が `.claude/settings.json` と `.mcp.json` への書き込みを止めたときも、init は残りの雛形を置きます。この 2 つは Claude が確認つきで書き直し、置けなければ中身を報告に載せます。
- hook と許可設定は、うっかりした操作を止めるための柵です。秘密の値の検査が見るのは、上の「hook」の表にある形のキーと名前です。キーは `.env` に置き、コードでは環境変数から読みます。
- `claude -p` のような確認を出せない実行では、`rm -r`・`rm -f` は実行されずに終わります。`/loop` は開いている会話の中で動くので確認が出て、答えるまでそこで止まります。
- コミットの名前やメールを間違えたときは、push する前なら `git commit --amend --reset-author` で直せます。hook は Claude の `--amend` を止めるので、Claude Code の外のターミナルで自分で打ちます。
- このキットは 2026 年 9 月時点の Claude Code（2.1 系）の仕組みを前提にしています。公式ドキュメント: https://code.claude.com/docs/en/plugins ／ https://code.claude.com/docs/en/skills ／ https://code.claude.com/docs/en/memory

### 依存の脆弱性の行が落ちたとき

『依存の脆弱性』行は、init がパッケージマネージャに合わせて書きます（推定できなければ自分で書きます。Python の例: `pip-audit`）。落ちたら `/docdd:maintenance` を打ちます。依存を上げられるかを先に試し、上げられない high だけを、理由と期限をつけて据え置きます（critical は据え置きません）。npm は `scripts/audit-allowlist.json` に、npm 以外は `tasks/BACKLOG.md` の「要決定」に書き、`/docdd:maintenance` が毎週突き合わせます。書き方は、プロジェクトの `docs/README.md` §3 にあります。

## 困ったら

- 不具合・質問（分かりにくい所）・要望は [Issues](https://github.com/no1013kota/claude-docdd-dev-kit/issues/new/choose) へ。3 つの中から選べます（無料の GitHub アカウントが要ります）。日本語でも英語でも書けます。
- API キーや `.env` の中身は貼らないでください。

## 保守する人へ

**フォルダの役割**（どこに何を置くか）

| フォルダ | 役割 |
|---|---|
| `skills/` | 手順書（スキル）15 本 |
| `templates/` | init が利用者のプロジェクトへ**置く**雛形（`package.scripts.json` だけは `package.json` へ足す）。置いたものは各プロジェクトの正本になるので、見本や試しのファイルは置かない |
| `examples/` | **置かない**、読むだけの記入例（いまは PRD の 1 本だけ。init の問 3 と「最初の 3 手」から読む） |
| `scripts/`（プラグインの中） | init・update-kit の処理と hook。利用者のプロジェクトには置かない |
| `hooks/` | hook の設定（PreToolUse・SessionStart） |
| `evals/` | `claude plugin eval` の評価ケース |
| `scripts/`・`tests/`（リポジトリ直下） | 配布しない、このリポジトリの検査とテスト |

- リリースの手順（版の上げ方・`npm run check`・`npm test`・`npm run check:urls`）は [`RELEASING.md`](../../RELEASING.md)。
- スキルの `allowed-tools` に runner 単体（`Bash(npx:*)`・`Bash(npm:*)`・`Bash(pnpm:*)`・`Bash(bash -c *)` など）を書かないでください。そのスキルを呼んだターンの間、中で動く何でもが確認なしで通ります。`Bash(npx playwright-cli *)` のように、runner と内側のコマンドの組で書きます（`npm run check` が見ます）。
- hook の動作は `tests/guard-bash.test.mjs` で確かめます。
