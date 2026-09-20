# 変更履歴（docdd）

版ごとの変更と、プロジェクトに置いた雛形への影響をまとめます。
「雛形への影響: あり」の版へ上げたら、プロジェクトのフォルダで `/docdd:update-kit` を打ちます（プラグインを更新しただけでは、置いた雛形は変わりません）。

## 0.6.0（2026-09-20）

反映の方式の呼び名を、記号（A・B・C）から、何が起きるかが分かる言葉にした。非エンジニアが `CLAUDE.md` の表や `/docdd:release` の報告を読んだときに、「いまどの経路で公開されるのか」がその場で分かるようにする。あわせて、リポジトリの README に全体の流れの図を足した。

### 変更

- **雛形 `CLAUDE.md`「反映コマンド」表**: 『反映の方式』に書く値を「自動公開」「確認してから公開」「コマンドで公開」「まだ公開しない」の 4 つにした（説明は書かず、言葉だけを書く）。表の下の例も新しい呼び名にした。
- **release**: 経路の見出しと本文を新しい呼び名にした（「方式 A の短い経路」→「『自動公開』の経路」、「方式 B・C の経路」→「『確認してから公開』『コマンドで公開』の経路」）。古い書き方（「A: 本番ブランチへ push すると…」など）は読み替えてそのまま動かし、報告で「新しい呼び名に書き換えると読みやすい」と 1 行添える（勝手に書き換えない）。
- **init**: 問 5（反映の方式）の選択肢と、`CLAUDE.md` への書き込み方を新しい呼び名にした。作業ブランチを聞くのは「確認してから公開」のときだけ。
- **リポジトリの `README.md`**: 「全体像」の節を足した。init → PRD → add-task → dev-loop →（要決定）→ release の流れの図（Mermaid）、4 つの置き場の表、公開のしかたと hook の要点。詳しい説明書は `plugins/docdd/README.md` にあると節を分けて示した。
- **プラグインの `README.md`**: 全体像から流れの図はリポジトリの README へ送り、「この README の読み方」（どの節から読むか）を足した。許可のモード（defaultMode）の説明を、箇条書きから「したいこと → 頼むこと」の表にまとめた。スキル一覧の `/docdd:release` の行を新しい呼び名にした。
- **検査スクリプト 5 本と `.claude/rules/docdd-kit.md`**: 刻印を v0.6.0 にした（中身の変更は無い）。

### 雛形への影響: あり

- `/docdd:update-kit` で置き換わるもの: 検査スクリプト 5 本・`.claude/rules/docdd-kit.md`（手付かずなら。刻印だけの差）。
- 手で直すもの: `CLAUDE.md`「反映コマンド」表の『反映の方式』の値と、表の下の例（あなたのファイルなので、update-kit は文面を変えない）。**直さなくても `/docdd:release` は古い書き方のまま動く。**

### 置いた仮説

- 呼び名から記号（A・B・C）を外し、スキルの中の分岐も同じ言葉で書いた。記号は短いが、報告に「方式 A のため CI は無し」と出ても意味が伝わらないため。
- 古い値は release が読み替えるだけにし、update-kit では自動で書き換えない（利用者のファイルの文面を勝手に変えない方針のまま）。
- 流れの図は Mermaid で、リポジトリの README に 1 つだけ置いた（2 か所に置くと、片方が古くなる）。プラグインの README にはリンクだけを置く。

### 今回やらなかったこと（理由）

- 変更に関係するテストだけを自動で選ぶ仕組み（`vitest related` など）: いまは「触った層で検証の種類を決め、タスクの完了前と push 前は全部回す」作り。関係するテストの選び損ねで壊れるより、全部回して遅い方を選ぶ。テストが増えて遅くなったときに、「検証コマンド」表の任意の行として検討する。
- evals のケース追加: 費用が出るため。既存の `release-not-published` は『反映の方式』が「まだ公開しない」なので、呼び名の変更では変わらない。
- 空のリポジトリでの `/docdd:init` の通し確認: init の変更は問 5 の選択肢の文言と書き込み方だけで、雛形を置くスクリプト（`init.mjs`）の処理は変えていないため、テスト 129 件で代替した。

## 0.5.0（2026-09-19）

BACKLOG を小さく保つ。終えたタスクまで `tasks/BACKLOG.md` に残すと、ファイルが育ち続け、「BACKLOG を読む」スキル（dev-loop・add-task・tasks-from-prd）が読むだけで作業の場所（コンテキスト）を使い、末尾の未着手のタスクを見落とす。1 人で長く開発を続けたプロジェクトで、BACKLOG が 1 万行・2MB 近くまで育った実例がある。終わったものは別のファイルへ移し、BACKLOG にはまだ動いているものだけを置く。

### 追加

- **雛形 `scripts/backlog-archive.mjs`**（キットが管理するファイル）: `tasks/BACKLOG.md` から、見出しの末尾の状態が `done`・`dropped` のタスクと、「要決定」の節で「- 状態: 決定…」の行がある判断を、`tasks/archive/BACKLOG-done.md` へ移す。
  - 運用ルールの書式の見本（コードブロックの中）は移さない。未決（「状態: 未決」）の判断は、本文に「解決」などの語があっても移さない。
  - 判断は「決定済み」の節の末尾へ、タスクはアーカイブの末尾へ足す。アーカイブが無ければ作り、見出しを消してあれば足す。移す文の相対リンクは、1 段深いアーカイブから同じ所を指すように直す。
  - `--check` は移さずに、移すものがあれば一覧を出して exit 1。改行（CRLF）は元のファイルに合わせる。
- **雛形 `tasks/archive/BACKLOG-done.md`**: 移した記録の置き場（見出し 2 つだけ）。丸ごと読まず、ID や言葉で検索して使う。
- **`package.json` の scripts**: `backlog:archive`（`node scripts/backlog-archive.mjs`）。
- **雛形 `.claude/settings.json`**: allow に `node scripts/backlog-archive.mjs`（と `--check`）・`npm run backlog:archive`。

### 変更

- **dev-loop**: 最初に `node scripts/backlog-archive.mjs` を回してから BACKLOG を読む。完了時にも回し、タスクのコミットに BACKLOG とアーカイブを含める。依存先が BACKLOG に無ければアーカイブを ID で検索して、`done`・「決定」かを確かめる。テスト基盤の門の「`done` がある」「`dropped` だけ」「どこにも無い」は、BACKLOG とアーカイブの両方で見る。スクリプトが無い（まだ update-kit していない）ときは移さずに進み、`/docdd:update-kit` を案内する。
- **add-task**: 二重の起票の確認で、アーカイブを要望の言葉で検索する（丸ごとは読まない）。T-番号・D-番号はアーカイブも含めた最大の次にする。
- **tasks-from-prd**: 既存のタスクと番号を、アーカイブも含めて見る。
- **release**: 「テスト無しで本番反映する」の決定を、BACKLOG とアーカイブの両方で探す（決まった判断はアーカイブへ移るため）。
- **init（スクリプト）**: 定型タスクの番号をアーカイブも含めた最大の次にし、アーカイブにある「アプリの土台を作る」（終えたもの）を足し直さない。
- **init（スキル）**: 取り込んだ仕様を分けるタスクの番号も、アーカイブを含めて数える。
- **雛形 `tasks/BACKLOG.md`** の運用ルール: 終えたら移す・番号はアーカイブも含めた最大の次・アーカイブは検索して使う、に書き換えた（「完了タスクは消さず `done` にする」をやめた）。
- **雛形 `.claude/rules/docdd-kit.md`**: 開発の進め方と Definition of Done に、アーカイブへ移すことを足した。
- **雛形 `CLAUDE.md`**: ディレクトリ構成に `tasks/archive/BACKLOG-done.md` の行を足し、`scripts/` の行に BACKLOG の整理を足した。
- **検査スクリプト**: 4 本の刻印を v0.5.0 にした。

### 雛形への影響: あり

- `/docdd:update-kit` で置き換わる・足されるもの: `scripts/backlog-archive.mjs`（新規）・`tasks/archive/BACKLOG-done.md`（新規）・`.claude/rules/docdd-kit.md`・検査スクリプト 4 本（手付かずなら）・`package.json` の `backlog:archive`・`CLAUDE.md` のディレクトリ構成の行。
- 手で直すもの: 既にある `tasks/BACKLOG.md` の「運用ルール」の文面（あなたのファイルなので、update-kit は節を足すだけで文面は変えない。直さなくてもスキルは新しい手順で動く）。`.claude/settings.json` の allow の追加（update-kit が差分を見せる）。

### 置いた仮説

- 移すのは「状態: 決定」の判断だけにした。書き戻し（PRD・ADR）が済んだかは見ない。書き戻しは、その判断に依存するタスクを dev-loop が選んだときに確かめる（アーカイブの「状態」行に書き戻し先がある）。
- アーカイブは `tasks/` の下に置いた。`check-doc-placeholders` は `tasks/*.md` として見るが、`check-doc-refs`・`check-doc-dates` は見ない（終えたタスクが、もう無いファイルを指していても落とさない）。

### 今回やらなかったこと（理由）

- evals のケース追加: 費用が出る（1 回約 4 ドル）ため。挙動はテスト（`tests/template-scripts.test.mjs`・`tests/init.test.mjs`）で固定した。
- アーカイブの分割（年ごとなど）: 1 人のプロジェクトでは検索で足りる。育って検索が遅くなったら考える。

## 0.4.0（2026-09-15）

コミュニティのマーケットプレイスへの申請の前に、許可設定・配布の手順・安全の柵を見直した。あわせて、検査が黙って合格する所（Vite の型検査、yarn v2 以上の監査）と、Web 以外で聞かなくてよい問いを直した。これまでの「やらなかったこと」のうち、秘密の値の検査（hook の第 2 段）、Windows の CI、URL の検査、脆弱性の ID での照合、`check-doc-refs` の for example の箇条、playwright-cli の `references/` の置き換えを、今回行った。

### 追加

- **hook: 秘密の値の検査**: docdd のプロジェクトで、`git commit` を含むコマンドの直前に、コミットに入る中身を調べる。見るのは、stage 済みの追加した行と、同じコマンドの中で `git commit` より前に `git add` したファイル（`cd`・`git -C` も追う。バイナリは飛ばす）。`git commit --dry-run` では調べない。
  - 止める: `.env`・`.env.*` のファイル（末尾が `.example`・`.sample`・`.template` のものは除く）、`git add -f`／`--force` での `.env` の形のファイル、秘密鍵（見出しと本体）、AWS のアクセスキー ID、Anthropic・OpenAI・Stripe（本番）・GitHub・Slack・Google の API キーやトークン、Slack の Webhook の URL、Supabase の秘密キー（`sb_secret_`）、role が service_role の JWT。
  - 確認を出す: 秘密らしい名前（`api_key`・`secret`・`token`・`password` など）に 16 文字以上の文字列を入れた行、調べた中身が 2MB を超えたとき。
  - 見本の値（`example`・`dummy`・`your-`・`xxxx` など）と、環境変数から読む行は通す。`docdd-allow-secret` を書いた行は飛ばす（`.env` のファイルには効かない）。止めるときも、キーそのものは表示しない。
  - `hooks.json` の git の handler の timeout を 30 秒にした（時間切れだと通してしまうため。macOS での実測は 1 回 0.5 秒未満）。
- **hook: PowerShell**: matcher を `Bash|PowerShell` にし、`PowerShell(git *)`・`PowerShell(Remove-Item *)` の handler を足した。git の判定と秘密の値の検査は Bash と同じ。`Remove-Item` の `-Recurse`・`-Force` で確認を出す（`guard-bash.mjs` は別名の `rm`・`del`・`erase`・`rd`・`rmdir`・`ri` も同じに扱う）。根拠は公式の hooks・tools-reference・permissions の頁で、Windows の実機では確かめていない。別名で hook が呼ばれるかも確かめていない（公式で別名を同じに扱うと書かれているのは許可の規則で、hook の `if` ではない）。macOS・Linux の pwsh の `rm` は OS の `rm` なので、`PowerShell(Remove-Item *)` に合わない見込み。
- **init**: Python を見つけたときだけ、`.gitignore` に「# docdd: Python」の塊（`__pycache__/`・`*.py[cod]`・`.venv/`・`.pytest_cache/`・`.mypy_cache/`・`.ruff_cache/`）を使う。update-kit も同じ選び方。
- **init**: Unity では『型検査』『lint』を「無い」と推定する。
- **init**: Vite のプロジェクトで `start` が無く `preview` があれば、『本番モード起動』を `<build> && <preview>`（`npm run build && npm run preview` など）と推定する。
- **雛形 `CLAUDE.md`**: 検証コマンドの例に「Unity のビルドの例」（ビルド用のスクリプト無しの `-build` と `-buildTarget`／`-activeBuildProfile`。docdd では確かめていない）。
- **雛形 `docs/operations/development-and-testing.md`** §4: 「Unity のビルドと PlayMode テスト」の箇条。
- **配布リポジトリ**:
  - `scripts/check-version-bump.mjs`（`npm run check` に追加）: 最新のタグ `docdd--vX.Y.Z` から `plugins/docdd/` の中身が変わったのに、版が同じなら落とす（`README.md`・`CHANGELOG.md`・`evals/` だけは数えない）。版を下げても落とす。
  - `scripts/check-urls.mjs`（`npm run check:urls`。CI には入れない）: README 2 本・CHANGELOG・RELEASING・skills・templates・examples の外部リンクを開けるか。
  - `scripts/run-tests.mjs`: `npm test` から `tests/*.test.mjs` を並べて `node --test` に渡す（macOS の Node 18・20・22・24 で同じ結果を確かめた。シェルの `*` の展開に頼らないので Windows の npm でも動く形だが、Windows の実機では確かめていない）。
  - `.gitattributes`: 改行を LF に固定した（Windows で取り出しても、テストと evals の scaffold が動く）。
  - Issue テンプレート: 「質問・分かりにくい所」（必須は「困っていること」だけ）と「要望」、`config.yml`（空の Issue は出さない）。どれも日本語でも英語でも書ける。
  - CI: `test-node18`（Node 18 で `npm test`）と `test-windows`（Windows で `npm test`。落ちても CI は止めない）。
- **evals**: grader 2 本（`init-unity-project` で『型検査』『lint』が「無い」、`init-new-node-project` で `.gitignore` に Python の塊が無い）。
- **テスト**: guard-bash に 16 本（秘密の値・PowerShell）。init に settings の差分・`.gitignore` の塊・Unity・監査のコマンド・Vite・CRLF。template-scripts に据え置きの ID と見本の箇条。新しく `tests/repo-scripts.test.mjs`（版の上げ忘れ・URL の検査）。
- **RELEASING.md**: 「main と配布」と「コミュニティのマーケットプレイスへの申請」（フォームに入れる値、説明と使い方の例 3 つを日本語のあとに英語で）。

### 変更

- **雛形 `.claude/settings.json`**: 始まりのモード `defaultMode`（`acceptEdits`）を外した。Pro・Max・Team の既定の auto モードを上書きしない。`allow`・`ask`・`deny` は変えていない。
- **init**: 問 8（settings を置くか）は、`.claude/settings.json` が無いときだけ聞く。既存の settings の差分から `defaultMode`・`missingMarketplace`・`missingEnabledPlugin` の欄を外し、始まりのモード（`currentDefaultMode`）を報告する。update-kit の報告も同じ。
- **init: 依存の脆弱性の推定**: npm 以外も本番の依存だけを見る。pnpm は `pnpm audit --audit-level=high --prod`、yarn v1 は `yarn audit --level high --groups dependencies`、yarn v2 以上は `yarn npm audit --recursive --severity high --environment production`（前は直接の依存しか調べず、依存の依存にある high を見落としていた）、bun は `bun audit --audit-level=high --prod`。npm は変えていない。yarn v2 以上は、`.yarnrc.yml` や `packageManager` の指定が無くても、`yarn.lock` の `__metadata:` で見分ける。
- **init: Vite の型検査の推定**: `tsconfig.json` が references の形で、`build` が `tsc -b`／`vue-tsc -b` を使い、参照先がどれも JS を書き出さなければ、`npx tsc -b`（Vue は `npx vue-tsc -b`。パッケージマネージャに合わせた形）にした。前の `npx tsc --noEmit` は、この形では 1 ファイルも調べずに合格していた。include の形（Next.js など）は今までどおり `npx tsc --noEmit`。
- **init: 開発サーバーのアドレス**: Vite・SvelteKit・Astro・Nuxt の『開発サーバー起動』に書くアドレスを `http://localhost:<ポート>` にした。これらは既定で localhost だけで待ち受け、macOS では 127.0.0.1 だと接続を断られるため。Next.js は今までどおり `127.0.0.1`。preview の『本番モード起動』にもアドレスを添える（`http://localhost:4173`、または `scripts.preview` の `--port`）。
- **init: Windows での git の一番上の判定**: 今いるフォルダと git の一番上のパスを、OS が返す正式な名前にそろえてから比べる。短い名前（`RUNNER~1` など）や大文字小文字の違いで「一番上ではない」と誤り、モノレポの位置もずれていた（CI の `test-windows` で見つかった）。
- **init・update-kit: `.gitignore`**: 新しく置くときも、プロジェクトに合う塊だけを並べる（雛形の丸写しをやめた）。
- **audit-check**: 据え置きを、パッケージの単位から脆弱性の ID（GHSA）の単位にした。
  - 一覧の形は `{ "<パッケージ名>": { "ids": ["GHSA-xxxx-xxxx-xxxx"], "why": "<なぜ今直さないか>", "until": "YYYY-MM-DD" } }`。3 つとも必須で、欠けや古い書き方（値が文字列）は exit 2 で書き方を示す。「期限なし」の警告は無くした。
  - 一覧にあるパッケージでも、`ids` に無い high は落ちる。critical は据え置けない。期限切れは落ちる（どちらも今までどおり）。
  - 依存の脆弱性が伝わって high になっただけの親（例: express）は数えない。npm audit の経路と、bulk endpoint に直接問い合わせる経路で、合否と出力が同じ。
  - 落ちたときに、一覧に貼れる JSON を出す。合格したときに、据え置き中の ID と、一覧から消せる ID を出す。
  - 件数の行は、脆弱性を持つパッケージの数から、脆弱性の数になった（前の報告と比べるときは、数え方が違う）。
- **check-doc-refs**: 行末が `for example`・`for instance`・`e.g.`・`例えば`・`たとえば` の行（末尾のコロンは無視）に続く箇条を、見本として検査しない。「例外」の「例」は数えない（「例外」のほかに「例」が無い行は検査する）。落ちたときの案内を 2 行にした。
- **検査スクリプト**: 4 本の刻印を v0.4.0 にした。
- **playwright-cli・ui-polish・verify-e2e**: プロジェクトの Playwright で代用できるかを、`npx --no-install playwright cli --help` の出力に `playwright-cli` を含む行があるかで決める（古い Playwright は、別のヘルプを出して終了コード 0 で終わるため、終了コードでは決めない）。playwright-cli の `allowed-tools` に `Bash(npx --no-install playwright cli *)` を足した。
- **playwright-cli**: 詳しい使い方は、`playwright-cli --help` の `Agent skill:` 行が指す公式の手順書を読む。行が無い・読めないときは `--help` で進める。公式の手順書と違う所（`@latest` での入れ方・保存先・`playwright-cli install`）は docdd の決まりに従う。固定の版は 0.1.17 のまま。
- **playwright-cli・ui-polish**: 開発サーバーのアドレスの例を、『開発サーバー起動』行のアドレス（例: `http://localhost:5173`）に合わせた。127.0.0.1 で開くときは、Vite などの開発サーバーを `--host 127.0.0.1` で起動する、を足した。
- **maintenance・security-audit**: 据え置きの説明を、ID の単位と「一覧が効くのは npm の audit-check だけ」に合わせた。npm 以外は `tasks/BACKLOG.md` の要決定に、ID・理由・期限を書く。
- **雛形 `CLAUDE.md`**: ディレクトリ構成の `.claude/settings.json` の行から「プラグインの取得元」を消した。Unity の例の PlayMode テストに「docdd では確かめていない」を足した。pnpm の『依存の脆弱性』の例に `--prod` を足した。据え置きの一覧の説明を、npm の audit-check だけに効き、ID・理由・期限を書く形にした（npm 以外は `tasks/BACKLOG.md` の要決定に書く）。
- **雛形 `docs/README.md`**: 参照の検査で見本として見ない所を、3 つの箇条にした（「例」の字がある行、コメントとコードブロックの中、前置きの行に続く箇条）。据え置きの一覧の説明を、雛形 `CLAUDE.md` と同じにした。
- **雛形 `docs/operations/development-and-testing.md`**: Godot には標準のテスト道具が無いので、アドオンの GUT か gdUnit4 を入れる、にした。
- **雛形 `.claude/rules/docdd-kit.md`**: 刻印を v0.4.0 にした。
- **hook の説明**（`hooks.json` の description）に、秘密の値と PowerShell を足した。`rm` の確認の文面に `Remove-Item` を足した。
- **CI**: `ci.yml` の冒頭を「main はいつ配布されてもよい状態に保つ。PR の CI で緑にしてから入れる」にした。
- **Issue テンプレート `bug.yml`**: 必須を「起きたこと」と「docdd の版」の 2 つにし、冒頭の文と揃えた。
- **evals**: `init-unity-project` の期待する結果に、『型検査』『lint』が「無い」を足した。
- **テスト**: `tests/init.test.mjs` を、Windows の改行（CRLF）で取り出しても通るようにした（chmod のテストは Windows では飛ばす）。
- **マニフェスト**: `plugin.json` を 0.4.0 にした。`plugin.json`・`marketplace.json` の説明の日本語のあとに、英語を 1 文足した。プラグインの説明の hook に、秘密の値を足した。
- **README 2 本**: 冒頭に使える環境（Claude Code 向け。Cowork では確かめていない）と英語の要約。確認の出方（auto モード、allow・ask・deny、hook、`defaultMode` の足し方と、消したときに始まるモード）。入れ方・更新・やめ方で、`@` の右の名前を `/plugin list` で確かめる書き方。hook の表（秘密の値・PowerShell）と Windows の注意。Unity のビルドのコマンド。依存の脆弱性のコマンドの表と、据え置きの書き方。Issues のリンクを、種類を選ぶ画面（`issues/new/choose`）にした。「手順書を直したいとき」に写すときの注意 4 点。
- **NOTICE**（2 本）: `references/` の同梱をやめた書き方にした。
- **RELEASING.md**: main へのマージを配布として扱う手順にした（PR の CI で緑にしてからマージ、版の上げ忘れの検査、`npm run check:urls`）。

### 削除

- 雛形 `.claude/settings.json` の `permissions.defaultMode`・`extraKnownMarketplaces`・`enabledPlugins`。別の PC でフォルダを開いたときに入れ方を案内する働きは、無くなった（ほかの配布元から入れた人のプロジェクトに、違う配布元の docdd を有効にする指定を置かないため）。
- init の問い「既存の settings.json に 2 つのキーを足すか」と、そのための Edit の手順。
- `skills/playwright-cli/references/` の 9 本（上流の `@playwright/cli` 0.1.17 の写し）。
- `scripts/audit-allowlist.json` の古い書き方（値が理由の文字列、ID の無い形）と、「期限なし」の警告。

### 雛形への影響: あり

- `/docdd:update-kit` で置き換わる（手付かずのとき。手を入れていれば、差分を見せて聞く）: `.claude/rules/docdd-kit.md`（刻印だけ）、`scripts/audit-check.mjs`・`scripts/check-doc-refs.mjs`（中身）、`scripts/check-doc-dates.mjs`・`scripts/check-doc-placeholders.mjs`（刻印だけ）。
- update-kit が、足してよいかを聞く: `.gitignore` の足りない行（Python のプロジェクトなら「# docdd: Python」の塊）。
- 変わらない（利用者のファイル）。要るなら、雛形（リポジトリの `plugins/docdd/templates/`）と見比べて、手で直す。
  - `scripts/audit-allowlist.json`: 中身を書いていたら、`ids`・`why`・`until` の形に書き直す。古い書き方のままだと、置き換わった `audit-check.mjs` が exit 2 で止まる（`{}` のままなら直さなくてよい）。
  - `.claude/settings.json`: auto モードで始めたいなら、`defaultMode` の行を消す。消したあとに auto モードで始まるのは、Pro・Max・Team で、`~/.claude/settings.json` にも別の `defaultMode` が無いとき。Enterprise・Console の API キーでは Manual で始まるので、`~/.claude/settings.json` の permissions に `"defaultMode": "auto"` を書く（README「英語で出る確認と答え方」）。ほかの配布元から入れたなら、`extraKnownMarketplaces`・`enabledPlugins` の docdd の行を消す。update-kit は、始まりのモードを報告する。
  - `CLAUDE.md`「検証コマンド」表: Vite で『型検査』が `npx tsc --noEmit` なら `npx tsc -b`（Vue は `npx vue-tsc -b`）に。pnpm・yarn・bun の『依存の脆弱性』行を、上の新しいコマンドに。Unity で『型検査』『lint』が未記入なら「無い」に。Vite・SvelteKit・Astro・Nuxt で『開発サーバー起動』のアドレスが `http://127.0.0.1:<ポート>` なら `http://localhost:<ポート>` に。表の下の例（Unity のビルドの例、PlayMode の注記、pnpm の例の `--prod`、据え置きの一覧の説明）と、ディレクトリ構成の設定の行の文言。
  - `docs/README.md`: 参照の検査で見本として見ない所の説明と、据え置きの一覧の説明。
  - `docs/operations/development-and-testing.md` §4: Godot の書き方と、「Unity のビルドと PlayMode テスト」。
- hook とスキルの変更は、プラグインを更新すれば効く（update-kit は要らない）。

### 仮説（決まっていない点を、こう置いた）

- H1: `plugins/docdd/` の中でも、`README.md`・`CHANGELOG.md`・`evals/` だけを変えたときは版を上げない（入れている人の動きが変わらないため）。版の上げ忘れの検査も、この 3 つは数えない。
- H2: Cowork では動作を確かめていない。README と申請の文面には「Claude Code（ターミナル・Desktop・IDE）向け。git・Node.js・ターミナルが要るので、Cowork では確かめていない」と書く。
- H3: 秘密の値は、確実な形（秘密鍵・既知の形のキー・`.env` の追加）なら止め、怪しい形なら確認を出す。誤検知のときの逃げ道は、その行に `docdd-allow-secret` と書くこと（止めるときの文面で、運営者に確かめてから書くよう求める）。
- H4: 据え置きの一覧は `ids`・`why`・`until` を必須にし、古い書き方は exit 2 で書き方を示す（利用者がまだいないので、移行の仕組みは作らない）。
- H5: `.gitignore` の Python の塊は、Python を見つけたときだけ足す。Web の塊の選び方は変えない。
- H6: Godot では『型検査』『lint』を推定しない（「無い」と決める根拠が無い）。
- H7: 必要な Node.js は 18 以上のまま（今の中身で正しい）。CI で 18 を回して確かめる。
- H8: Vite のプロジェクトで `preview` があれば、それを『本番モード起動』とみなす。
- H9: playwright-cli の固定の版は 0.1.17 のまま（新しい版を、実際のブラウザで確かめていないため）。
- H10: 「事例」「比例」なども「例」を含むので、今までどおり見本として飛ばす。「例外」だけは語として除いて判定する。
- 実装で置いた決定: Vite の references の形で、`build` に `tsc -b` が無いとき、`extends` の先を読めないとき、参照先が JS を書き出すときは、『型検査』を推定しない（ヒアリングで聞く）。1 ファイルも調べずに合格するコマンドを、表に書かないため。

### 今回やらなかったこと（理由）

- 脆弱性を非公開で知らせてもらう窓口（`SECURITY.md`・GitHub の非公開の報告）: 置かない。審査では求められておらず、利用者の多くは非エンジニアで、使う場面がほぼ無い。置くと、通知を見て返事を続ける負担が出るため。知らせは Issues で受ける。
- Unity の PlayMode テストとコマンドでのビルドの実測: 今回も Unity を起動していない。README と雛形は「docdd では確かめていない」と揃え、書き方は Unity 6000.3 の公式ドキュメントに合わせた。Unity CLI は experimental のままなので、紹介しない。
- どの配布元から入れたかを init が調べ、設定を書き分けること: キャッシュの置き場所の形が、公式に保証されていないため。README は「`@` の右の名前は `/plugin list` で確かめる」書き方にした。
- main のブランチ保護（CI の合格を必須にする）: 1 人の運用で手間が増えるため。代わりに、版の上げ忘れを CI で落とし、手順で PR の CI を緑にしてからマージする。
- 雛形の許可設定に、PowerShell 用の規則を足すこと: `allow`・`ask`・`deny` は変えない決定のため。PowerShell では hook だけが柵になる。
- 秘密の値の検査を push の直前にも行うこと: コミットの直前で止めれば、push には入らないため。npm のトークンと Stripe のテスト用のキーの形も、今回は対象外。
- 動作の評価（evals）を GitHub 上で回すこと: 1 回約 4 ドルの API の請求と、キーの管理が要るため。今のまま、手元で手動で回す。
- playwright-cli が手元以外のサイトを開くときに、hook で確認を出すこと: クリックやリダイレクトでの移動は hook から見えず、「確認が出るから安全」と誤解させるおそれがあるため。本番での入力や送信は、スキルの文章で禁じている。使った人の声を待つ。
- 手順書を写す専用のスキル（eject）: 作らず、README「手順書を直したいとき」に注意 4 点を足した。丸ごと写すと update-kit で新しい版に追随できず、キットの利点を失うため。
- `CONTRIBUTING.md`・行動規範: 外部からの貢献者がまだいないため。最初の PR や声が来てから考える。
- ゲームエンジン向けの変更影響表・専用スキル: 今のまま（汎用の行と「スキルへの追加指示」で合わせる）。PlayMode もビルドも実測していないため。
- 導入済みかを判定するスクリプト（`docdd-status.sh`、0.2.0 の宿題）: 宿題から外した。`init.mjs` の `status` で置き換え済み（スキルの前置きも、init の前なら止まって `/docdd:init` を案内する）。
- 英語の要約の一致を見る検査: 足していない。README 2 本の英語の要約は同じ文にし、RELEASING.md の申請の節に、変えるときは揃えると書いた。
- Windows の実機での確認（PowerShell の hook・CI の `test-windows`）と、evals の本実行（新しい grader 2 本を含む）: 実機が無く、evals は費用が出るため。`test-windows` は、落ちても CI を止めない。

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
