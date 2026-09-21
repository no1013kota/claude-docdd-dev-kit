# {{プロジェクト名}} 開発ガイド

{{何を作っているか1行}}。

- このファイルには、このプロジェクトだけのこと（構成・コマンド・スキルへの追加指示）を書く。
- 仕様の正本は `docs/`（どこに何を書くかは `docs/README.md`）。
- キット共通の約束（5原則・変更影響 → 必須の検証・Definition of Done・規約）は `.claude/rules/docdd-kit.md` にあり、毎回自動で読み込まれる。
- 手順書（スキル）はプラグイン `docdd` が提供する。`/docdd:` と打つと一覧が出る。

## スキル（何を使うか）

| 場面 | スキル |
|---|---|
| 起票する | `/docdd:add-task`（要望を 1 件ずつ）／`/docdd:tasks-from-docs`（仕様書からまとめて。docs を自分で書き換えたあとも） |
| 開発する | `/docdd:dev-loop`（タスクを 1 件。中で検証と docs 同期まで行う） |
| **スキルを通さず自分で直した・ui-polish だけで直した** | `/docdd:doc-sync`（直したコードに合わせて仕様書を直す。**省かない**） |
| 検証する | `/docdd:verify-integration`（DB・migration・権限・API）／`/docdd:verify-e2e`（操作の流れ）／`/docdd:ui-polish`（Web の画面） |
| 仕上げる（必要なときだけ） | `/docdd:refactor`（中身を整える）／`/docdd:speed-up`（表示が遅い。Web）／`/docdd:security-audit`（公開前や、ログイン・課金・外部連携を触ったあと） |
| 反映・点検する | `/docdd:release`（本番へ。運営者が打つ）／`/docdd:maintenance`（週 1 回。`monthly` で月次も） |
| 導入・更新する | `/docdd:init`（導入。運営者が打つ）／`/docdd:update-kit`（雛形を新しい版へ。運営者が打つ） |

## ディレクトリ構成

| ファイル・フォルダ | 内容 |
|---|---|
| `docs/` | 仕様の正本と ADR（技術判断の記録） |
| `docs/operations/development-and-testing.md` | 開発とテストの進め方（テストの層・いつ回すか・テスト基盤が無いとき・落とし穴）。実装前に読む |
| `docs/operations/backup-and-restore.md` | 控えと戻し方（何を守るか・置き場所・戻す手順・戻せたことを確かめた記録）。データを戻すときと月次点検で読む |
| `tasks/BACKLOG.md` | 作業キュー（タスク）と要決定（運営者に決めてほしいこと）。まだ動いているものだけを置く |
| `tasks/archive/BACKLOG-done.md` | 終わったタスクと決まった判断の置き場（`node scripts/backlog-archive.mjs` が移す） |
| `scripts/` | docs の検査・未記入欄の検査・依存の脆弱性の検査・BACKLOG の整理のスクリプト。検査は下の「検証コマンド」表から使う |
| `.claude/rules/docdd-kit.md` | キット共通の約束。`/docdd:update-kit` が新しい版にするので、直接は直さない（このプロジェクトだけの指示は下の「スキルへの追加指示」へ） |
| `.claude/settings.json` | Claude Code の許可設定（例: 検査コマンドは確認なしで進め、削除や push は必ず確認する） |
| `.mcp.json` | Claude Code から使う MCP サーバー（外部の道具とつなぐ設定）。使う道具に合わせて足す |
| `.docdd/manifest.json` | キットの版と、キットが置いたファイルの記録（`/docdd:update-kit` が使う。更新のお知らせを止める `"notifyUpdates": false` を足すほかは、手で直さない） |
| アプリ本体 | {{フレームワーク名}} |

<!-- docdd:tables:begin -->
## 検証コマンド

スキルは検証のコマンドをこの表から使う。コマンドはバッククォートで囲み、このプロジェクトに無いものは「無い」と書く。
二重波かっこ（`{{…}}`）のままの行は未記入として扱い、スキルは実行せずに「未記入」と報告する。

| 用途 | コマンド |
|---|---|
| 開発サーバー起動 | {{開発サーバー起動}} |
| テスト用 DB | {{テスト用 DB}} |
| 型検査 | {{型検査}} |
| lint | {{lint}} |
| 単体・DBテスト | {{単体・DBテスト}} |
| ビルド | {{ビルド}} |
| 本番モード起動 | {{本番モード起動}} |
| E2E（実際に動かす） | {{E2E}} |
| 全検査（push 前に1回） | {{全検査}} |
| docs の検査 | `node scripts/check-doc-dates.mjs && node scripts/check-doc-refs.mjs` |
| 未記入欄の検査 | `node scripts/check-doc-placeholders.mjs` |
| 依存の脆弱性 | {{依存の脆弱性}} |
| 実物1周の費用上限 | {{実物1周の費用上限}} |

書き方の見本は、この表の下のコメントにある（ファイルを開くと見える。毎回の会話には読み込まれない）。

<!-- 書き方の見本（例の行は実行しない）:

- npm の例: 開発サーバー起動 `npm run dev`（http://127.0.0.1:3000 で開く）／型検査 `npx tsc --noEmit`／単体・DBテスト `npm test`／E2E `npx playwright test`／全検査 `npx tsc --noEmit && npm run lint && npm test && npm run build && npx playwright test`
- pnpm の例: lint `pnpm lint`／ビルド `pnpm build`／本番モード起動 `pnpm build && PORT=3100 pnpm start`（http://127.0.0.1:3100 で開く）
- Python の例: 型検査 `mypy .`／lint `ruff check .`／単体・DBテスト `pytest`／依存の脆弱性 `pip-audit`
- Unity の例（Unity の場所は macOS の Unity Hub の既定で、環境で違う。`<版>` は ProjectSettings/ProjectVersion.txt の m_EditorVersion）: 開発サーバー起動・本番モード起動・依存の脆弱性は「無い」／テスト用 DB は ③／型検査・lint は「無い」（コンパイルエラーは EditMode テストで出る）／単体・DBテスト `mkdir -p Logs && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -nographics -projectPath "$(pwd)" -runTests -testPlatform EditMode -testResults "$(pwd)/Logs/editmode.xml" -logFile "$(pwd)/Logs/editmode.log"`（EditMode テスト）／E2E は同じコマンドの EditMode を PlayMode に、editmode を playmode に変え、`-nographics` を外す（PlayMode テスト）。Editor で同じプロジェクトを閉じてから回す（閉じるのは運営者）。`-runTests` に `-quit` を付けない
- Unity のビルドの例（書き方は Unity 6000.3 の公式ドキュメントのとおり）: ビルド用のスクリプトが無くても `-build` で作れる。macOS なら `mkdir -p Logs Builds && /Applications/Unity/Hub/Editor/<版>/Unity.app/Contents/MacOS/Unity -batchmode -quit -projectPath "$(pwd)" -buildTarget osxuniversal -build "$(pwd)/Builds/<名前>.app" -logFile "$(pwd)/Logs/build.log"`。テストと違い、ビルドには `-quit` を付ける。Windows は `-buildTarget win64` にし、出力先を .exe で終える。ビルドプロファイルを使うなら、`-buildTarget osxuniversal` の代わりに `-activeBuildProfile "Assets/Settings/Build Profiles/<名前>.asset"`（プロジェクトからの相対パス）。ビルド用のスクリプトを作ったなら、`-build` とその出力先の代わりに `-executeMethod <クラス名.メソッド名>`。出力先（Builds/ など）は git に入れない（.gitignore に無ければ足す）
- テスト用 DB の例（3 種から選ぶ）: ① ローカル: `supabase start`／② ホスト型の開発専用: 接続先は .env の `DATABASE_URL`（本番と別・開発専用・破棄可能）／③ DB 無し
- 依存の脆弱性の例: npm で package-lock.json があるなら `node scripts/audit-check.mjs`、pnpm なら `pnpm audit --audit-level=high --prod`（本番の依存だけを見る）
- 実物1周の費用上限の例: 1 周 $0.50 まで（金額はバッククォートで囲まない。外部 AI や有料 API を使わないなら「無い」）
-->

## 反映コマンド

`/docdd:release` がこの表に従って公開する。書き方は「検証コマンド」表と同じ（コマンドはバッククォート、無いものは「無い」）。

| 用途 | コマンド・値 |
|---|---|
| 作業ブランチ | {{作業ブランチ}} |
| 本番ブランチ | {{本番ブランチ}} |
| 反映の方式 | {{反映の方式}} |
| staging へ反映 | {{staging へ反映}} |
| 本番へ反映 | {{本番へ反映}} |
| 本番 DB のバックアップ | {{本番 DB のバックアップ}} |
| 戻し方 | {{戻し方}} |
| 公開先 URL | {{公開先 URL}} |

書き方の見本は、この表の下のコメントにある（ファイルを開くと見える。毎回の会話には読み込まれない）。

<!-- 書き方の見本（例の行は実行しない）:

- 反映の方式の例: 次の 4 つの言葉から 1 つを書く（説明は書かない）。
  - 「自動公開」— 本番ブランチへ push すると、Vercel などのホスティングが公開する
  - 「確認してから公開」— 確認用の環境（staging）で確かめてから、本番ブランチへ PR を出す
  - 「コマンドで公開」— 『本番へ反映』行のコマンドを実行して公開する
  - 「まだ公開しない」— `/docdd:release` は何もせずに止まる
- ブランチの例: ブランチ名はそのまま書く。「自動公開」なら作業ブランチと本番ブランチを同じ名前にする（1 本で運用するならどちらも main）。「確認してから公開」は別の名前にする（例: 作業ブランチ develop、本番ブランチ main。staging が無ければ『staging へ反映』を「無い」にすると PR だけの経路）
- 反映コマンドの例: 「自動公開」なら staging へ反映・本番へ反映はどちらも「無い」。「コマンドで公開」なら本番へ反映に `npm run deploy:production`
- 本番 DB のバックアップの例: migration（DB の構造変更）を含む反映のとき、`/docdd:release` が本番 DB を変える前にこの行を使う。次の 4 つのどれかを書く。
  - コマンド: 例 `pg_dump "$PROD_DATABASE_URL" -Fc -f /tmp/claude/db-$(date +%F).dump`（Supabase なら `supabase db dump --db-url "$PROD_DATABASE_URL" -f /tmp/claude/db-$(date +%F).sql`）。接続先は `.env` の変数で渡し、値は書かない。出力先はリポジトリの外（`/tmp/claude/`）にする
  - 「自動（DB サービス側）: <戻せる範囲。例: 日次バックアップ＋7 日の PITR>」— 取るのはサービス任せ。release は実行せず、この文を報告に写す
  - 「無い」— 取らない（release が 1 回だけ確認し、`tasks/BACKLOG.md` の要決定に記録する）
  - 「無い（DB を使わない）」— DB そのものが無いプロジェクト
- 戻し方の例: 公開した版に不具合が出たときに、原因を直すより先に**前の版へ戻す**手順。次のどれかを書く（戻るのは版だけ。データを戻すときは『本番 DB のバックアップ』行の控えを使う）。
  - ホスティングの画面で前のデプロイへ戻す（その手順を 1 行で）
  - `git revert <コミット> && git push origin <本番ブランチ>`（戻す変更を新しく積む）
  - 機能を止める切り替え（環境変数を安全側の値に戻して、もう一度反映する）
  - 配り直す（ゲーム・ネイティブアプリ）: 前の版のビルドを配る／ストアの前の版へ戻す
  - 「無い」— 前の版へは戻さず、直して出し直す
- 公開先 URL の例: https://example.com（まだ公開しないなら「無い」）
-->

## スキルへの追加指示

このプロジェクトだけの手順の上書き。行があるスキルは、その行を本文より優先する。

| スキル | 追加指示 |
|---|---|

<!-- 例: | `/docdd:release` | PR は作らず main へ直接 push する | -->
<!-- docdd:tables:end -->
