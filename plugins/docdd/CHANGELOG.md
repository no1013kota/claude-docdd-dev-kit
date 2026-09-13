# 変更履歴（docdd）

版ごとの変更と、プロジェクトに置いた雛形への影響をまとめます。
「雛形への影響: あり」の版へ上げたら、プロジェクトのフォルダで `/docdd:update-kit` を打ちます（プラグインを更新しただけでは、置いた雛形は変わりません）。

## 0.3.0（2026-09-14）

Web 以外のプロジェクト（Unity などのゲーム・ネイティブアプリ）で害が出ないように直した。細部は `CLAUDE.md`「スキルへの追加指示」と README「Web 以外のプロジェクトで使う（例: Unity）」で合わせる。

### 追加

- **init**: `status` の `stack` に `kind`（`web`・`unity`・`godot`・`flutter`・`android`・`apple`・`dotnet`・`unknown`）・`web`（`true`／`false`／`null`）・`unity`（`editorVersion`）を足した。目印は Unity が `ProjectSettings/ProjectVersion.txt`、Godot が `project.godot`、Flutter が `pubspec.yaml` の `flutter:`、Android が gradle ファイルの `com.android`、Apple が一番上の `*.xcodeproj`・`Package.swift`、.NET が一番上の `*.sln`・`*.csproj`。Web のフレームワークが無く、これらの目印があれば `web` は `false`。
- **雛形 `.claude/rules/docdd-kit.md`**: 変更影響表に「画面・操作（Web 以外）」行（『E2E（実際に動かす）』行の自動テスト。自動テストで確かめられない見た目・操作は、運営者に確かめてもらう手順を示して「運営者確認待ち」）と、「エンジンやツールが保存するファイル」行（手で書き換えず、対になるファイルの増減を `git status` で確かめる）を足した。
- **雛形 `CLAUDE.md`**: 検証コマンドの例に「Unity の例」を足した。
- **verify-e2e**: `references/pitfalls.md` に 3 行（テストが 0 件でも成功の終了コード、Editor が同じプロジェクトを開いている、`-runTests` と `-quit` を一緒に使う）。
- README に「Web 以外のプロジェクトで使う（例: Unity）」（init の判定・Unity の検証コマンドの例と注意・おすすめの追加指示・許可設定の直し方・Web 以外で変わる動き）。
- evals に 3 ケース: `init-unity-project`・`tasks-from-prd-waits-for-approval`・`release-not-published`。
- テスト: Unity・Godot・Flutter・Android・Apple・.NET の判定、Web 以外の `.gitignore`、旧い行名「E2E（実ブラウザ）」の読み取り、`check-doc-refs` の Web 以外の拡張子。

### 変更

- **行名**: `CLAUDE.md`「検証コマンド」表の「E2E（実ブラウザ）」を「E2E（実際に動かす）」にした（トークン `{{E2E}}` は同じ）。`init.mjs` は旧名の行も読んで埋める（行名は書き換えない）。変更影響表の「画面」行を「画面（Web）」にした。
- **init**: Web 以外（`stack.web` が `false`）では、『開発サーバー起動』『本番モード起動』を「無い」と推定する（Unity と Godot では『依存の脆弱性』も）。『単体・DBテスト』『E2E（実際に動かす）』『ビルド』は推定しない。`.gitignore` は「# docdd: 共通」の塊だけを使う。`status.next` と報告で README の節を案内する。ファイルの走査で `Library`・`Temp`・`Logs`・`UserSettings`・`obj`・`Build`・`Builds`・`.godot`・`Pods`・`DerivedData`・`.gradle` の中を見ない。仕様書の候補から `ProjectSettings/`・`Packages/`・`Assets/`・`addons/`・`Pods/`・`android/`・`ios/` の下を外し、`.txt` はファイル名に仕様らしい語があるときだけにした。既存コードの判定で `Assets/TutorialInfo/`・`Packages/` の下を数えず、Godot の `.gd`・Flutter の `.dart`・C/C++・Lua も数える（Godot の `addons/` と、Flutter の `android/`・`ios/`・`linux/`・`macos/`・`windows/`・`web/` の下は数えない）。Web のプロジェクトで `dev` が無いときは `serve`・`start` を開発サーバーとみなし、どちらも無ければ『開発サーバー起動』を未記入のまま聞く（「無い」にすると Web 専用のスキルの門で止まるため）。`docs/_imported/` へ移すのは Markdown の仕様書・メモだけにした。参照の検査がキットの置いていない既存の文書で落ちたら、勝手に直さず、報告して進めてよい。
- **update-kit**: 参照の検査がキットの置いていない既存の文書で落ちたら、勝手に直さない。
- **雛形 `.gitignore`**: 「# docdd: 共通」と「# docdd: Web（Node.js・ビルド出力・Playwright）」の 2 つの塊に分けた。
- **雛形 `.claude/rules/docdd-kit.md`**: DoD の UI 行を Web と Web 以外に分けた。規約の言語は、既存の文書・コミットが別の言語ならそれに合わせる。コミットの承知・決まったブランチ運用は「スキルへの追加指示」に書く、の 1 行を足した。規約の一時ファイルの行は、`.playwright-cli/` が .gitignore 済みなのを Web のプロジェクトだけにした（Web 以外では Web の塊を足さないため）。
- **雛形 docs・tasks**: PRD の §3.3 を「主な画面（ゲームならシーン）と利用者の流れ」にし、§2 の例に「プレイヤー」を足した。`development-and-testing.md` §4 に Unity Test Framework（EditMode／PlayMode）と Unity の注意 2 点。`requirements/README.md` に、見出し ID の接頭辞は文書ごとに足してよい（例: RULE-01）。`docs/README.md` は、参照の検査の拡張子を `scripts/check-doc-refs.mjs` に任せる書き方にした。BACKLOG の基盤タスクの見本の行名を揃えた。
- **検査スクリプト**: `check-doc-refs` の対象の拡張子に 33 個を足した（Web の `html`・`vue` など、Unity の `cs`・`unity`・`prefab`・`asset` など、Godot の `gd`・`tscn` など、ネイティブアプリの `swift`・`kt`・`dart` など、C/C++ など）。既存の文書に、まだ無いファイルを「例」の字なしで書いた行があると、新たに「無いファイル」と出る。4 本の刻印を v0.3.0 にした。
- **ui-polish・speed-up・playwright-cli**: 手順の最初に「Web の門」を置いた。『開発サーバー起動』行が「無い」なら「該当なし」と報告して止まる。
- **verify-e2e**: Web 以外は『E2E（実際に動かす）』行のコマンドで確かめる。合否は終了コードだけでなく、結果の件数・失敗数でも見る（0 件は合格にしない）。Editor のロックなどで動かせなければ、Claude はエディタを閉じず、運営者に確かめてもらう（探索的確認）。
- **release**: 「実ブラウザで確認する」を「公開先で確認する」にした。Web 以外はブラウザで開かず、運営者に確かめてもらう手順を示す（まだなら「運営者確認待ち」）。ホスティングを使わないなら、ビルド成功を待つ手順を飛ばす。
- **add-task**: 要望の形を「誰が・どの画面（ゲームならシーン・モード）で・何ができるようになるか」にした。見出し ID の接頭辞を文書ごとに足してよい。
- **refactor**: 振る舞いの保存に、エンジンが保存する値と参照（例: Unity のシリアライズされた値・.meta の GUID）を含めた。
- **dev-loop**: 行名を揃え、報告に「運営者確認待ち」を載せる。
- **マニフェスト**: `plugin.json` を 0.3.0 にした。`plugin.json`・`marketplace.json`・README 2 本の説明を「Web アプリやゲームなど」に広げた。
- **CI**: `actions/checkout` と `actions/setup-node` を v7（Node.js 24 で動く版）にした。
- 0.2.0 の項の evals の記述を、事実に合わせて直した。

### 雛形への影響: あり

- `/docdd:update-kit` で置き換わるのは、キットのファイルの `.claude/rules/docdd-kit.md` と `scripts/*.mjs`（4 本）だけ。
- 利用者のファイル（`CLAUDE.md` の行名と Unity の例、`docs/PRD.md` の §3.3 の見出しと §2 の例、`docs/README.md`、`docs/requirements/README.md`、`docs/operations/development-and-testing.md`、`tasks/BACKLOG.md`、`.gitignore` の 2 つの塊）は、update-kit では変わらない（update-kit が足すのは新しい版で増えた節と行だけで、既存の節の中の文言は変えない）。要るなら、雛形（リポジトリの `plugins/docdd/templates/`）と見比べて手で直す。特に v0.2.0 で置いた `CLAUDE.md` の行名「E2E（実ブラウザ）」は、`init.mjs` は旧名も読むが、スキルは新しい行名で書いてあるので、手で「E2E（実際に動かす）」に直す。

### 今回やらなかったこと（理由）

- スタック別の変更影響表・エンジン専用のスキル: Web 以外で害が出ないように直すことを優先した。細部は「スキルへの追加指示」と README の案内で合わせる。
- v0.2.0 で置いた行名「E2E（実ブラウザ）」と `.gitignore` の見出し「# docdd」を update-kit で移すこと: 既存の利用者がいないため。
- Unity の PlayMode テストとコマンドでのビルドの実測: README と雛形の例は、Unity 公式ドキュメントと、別の検証用プロジェクトでの EditMode テストの実測に基づく。
- `check-doc-refs` で、英語の for example に続く箇条を見本として飛ばすこと: 判定は行ごとなので、飛ばすにはその行に「例」の字を入れる。
- 新しい evals 3 ケースの本実行: ケースの読み込みと、scaffold・grader の形だけ確かめた。本実行は `RELEASING.md` の手順で行う。
- Unity CLI・MCP サーバーの案内: experimental で、docdd では確かめていない。
- playwright-cli の `references/` の置き換え（0.2.0 の「次の版の予定」）: 今回は Web 以外への対応を優先した。次以降の版で行う。

## 0.2.0（2026-09-13）

### 追加

- スキル `tasks-from-prd`: PRD の機能一覧から最初のタスク群を下書きし、承認後に `tasks/BACKLOG.md` へ起票する。
- スキル `update-kit`: プラグインを更新したあと、置いた雛形を新しい版へ追随させる。手付かずのファイルは置き換え、手を入れたファイルは差分を見せて 1 件ずつ聞く。v0.1 系からの移行もこれで行う。
- `scripts/init.mjs`: init と update-kit が使う決まった処理（`status`・`apply`・`dates`・`precommit`・`update`）。雛形を Claude が手でコピーしなくなった。
- hook（`hooks/hooks.json`・`scripts/guard-bash.mjs`）: docdd のプロジェクトで、まとめて全部を stage する `git add`、`git commit -a`・`--amend`・`--no-verify`、角括弧つきの CI 省略の印、強制 push を止める。`rm -r`／`rm -f` の前には確認を出す。
- 雛形: `.claude/rules/docdd-kit.md`（キット共通の約束。`CLAUDE.md` から移した）、`.gitignore`、`docs/requirements/00_template.md`、`scripts/check-doc-placeholders.mjs`（未記入の欄 `{{…}}` の検査）。
- 記入済みの PRD 見本 `examples/PRD.sample.md`。
- `references/pitfalls.md`（症状・見る場所・対策の表）: verify-e2e・verify-integration・ui-polish・security-audit・speed-up。
- evals（3 ケース。手動で回す）、`LICENSE` のコピー、`NOTICE`（playwright-cli の出典）、この `CHANGELOG.md`。

### 変更

- **init**: 雛形は `init.mjs` が上書きせずに置く。検証コマンドは `package.json`・`pyproject.toml` などから推定して埋め、ヒアリングは分からない欄だけを、選んで答える問い（選択の画面）と書いて答える問い（番号付きの 1 メッセージ）に分けて聞く。何度実行しても安全（答えられる欄を聞き直し、推定できない行は一覧で示す）。引数で答えを渡すと質問せずに進む。既存の `CLAUDE.md` は 3 択（置き換え／表だけ追記／そのまま）。既存の `.claude/settings.json`・`.mcp.json` は触らず差分を報告する。既存の `tasks/BACKLOG.md` に書式の節が無ければ、足すかを聞く。置き場所がふさがっていれば（例: `tasks` という名前のファイル）、何も置かずに止まる。Claude Code のサンドボックスなどで `.claude/settings.json`・`.mcp.json` を書けなくても、残りの雛形は置き切り、書けなかったファイルを報告する。`package.json` の `audit:check` は npm（`package-lock.json`、または lock がまだ無い）のときだけ足し、同じ条件で『依存の脆弱性』行を `node scripts/audit-check.mjs` と推定する。コミットの前に git の名前とメール、`.env` の除外を確かめる。土台（アプリのコード）が無いときは先に作るかを聞く。「アプリの土台を作る」「テスト基盤の導入」を起票する。必要な Node.js を 18 以上にした（v0.1 系の説明では 20 以上）。
- **雛形 `CLAUDE.md`**: このプロジェクトのコマンドの表だけにした（154 行 → 83 行）。表をマーカー `<!-- docdd:tables:begin -->`〜`<!-- docdd:tables:end -->` で囲む。「検証コマンド」表に 開発サーバー起動・テスト用 DB・本番モード起動・未記入欄の検査・実物1周の費用上限、「反映コマンド」表に 作業ブランチ・本番ブランチ・反映の方式 の行を足した。「スキルへの追加指示」の節を足した。埋める欄の書き方を `<...>` から `{{…}}` にした。
- **雛形 `.claude/settings.json`**: まとめて消す削除・`git add -A`・`--amend`・`git push`・依存の追加を確認ありに、強制 push・`--no-verify`・`sudo`・`.env` の読み取りを禁止に、検査コマンドを確認なしにした。プラグインの取得元（`extraKnownMarketplaces`・`enabledPlugins`）を足した。
- **雛形 `.mcp.json`**: 版を固定した（`shadcn@4.21.0`・`next-devtools-mcp@0.4.0`）。
- **雛形 docs・tasks**: PRD に ID の規則・§3.3「主な画面と利用者の流れ」・記入例へのリンク。`development-and-testing.md` に §4「テスト基盤が無いとき」と §5「落とし穴」。requirements に見出し ID の規則。BACKLOG にステータス `dropped` と要決定の「状態」行（見本は運用ルールのコードブロックの中へ移し、実タスクと番号が重ならないよう `T-NN`・`D-N` で書く）。`docs/_imported/`（取り込んだ原文）の扱い。
- **検査スクリプト**: `check-doc-dates` は未記入の日付を「未記入」と列挙し、正本を見出しでも判定し、変更履歴の並び順を問わない。`check-doc-refs` は対象の拡張子・`](./…)` のリンク・`.claude/rules/` を足し、`.gitignore` 済みのファイルは警告にした。`audit-check` は allowlist に理由（`why`）と期限（`until`）を持てるようにし、古い lock の形式・モノレポの lock・古い Node.js を見分ける。4 本とも先頭に版の刻印。
- **全スキル**: 前置きを「前提（docdd）」に統一した（init の前なら止まる、「無い」と未記入の行は実行せず報告、「スキルへの追加指示」を優先、無い機能は「該当なし」）。`model: inherit` を削除し、`argument-hint` を足した。`init`・`release`・`update-kit` は自分で打ったときだけ動く（`disable-model-invocation`）。description を日本語の「何をする＋いつ使う」にした。著者のプロジェクト固有の事故談を除いた。
- **dev-loop**: テスト基盤の門と仕様の門を足した。決まった要決定を BACKLOG と正本へ書き戻す。報告に「テスト基盤: 単体=有/無・E2E=有/無」。
- **add-task**: 基盤タスクは PRD との照合を免除。要決定でタスクを増やしすぎない。参照の書式を固定。
- **doc-sync**: 検査は `CLAUDE.md` の表の行を実行する。`--full` に「docs が雛形のままのとき」を足した。
- **release**: 反映の方式（A／B／C／まだ公開しない）で経路を分けた。本番へ出す前に必ず運営者の「はい」を得る。push の前に `gh` のログインを確かめる。公開先の確認は playwright-cli で読むだけ。
- **security-audit**: 直す前に 1 件ずつ承知を得る。`/loop` の推奨を削除。無人で動いているときは報告と要決定の起票だけ。
- **maintenance**: 実物1周は費用上限の行に従う。溜まったデータは件数と dry-run の報告まで（本番データの削除は適用しない）。
- **refactor・speed-up**: 単体テストの基盤が無いときは監査（speed-up は計測と候補出し）だけ。
- **verify-integration**: 『テスト用 DB』行（① ローカル／② ホスト型の開発専用（`CLAUDE.md` に『本番と別・開発専用・破棄可能』と明記した接続先だけ）／③ DB 無し）で分岐する。実物1周は費用上限の行に従う。
- **verify-e2e・ui-polish**: playwright-cli の有無を確かめる順と、手作業の確認への切り替えを決めた。E2E の基盤が無ければ起票を案内する。
- **playwright-cli**: `allowed-tools` から runner 単体（`npx`・`npm`）を外した。インストールの案内を 0.1.17 に固定。ログイン状態・trace・スクショの保存先を決めた。description を日本語にした。
- **マニフェスト**: `plugin.json` を 0.2.0 にし、`displayName`・`homepage`・`repository` を足した。説明からスキルの本数を外した。`marketplace.json` の説明を `metadata.description` からトップレベルの `description` へ移した（`metadata` の下は後方互換の扱い）。
- README 2 本を書き直した（前提・全体像・入口の分岐・英語の確認・更新・やめるとき・困ったら）。

### 削除

- `.claude-plugin/marketplace.json` の `version`（`plugins[0]` と `metadata`）。版は `plugin.json` だけに書く。
- 雛形 `CLAUDE.md` の「スキルの地図」（README へ）、「いつ回すか」「落とし穴」（`development-and-testing.md` へ）、キット共通の約束（`.claude/rules/docdd-kit.md` へ）。
- 雛形 `tasks/BACKLOG.md` の見本タスク `T-00`。
- 各スキルの旧い前置き（配布リポジトリの URL と、手順書の写し方）。

### 雛形への影響: あり

- 対象: `CLAUDE.md`、`.claude/rules/docdd-kit.md`（新規）、`.claude/settings.json`、`.gitignore`（新規）、`.mcp.json`、`docs/**`、`tasks/**`、`scripts/*.mjs`（`check-doc-placeholders.mjs` は新規）、`package.json` の scripts（`check:doc-placeholders` を追加）。
- → v0.1 系で導入したプロジェクトは `/docdd:update-kit`（`CLAUDE.md` の移行を含む）。`.claude/settings.json` と `.mcp.json` は変えずに差分を報告するだけなので、必要なら手で直す。

### 今回やらなかったこと（理由）

- GitHub のリポジトリの説明・トピックの設定（`gh repo edit`）、push・タグ・GitHub Release: 外部への書き込みなので、著者が手で行う（`RELEASING.md`）。
- evals を CI で回すこと: 費用が出るので CI には入れず、`RELEASING.md` の手動の手順で回す。公開前に 3 ケースを本実行した。サンドボックスが設定ファイルの書き込みを止めて init が雛形を置き切らない不具合が見つかり、直したあとに 3 ケースとも合格した。
- playwright-cli の `references/` 9 本の置き換え: 次の版で行う（下の「次の版の予定」）。今回は `NOTICE` で出典を示した。
- `eject` スキル: README「手順書を直したいとき」の写し方で代替する。次以降の版で検討。
- 導入済みかを決まった形で判定するスクリプト（`docdd-status.sh`）: スキルの前置きの文章で代替する。次以降の版で検討。
- hook の第 2 段（stage 済みの差分の秘密値の検査、playwright の localhost 以外への接続の確認）: 今回は取り消しにくい git 操作と `rm` を止める第 1 段を優先した。次以降の版で検討。
- `SECURITY.md`・`CONTRIBUTING.md`・行動規範: 受け付けは Issues のテンプレートで代替する。次以降の版で検討。
- 複数 OS（Windows・macOS）の CI、README などの URL の死活の検査、audit-check の advisory ID での照合（allowlist はパッケージ名の単位）: 今回は導入の手順と安全の柵を優先した。次以降の版で検討。

### 次の版の予定

- playwright-cli の `references/`（英語 9 本）を、上流の公式スキル（`playwright-cli install --skills` で入るもの）へ置き換える。英語の手順書を丸ごと同梱するより、上流の版に合わせて更新できるため。

## 0.1.5（2026-09-13）

### スキルの変更

- なし。

### 雛形の変更

- なし（README の記事リンクの題名を更新しただけ）。
- 雛形への影響: なし。

## 0.1.4（2026-09-06）

### スキルの変更

- release: 軽量化の印（例: light ci）が効くのは、CI の側に「印があれば本体を飛ばす」仕組みがあるときだけと明記した。CI があれば軽量化でも完了を待つ。GitHub 公式の省略の印は使わない。
- init: ヒアリングに「反映コマンド」表の 3 行（staging へ反映・本番へ反映・公開先 URL）を足した。

### 雛形の変更

- `CLAUDE.md` の落とし穴に「コミットメッセージに角括弧付きの CI 省略の印を書かない」を 1 行足した。
- 雛形への影響: あり（`CLAUDE.md`）。

## 0.1.3（2026-09-05）

### スキルの変更

- release: CI を省略する空コミットの印を、GitHub 公式の省略の印から「light ci」（CI の本体だけを飛ばす軽量化）に変えた。省略の印をコミットメッセージに書かないルールを足した。

### 雛形の変更

- なし。雛形への影響: なし。

## 0.1.2（2026-09-05）

### スキルの変更

- スキル `release` を追加した（CI の要否を差分から判断 → push 1 回 → staging → 本番へ反映 → 実ブラウザで確認）。

### 雛形の変更

- `CLAUDE.md` に「反映コマンド」表（staging へ反映・本番へ反映・公開先 URL）を足し、スキルの地図と「流れ」に release を足した。
- 雛形への影響: あり（`CLAUDE.md`）。

## 0.1.1（2026-09-05）

### スキルの変更

- スキル 12 本（init を含む）の文面から、キットの元になったアプリ固有の文言（アプリ名・タスク ID の例・機能 ID・画面 ID など）を除き、どのプロジェクトでも読める書き方にした。
- 各スキルの前置きを、zip 版への切り替え案内から「配布リポジトリのスキルを `.claude/skills/` へ写す」案内に変えた。
- 配布をプラグインだけにした（README から zip 版の案内を削除）。

### 雛形の変更

- `CLAUDE.md`: 固有の文言を除き、スキルの切り替え方と「全検査」「依存の脆弱性」行の例を直した。
- `docs/README.md`: 検査の説明を直した。
- `scripts/check-doc-dates.mjs`: 正本の判定から固有の文書名を外した。`scripts/check-doc-refs.mjs`・`scripts/audit-check.mjs` はコメントだけ。
- `tasks/BACKLOG.md`: 見本タスクを `T-00`（`done`）にした。
- 雛形への影響: あり（`CLAUDE.md`・`docs/README.md`・`scripts/` の 3 本・`tasks/BACKLOG.md`）。

## 0.1.0（2026-09-05）

- 初版。スキル 11 本（add-task・dev-loop・doc-sync・verify-integration・verify-e2e・ui-polish・refactor・speed-up・security-audit・maintenance・playwright-cli）と `init`。
- 雛形: `CLAUDE.md`、`.claude/settings.json`、`.mcp.json`、`docs/`（README・PRD・requirements・decisions・operations）、`tasks/`（BACKLOG・REFACTOR_PLAN）、`scripts/`（check-doc-dates・check-doc-refs・audit-check と allowlist）、`package.json` に足す scripts。
