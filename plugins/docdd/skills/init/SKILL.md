---
name: init
description: 開発キットの雛形（CLAUDE.md・.claude/rules/docdd-kit.md・docs/・tasks/・scripts/ など）をいまのプロジェクトへ置き、検証コマンドは推定で埋め、分からない欄だけをまとめて聞いて、検査を通してからコミットする。導入するとき、または途中で止まった導入をやり直すときに使う。既存ファイルは上書きしない（何度実行しても安全）。
argument-hint: "[プロジェクト名] [何を作るか] [commit]"
disable-model-invocation: true
allowed-tools: Bash(node -v) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs *) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" *) Bash(git init) Bash(git add *) Bash(git commit *) Bash(git mv *) Bash(mkdir -p docs/_imported) Bash(git config user.name *) Bash(git config user.email *) Bash(node scripts/check-doc-refs.mjs) Bash(node scripts/check-doc-dates.mjs) Bash(node scripts/check-doc-placeholders.mjs)
---

# init：開発キットの雛形をプロジェクトへ置く

このプラグインの雛形（`${CLAUDE_PLUGIN_ROOT}/templates/`）を、いまのプロジェクトへ置く。
コピー・`package.json` への追記・`.gitignore` への追記・日付の記入・状態の判定は、すべて `init.mjs` が決まった形で行う。**Claude は手でコピーしない**（取りこぼしと書式崩れを防ぐ）。

- **既存ファイルは上書きしない。** 例外は、運営者が承知した `CLAUDE.md` の置き換え（元は `CLAUDE.md.bak` に残る）だけ。
- **何度実行しても安全。** 途中で止まっても、もう一度 `/docdd:init` を打てば、足りないファイルと未記入の欄だけを扱う。
- **実装は始めない**（実装は `/docdd:dev-loop` の仕事）。

コマンドはすべて次の形で実行する（パスに空白があっても動くよう、引用符で囲む）:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" <サブコマンド> --json
```

結果は JSON で返る。報告にはその中身を使い、推測で補わない。

## 引数モード（質問しない）

次のどちらかなら**引数モード**で進める。途中で質問しない。

- `/docdd:init` の後ろに引数がある（例: `/docdd:init よみログ 読書記録アプリ commit`）。1 つめがプロジェクト名、2 つめが何を作るか 1 行、末尾が `commit` ならコミットまで進む。空白を含む値は引用符で囲む（例: `/docdd:init よみログ "本の感想を記録するアプリ" commit`）。
- AskUserQuestion が使えない（非対話の実行）。

引数モードの既定:

| 項目 | 既定 |
|---|---|
| ヒアリング | しない。答えの無い欄は `{{…}}` のまま残し、報告に「未記入」と載せる |
| `.claude/settings.json` | 置く（`--settings yes`） |
| 既存の `CLAUDE.md` | 表だけ末尾に足す（`--claude-md append`） |
| 既存の `tasks/BACKLOG.md` に書式の節が無い | 足さない。報告に載せる |
| 置き場所 | いまのフォルダ（cwd） |
| 土台（アプリのコード）が無い | 雛形を置き、「アプリの土台を作る」を起票する（下の B） |
| git 未管理・名前とメールが未設定 | **止まる**（勝手に `git init` や名前の設定をしない）。何をすればよいかを報告する |
| コミット | 引数の末尾が `commit` のときだけ |

## 手順

### 0. 前提を確かめる

1. `node -v` を実行する。
   - 動かない、または 18 未満なら止まり、「Node.js 18 以上が必要です。https://nodejs.org/ja から LTS 版（推奨版）を入れて、Claude Code を起動し直してください」と伝える。
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" status --json` を実行する。以下は、この結果を見て判断する。
3. `state` で分ける。
   - `installed` → 何も置かずに止まる。「導入済みです。仕様は `docs/PRD.md`。次は `/docdd:add-task <やりたいこと>`（PRD に機能を複数書いたなら `/docdd:tasks-from-prd`）」と伝える。
   - `legacy` → 何も置かずに止まる。「v0.1 系の構成で導入済みです。`/docdd:update-kit` で新しい版へ移してください」と伝える。
   - `partial` → 途中まで導入済み。手順 1 では、`placeholders` に残っている欄と、答えが無いと決まらない項目だけを聞く。対応する問いが無い欄だけが残っているなら、手順 1 は聞かずに飛ばす（まだコミットしていなければ手順 2・3 へ進み、残った欄は手順 4 で一覧にする）。
   - `not-installed` → そのまま進む。
4. `git.available` が false なら止まる。「git が必要です。macOS はターミナルで `xcode-select --install`、Windows は https://gitforwindows.org から Git for Windows を入れて、Claude Code を起動し直してください」と伝える。
5. `scaffold.present` が false（`package.json` などもソースコードも無い）なら、AskUserQuestion で聞く（git の準備より先に聞く。A を選んだ人には git の準備も要らない）。
   - **A. 先に土台を作る（おすすめ）**: 止まって、「このフォルダで Claude Code に『Next.js（など）の土台を作って、動くところまで』と頼んでください。できたら `/docdd:init` をもう一度打ってください（雛形はまだ置いていないので、このフォルダで作れます）」と伝える。
   - **B. 土台なしで雛形を置く**: 進む。手順 2 で「アプリの土台を作る」タスクを起票する。雛形を置いたあとは、土台を作る道具（例: create-next-app）が空でないフォルダで止まることがあるので、土台は別のフォルダで作ってから中身を移す（タスクの完了条件に書いてある）。
6. `git.isRepo` が false なら、「このフォルダを git で管理します（変更の記録を取れるようにする）。`git init` を実行してよいですか」と承知を得てから `git init` を実行する。承知が無ければ止まる。検査スクリプトは git が追跡しているファイルとコミットの日付を読むので、git 無しでは導入できない。
7. `git.userName` か `git.userEmail` が null なら、コミットに残す名前とメールを運営者に聞く。答えを `git config user.name "<名前>"` と `git config user.email "<メール>"` で**このリポジトリだけ**に設定する（`--global` は使わない。メールは push すると公開される）。設定済みなら「この名前とメールで記録します: <名前> <メール>」と 1 行見せる。
8. `atGitRoot` が false（git の一番上ではない場所。例: モノレポの `apps/web`）なら、AskUserQuestion で「ここに置く／一番上に置く／中止」を聞く。Claude Code は起動した場所とその上のフォルダの `CLAUDE.md` を読むので、**普段 Claude Code を起動する場所**に置くのがよい、と理由を添える。「一番上」なら、そこで Claude Code を起動し直して `/docdd:init` を打つよう伝えて止まる。
9. `existingCode` が true なら「既存コードあり」と控える（手順 4 の次の一手に使う）。

### 1. ヒアリング（選ぶ問いと書く問いを、まとめて聞く）

**検証コマンド（型検査・lint・テストなど）は聞かない。** `status` の `inferred` の推定で埋める（手順 2）。推定できなかった行だけを「問 11」で聞く。
引数モードでは聞かない。`partial` のときは、`placeholders` に残っている欄と、答えが無いと決まらない項目に対応する問いだけにする。

聞き方（小出しにしない）:

- **選んで答える問い**（問 5・6・8・9・10・12 のうち当てはまるもの）を、先に AskUserQuestion で聞く。AskUserQuestion は 1 回に 4 問・1 問に 4 択までで、自由入力（Other）は自動で付く。当てはまる問いが 5 つ以上なら 2 回に分ける（問 9・12 をあとの回にする）。選択肢が 3 つ以下の問いにだけ「分からない（あとで決める）」を足す。
- **書いて答える問い**（問 1・2・3・4・7・11 と、選んだ答えで要るようになった補足）は AskUserQuestion を使わない。番号付きの回答欄を 1 つのメッセージで示し、まとめて答えてもらう。分からない欄は空のままでよい、と添える。

#### 選んで答える問い

- **問 5 反映の方式**（公開のしかた）: 次の 4 択。`CLAUDE.md` に書く値は「」の中のまま。選択肢には説明を添える。
  - 「A: 本番ブランチへ push するとホスティングが自動で公開」— GitHub に送ると Vercel などが自動で公開する
  - 「B: staging を確認してから本番ブランチへ PR」— 確認用の環境（staging）で見てから、本番へ取り込む依頼（PR）を出す
  - 「C: 反映コマンドを実行」— 公開用のコマンドを打つ
  - 「まだ公開しない」
- **問 6 テスト用 DB**: 「① 手元で起動する DB（例: supabase start）」「② ホスト型の開発専用 DB（本番と別・開発専用・破棄可能。接続先は .env のキー名）」「③ DB を使わない」「分からない（あとで決める）」。
- **問 8 `.claude/settings.json` を置いてよいか**: 「置くと、以降ファイルの編集と `git add`／`git commit` は確認なしで進みます。`rm -r`（まとめて削除）や `git push` などは必ず確認が出ます」。選択肢は「置く（おすすめ）」「置かない」「分からない（あとで決める）」。「分からない」は置かない（`--settings no`）として扱う。
  `settings.exists` が true なら、置く問いはしない（既存は上書きしない）。代わりに `settings.missingMarketplace` か `settings.missingEnabledPlugin` が true のときだけ、「プラグインの取得元（`extraKnownMarketplaces`）と有効化（`enabledPlugins`）の 2 つだけを足しますか。足すと、別の PC や入れ直したあとにこのフォルダを開いたとき、Claude Code がプラグインの入れ方を案内します」と聞く。
- **問 9 既存の `CLAUDE.md`**（`claudeMd.exists` が true で、`claudeMd.hasMarkers` が false のときだけ）: 次の 3 択。おすすめは「表だけ末尾に足す」。`claudeMd.builtinInit` が true なら「Claude Code 組み込みの `/init` が作ったものに見えます」と添える。
  - いまのまま、キットの表（検証コマンド・反映コマンド・スキルへの追加指示）だけ末尾に足す（おすすめ）→ `--claude-md append`
  - 置き換える（元は `CLAUDE.md.bak` に残す）→ `--claude-md replace`
  - いまのまま、表も足さない → `--claude-md keep`。表が無いと `/docdd:dev-loop` などのスキルは「先に `/docdd:init`」で止まり、init も導入済みになりません（おすすめしない）
  - 「分からない（あとで決める）」は、表だけ末尾に足す（`--claude-md append`。引数モードと同じ）として扱う
- **問 10 終わったらコミットしてよいか**: 「はい」「いいえ（stage までで止める）」「分からない（あとで決める）」。「分からない」は「いいえ」として扱う。
- **問 12 既存の `tasks/BACKLOG.md` の書式**（`backlog.missingSections` が空でないときだけ）: 「`tasks/BACKLOG.md` にキットの書式の節（`missingSections` の見出し）がありません。書式の見本つきの節を足しますか（書いてある内容は変えません）」。「足す（おすすめ）」「足さない」「分からない（あとで決める）」。「足す」なら手順 2 で `--add-backlog-sections` を付ける。それ以外は足さず、報告に載せる。

#### 書いて答える問い

- **問 1 プロジェクト名と、何を作るか 1 行**（引数で渡されていれば聞かない）
- **問 2 既にある仕様書やメモ**: `specCandidates` の候補を示し、「この中に仕様書やメモはありますか（README・docs の文書・Notion の書き出しなど）。あればパスを書くか、中身を貼ってください。原文を `docs/_imported/` へ移すか、そのままにするかも書いてください」。
- **問 3 PRD（何を作るかの仕様書 `docs/PRD.md`）のやること・やらないこと**: 作りたい機能を 3〜7 個（それぞれ Must＝最初の版に必須／Should＝あると良い）と、最初の版ではやらないこと。記入例は `${CLAUDE_PLUGIN_ROOT}/examples/PRD.sample.md`（架空の美容室の予約アプリ）。必要なら読んで、書き方の見本として示す。仕様書があれば、そこから下書きした案を示して「これでよいか」を聞く（下書きを見せるので、この問いだけもう 1 往復してよい）。
- **問 4 公開先 URL**（まだ公開していなければ「まだ無い」）
- **問 5 の補足 ブランチ**（問 5 で「まだ公開しない」以外を選んだとき）: 本番ブランチ。`git.branch` を候補に示す（多くは main）。**B を選んだときだけ**、作業ブランチ（本番ブランチと別の名前。staging へ反映するブランチ）も聞く。
- **問 6 の補足 テスト用 DB の中身**（問 6 で ① か ② を選んだとき）: ① なら DB の起動コマンド（例: `supabase start`）、② なら接続先を入れた `.env` のキー名（例: `DATABASE_URL`。値は書かない）。
- **問 7 有料の外部 API**（AI など、使った分だけ費用が出るもの）を使うなら、実物で 1 周確かめるときの費用上限（例: 1 周 $0.50 まで）。使わないなら「無い」。
- **問 11 検証コマンド表の、自動で推定できなかった行**（`inferred` の `value` が null の行のうち、『テスト用 DB』『実物1周の費用上限』を除いたものがあるときだけ）: 行名を並べ、「このプロジェクトでそれぞれを実行するコマンドを書いてください。無いものは『無い』、分からなければ空のままで構いません」。

### 2. 雛形を置き、答えを書き込む

1. apply を実行する。オプションは次のとおり組み立てる。

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" apply --json --fill-inferred --settings <yes|no> --claude-md <new|replace|append|keep> [--tasks <scaffold,test-infra>] [--add-backlog-sections]
   ```

   - `--tasks`: 手順 0-5 で B を選んだら `scaffold`。`inferred` の『単体・DBテスト』行の `value` が「無い」か null なら `test-infra`。両方なら `scaffold,test-infra`（「テスト基盤の導入」は「アプリの土台を作る」に依存する）。タイトルが「テスト基盤の導入」で始まり状態が `done`・`dropped` 以外のタスクが既にあれば、新しく起票せず、その ID を `tasks` に `exists` で返す。
   - `--add-backlog-sections`: 問 12 で「足す」と答えたときだけ付ける。
   - `.mcp.json` は既定（`--mcp auto`）でよい。依存に `next` があれば Next.js 向け、無ければ空で置く。
   - `ok` が false なら、`error` の文面をそのまま報告して止まる（置き場所がふさがっているとき、例えば `tasks` という名前のファイルがあるときは、何も書いていない）。
   - `notWritten` が空でなければ、Claude Code のサンドボックスなどが設定ファイル（`.claude/settings.json`・`.mcp.json`）への書き込みを止めている。残りの雛形は置けている。`notWritten` の各 `path` へ、その `content` を Write で書く（英語の確認が出たら Yes）。書けたファイルは、手順 3 で `toStage` と一緒に `git add` する。Write も拒否されたら置かずに進め、手順 4 で報告する。この 2 つが無くても導入は続けられる（許可設定と MCP が効かないだけ）。
2. 結果の `filled` が、推定で埋めた検証コマンドの行。`placeholders` が、まだ埋まっていない欄（ファイル・行・トークン）。
3. ヒアリングの答えを、Edit で該当の `{{…}}` へ書き込む。
   - `CLAUDE.md`: `{{プロジェクト名}}` `{{何を作っているか1行}}`、`{{フレームワーク名}}`（`stack.framework` を使う。null なら聞いた答え）、「検証コマンド」表の『テスト用 DB』『実物1周の費用上限』と問 11 で答えた行、「反映コマンド」表の 6 行。
   - 『テスト用 DB』は、選んだ番号の形で書く。①「① ローカル: `<起動コマンド>`」／②「② ホスト型の開発専用: 接続先は .env の `<キー名>`（本番と別・開発専用・破棄可能）」／③「③ DB 無し」。起動コマンドやキー名が分からなければ `{{テスト用 DB}}` のまま残す。
   - 「反映コマンド」表: 『反映の方式』は問 5 の「」の中のまま書く。『本番ブランチ』は答えた名前。『作業ブランチ』は、方式 B なら問 5 の補足で答えた名前（答えが無い、または本番ブランチと同じなら `{{作業ブランチ}}` のまま残し、報告の未記入欄に載せる。同じ名前だと `/docdd:release` が PR を作れず止まるため）。方式 A・C と「まだ公開しない」なら `git.branch`。方式 A なら『staging へ反映』『本番へ反映』は「無い」。
   - コマンドはバッククォートで囲む。このプロジェクトに無いものは「無い」と書く。
   - `docs/PRD.md`: §1〜§3.3。`{{プロダクト名}}` はプロジェクト名。
   - 問 7 が「無い」（有料の外部 API を使わない）なら、`docs/PRD.md` の `## 4. 料金・上限（従量課金があるとき）` の見出しから次の `## ` 見出しの手前までを削除し（節の本文が削除を許している）、『実物1周の費用上限』行に「無い」と書く。
   - **答えられなかった欄は `{{…}}` のまま残す。** 勝手に作らない。日付の `{{YYYY-MM-DD}}` はここでは触らない（手順 3 の dates が埋める）。
4. 既存の仕様書があった場合:
   - PRD の §1〜§3 を、そこから下書きする（手順 1 で承知を得た内容）。
   - 原文を移すと答えたなら、`mkdir -p docs/_imported` のあと `git mv <元のパス> docs/_imported/` で移し、原文の冒頭に「正本は docs/PRD.md（<今日の日付> 移行）」の 1 行を足す。git が追跡していないファイルなら、先に `git add <元のパス>` してから `git mv` する。
   - 画面・データの細かい記述は、その場で `docs/requirements/` へ分けない。`tasks/BACKLOG.md` の「## タスク」節の末尾に、「取り込んだ仕様を requirements へ分ける」タスクを 1 件起票する（書式は同ファイルの「運用ルール」。番号はいちばん大きい T-番号の次。参照は `docs/_imported/<ファイル名>`、サイズは M）。
5. `settings.action` が `skipped`（既にあった）なら、init.mjs は中身に触れていない。問 8 で「2 つだけ足す」と答えていたら、Edit で `extraKnownMarketplaces` と `enabledPlugins` の 2 キーだけを足す（ほかの行は変えない。引数モードでは足さない）。Edit の前に、運営者へ「このあと `.claude/settings.json` を直すときに英語の確認が出たら、Yes を選んでください（"Yes, and allow Claude to edit files in this project's .claude folder for this session" でもよい。版によって文言が少し違うので、`.claude folder` を含む Yes を選ぶ）」と伝えておく。`settings.diff` の `missingDeny`・`missingAsk` は、手順 4 で差分として報告する。

### 3. 検査を通し、承知を得てコミットする

順番が大事。検査スクリプトは **git が追跡しているファイルだけ**を見る。`check-doc-dates` は**コミットの日付**も読む。
この段階では `.claude/settings.json` の許可はまだ効かないので、`git add` などで確認が出ることがある。
検査スクリプト（`check-doc-refs`／`check-doc-dates`／`check-doc-placeholders`）と `init.mjs` は、他のコマンドと `;` や `&&` でつながず、1 回に 1 つずつ実行する。exit 1 はそのまま結果として読み、`echo $?` などを足さない（足すと許可の確認が出る）。

1. apply の `ignored`（`.gitignore` に除外されていて git add できないファイル）が空でなければ、ここで止まって聞く。「`.gitignore` が `<ignored のパス>` を除外しているので、コミットに入りません。`.gitignore` に例外の行を足しますか」。フォルダごと除外する行（例: `.claude/`）があると中のファイルは例外の行でも戻せないので、足すなら `.claude/` を `.claude/*` に変え、その下に `!.claude/rules/` と `!.claude/settings.json` を足す、のように Edit で直す。直したら apply をもう一度実行し、`ignored` が空になったのを確かめてから進む（直した `.gitignore` と、1 回目で変えた `package.json` は 2 回目の `toStage` にも入る）。足さないと答えたら、そのまま進み、報告に載せる。
2. apply の `toStage` を**パスを明示して** `git add` する（`git add -A` や `git add .` は使わない）。`CLAUDE.md.bak` は `toStage` に入っていないので stage しない。
3. `node scripts/check-doc-refs.mjs` を実行する。落ちたら**文面をそのまま**報告し、次の順に確かめる。
   1. stage していないファイルを指していないか（`toStage` を add し忘れていないか）
   2. `.gitignore` が置いたファイルを除外していないか（apply の `ignored`）
   3. 指している先が本当に無いか（あれば文面どおりに直す）
   4. `--claude-md append`・`keep` のとき、既存の `CLAUDE.md`（キットが足した表より上）の記述が原因なら、勝手に直さない。運営者の承知を得て直すか、報告に `ファイル:行 → 参照先` を載せてコミットへ進んでよい
4. **コミットの承知がある**（問 10 で「はい」、または引数の末尾が `commit`）なら続ける。無ければここで止め、「stage までで止めました。日付（`{{YYYY-MM-DD}}`）は未記入のままです。もう一度 `/docdd:init` を打つとコミットまで進めます」と伝える。
5. `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" dates --json` で、未記入の日付（`{{YYYY-MM-DD}}`）と、今回中身を変えた文書の冒頭の『更新日』を今日にする。結果の `toStage` をもう一度 `git add` する。
6. `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" precommit --json` を実行する。`ok` が false なら**コミットせずに止まり**、`problems` の文面を報告する（`.env` が除外されていない、`.env` やログイン状態のファイルが stage されている、名前とメールが無い、など）。`warnings` は報告に載せるだけでよい。
7. `git commit -m "chore: docdd キット v<kitVersion> を導入"` でコミットする（`<kitVersion>` は status の `kitVersion`）。
8. `node scripts/check-doc-dates.mjs` を実行する。落ちたら文面をそのまま報告する。
9. `node scripts/check-doc-placeholders.mjs` を実行する。未記入の欄が残っていれば exit 1 になるが、**これは失敗ではない**。一覧を報告に載せるだけにする。

### 4. 報告する

次を短い日本語で載せる。

- 置いたファイル（`created`）／変えたファイル（`modified`）／飛ばしたファイル（`skipped` と理由）
- apply の `warnings` と `ignored`（コミットに入らなかったファイル）。`packageJson.skipped` があれば、その理由（例: pnpm のプロジェクトには `audit:check` を足さない。依存の脆弱性は `CLAUDE.md`「検証コマンド」表の『依存の脆弱性』行のコマンドを使う）
- 置けなかった設定ファイル（`notWritten` のうち、Write でも置けなかったもの）。「Claude Code のサンドボックスなどが書き込みを止めました。必要なら、サンドボックスを使わない状態で `/docdd:init` をもう一度打つか、次の中身を手で置いてください」と添え、`content` を載せる
- 既存の `.claude/settings.json`・`.mcp.json` があった場合の差分（`settings.diff`・`mcp.missingServers`）。足したいときは「Claude に『.claude/settings.json の deny に … を足して』と頼む」と添える
- 推定で埋めた行（`filled`。「推定です。違っていたら `CLAUDE.md` の該当行を直してください」と添える）
- 未記入の欄（`ファイル:行  {{トークン}}` の形。「答えられる欄は `/docdd:init` をもう一度打つと聞き直します。自動で推定できない行は `CLAUDE.md` を直接直してください」と添える）
- 起票した定型タスク（`tasks`。`exists` は既にあったタスク）
- `tasks/BACKLOG.md` に書式の節が無いまま足さなかった場合は、無い節（`backlog.missingSections`）と「`/docdd:init` をもう一度打つと足せます」
- `--claude-md keep` にした場合は、「表が無いので `/docdd:dev-loop` などのスキルは止まります。`/docdd:init` をもう一度打つと、同じ 3 択で『表だけ末尾に足す』を選び直せます」
- コミットした場合は、記録に使った名前とメール（`<名前> <メール>`。メールは push すると公開される）
- `CLAUDE.md.bak` を作った場合は「不要なら消してよい（コミットしていない）」
- 次の一手（上から最初に当てはまるもの）:
  - 既存コードあり（手順 0-9）→ `/docdd:doc-sync --full`（いまのコードから docs を起こす）
  - PRD に機能を複数書いた → `/docdd:tasks-from-prd`（PRD の機能一覧からタスクをまとめて起票する）
  - 基盤のタスク（アプリの土台・テスト基盤）を起票した → `/docdd:dev-loop T-01`（T-01 は起票した基盤タスクの番号）
  - それ以外 → `/docdd:add-task <最初に作りたいこと>`
- 次に Claude Code を起動したときに出る英語の確認:
  - フォルダを信頼するか → Yes。これで `.claude/settings.json` の許可が有効になる
  - Next.js で `.mcp.json` を置いた場合、MCP サーバーへの接続を承認するか → Yes（Next.js でなければ No でよい）
- 新しい約束が読み込まれているかは、Claude Code を起動し直して `/context` と打ち、Memory files に `.claude/rules/docdd-kit.md` が出ることで確かめられる
- プラグインの更新: `/plugin` → Marketplaces → claude-docdd-dev-kit → Enable auto-update で自動更新にできる（このマーケットプレイスは既定では自動更新しない）。新しい版を受け取ったら `/docdd:update-kit` で、置いた雛形も新しい版へ追随させる。

## やらないこと

- 既存ファイルの上書き・削除・改名（承知を得た `CLAUDE.md` の置き換え、承知を得た仕様書の `docs/_imported/` への移動、承知を得た `.gitignore` への例外の行の追加だけが例外）
- 雛形を置いた勢いで実装を始めること
- 手順書（スキル）の本文をプロジェクトへ写すこと。プロジェクトだけ手順を変えたいときは、`CLAUDE.md` の「スキルへの追加指示」表に行を足す（その行が本文より優先される）。手順書を全部自分で持ちたい場合だけ、`.claude/skills/` へ写す。写してもプラグインのスキルは `/docdd:名前` のまま並んで両方呼べるので、`CLAUDE.md` の呼び名を写した側に揃える。
