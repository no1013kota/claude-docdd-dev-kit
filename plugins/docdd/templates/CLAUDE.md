# {{プロジェクト名}} 開発ガイド

{{何を作っているか1行}}。

- 仕様の正本は `docs/`（どこに何を書くかは `docs/README.md`）。
- キット共通の約束（5原則・変更影響 → 必須の検証・Definition of Done・規約）は `.claude/rules/docdd-kit.md` にあり、毎回自動で読み込まれる。
- 手順書（スキル）はプラグイン `docdd` が提供する。`/docdd:` と打つと一覧が出る。

## ディレクトリ構成

| パス | 内容 |
|---|---|
| `docs/` | 仕様の正本と ADR（技術判断の記録）。どこに何を書くかは `docs/README.md` |
| `docs/operations/development-and-testing.md` | 開発とテストの進め方（テストの層・いつ回すか・テスト基盤が無いとき・落とし穴）。実装前に読む |
| `tasks/BACKLOG.md` | 作業キュー（タスク）と要決定（運営者に決めてほしいこと） |
| `tasks/REFACTOR_PLAN.md` | リファクタ計画（`/docdd:refactor` が読み書きする） |
| `scripts/` | docs の検査・未記入欄の検査・依存の脆弱性の検査。下の「検証コマンド」表から使う。据え置く脆弱性は `scripts/audit-allowlist.json` に理由を添えて書く |
| `.claude/rules/docdd-kit.md` | キット共通の約束。キットが管理するので直接は直さない（このプロジェクトだけの指示は下の「スキルへの追加指示」へ） |
| `.claude/settings.json` | Claude Code の許可設定（例: 検査コマンドは確認なしで進め、削除や push は必ず確認する）と、プラグインの取得元 |
| `.mcp.json` | Claude Code から使う MCP サーバー（外部の道具とつなぐ設定）。使う道具に合わせて足す（例: Next.js なら shadcn/ui・Next.js DevTools を初期設定し、それ以外は空で置く） |
| `.docdd/manifest.json` | キットの版と、キットが置いたファイルの記録（`/docdd:update-kit` が使う。手で直さない） |
| アプリ本体 | {{フレームワーク名}} |

<!-- docdd:tables:begin -->
## 検証コマンド

スキルはこの表のコマンドを実行する。コマンドはバッククォートで囲み、このプロジェクトに無いものは「無い」と書く。
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
| E2E（実ブラウザ） | {{E2E}} |
| 全検査（push 前に1回） | {{全検査}} |
| docs の検査 | `node scripts/check-doc-dates.mjs && node scripts/check-doc-refs.mjs` |
| 未記入欄の検査 | `node scripts/check-doc-placeholders.mjs` |
| 依存の脆弱性 | {{依存の脆弱性}} |
| 実物1周の費用上限 | {{実物1周の費用上限}} |

例（書き方の見本。例の行は実行しない）:

- npm の例: 開発サーバー起動 `npm run dev`（http://127.0.0.1:3000 で開く）／型検査 `npx tsc --noEmit`／単体・DBテスト `npm test`／E2E `npx playwright test`／全検査 `npx tsc --noEmit && npm run lint && npm test && npm run build && npx playwright test`
- pnpm の例: lint `pnpm lint`／ビルド `pnpm build`／本番モード起動 `pnpm build && PORT=3100 pnpm start`（http://127.0.0.1:3100 で開く）
- Python の例: 型検査 `mypy .`／lint `ruff check .`／単体・DBテスト `pytest`／依存の脆弱性 `pip-audit`
- テスト用 DB の例（3 種から選ぶ）: ① ローカル: `supabase start`／② ホスト型の開発専用: 接続先は .env の `DATABASE_URL`（本番と別・開発専用・破棄可能）／③ DB 無し
- 依存の脆弱性の例: npm で package-lock.json があるなら `node scripts/audit-check.mjs`、pnpm なら `pnpm audit --audit-level=high`
- 実物1周の費用上限の例: 1 周 $0.50 まで（金額はバッククォートで囲まない。外部 AI や有料 API を使わないなら「無い」）

## 反映コマンド

`/docdd:release` がこの表に従って公開する。書き方は「検証コマンド」表と同じ（コマンドはバッククォート、無いものは「無い」）。

| 用途 | コマンド・値 |
|---|---|
| 作業ブランチ | {{作業ブランチ}} |
| 本番ブランチ | {{本番ブランチ}} |
| 反映の方式 | {{反映の方式}} |
| staging へ反映 | {{staging へ反映}} |
| 本番へ反映 | {{本番へ反映}} |
| 公開先 URL | {{公開先 URL}} |

例（書き方の見本。例の行は実行しない）:

- 反映の方式の例: 次の 4 つから 1 つを書く。「A: 本番ブランチへ push するとホスティングが自動で公開」「B: staging を確認してから本番ブランチへ PR」「C: 反映コマンドを実行」「まだ公開しない」
- ブランチの例: ブランチ名はそのまま書く。方式 A なら作業ブランチと本番ブランチを同じ名前にする（1 本で運用するならどちらも main）。方式 B は別の名前にする（例: 作業ブランチ develop、本番ブランチ main。staging が無ければ『staging へ反映』を「無い」にすると PR だけの経路）
- 反映コマンドの例: 方式 A なら staging へ反映・本番へ反映はどちらも「無い」。方式 C なら本番へ反映に `npm run deploy:production`
- 公開先 URL の例: https://example.com（まだ公開しないなら「無い」）

## スキルへの追加指示

このプロジェクトだけの手順の上書き。行があるスキルは、その行を本文より優先する。

| スキル | 追加指示 |
|---|---|

<!-- 例: | `/docdd:release` | PR は作らず main へ直接 push する | -->
<!-- docdd:tables:end -->
