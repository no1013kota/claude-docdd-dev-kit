---
name: playwright-cli
description: ブラウザ操作の道具箱。画面を開く・操作する・スクショを撮る・コンソールや通信を確かめるときに使う。ui-polish・verify-e2e・release から使う。接続先はローカル（公開先の確認は release のときだけ）。Web 以外のプロジェクト（ゲーム・ネイティブアプリなど）では使わない。
allowed-tools: Bash(playwright-cli *) Bash(npx playwright-cli *) Bash(npx @playwright/cli *) Bash(npx playwright cli *)
---

# playwright-cli：ブラウザ操作の道具箱

`/docdd:ui-polish`・`/docdd:verify-e2e`・`/docdd:release`（公開先の確認）から使う。**ここは入口だけ**。詳しい使い方は `references/` に分けてある（必要になったものだけ読む）。全コマンドは `playwright-cli --help`。

`references/` は英語で、上流（Playwright の CLI `@playwright/cli` 0.1.17）に同梱のスキルと同じ内容。上流のスキルそのものは `playwright-cli install --skills` で入れられる。

**最初に（Web の門）**: `CLAUDE.md`「検証コマンド」表の『開発サーバー起動』行が「無い」なら（Web の画面が無いプロジェクト。例: Unity・Godot のゲーム、ネイティブアプリ）、このスキルは使わない。「該当なし」と報告して止まる（画面の確認は変更影響表の「画面・操作（Web 以外）」行）。

## インストール

使う前に、次の順で確かめる。

1. `playwright-cli --version` が通れば、そのまま使う。
2. 通らなければ `npx --no-install playwright --version`（プロジェクトに Playwright が入っているかの確認。何もダウンロードしない）。通れば、以下の `playwright-cli` を `npx playwright cli` に読み替える。
3. どちらも無ければ、入れてよいかを利用者に聞く（勝手に入れない）。承知を得たら `npm install -g @playwright/cli@0.1.17`（このキットで動作を確かめた版）。初回はインストールの確認（許可を求める表示）が出るので、内容を読んで許可してもらう。入れたら `playwright-cli --version` で `0.1.17` と出ることを確かめる。
4. 断られたら、呼び出し元のスキルの手順どおり探索的確認（手作業で目で見る確認）に切り替え、その旨を報告する。

## 接続先

- 開くのはローカルだけ。アドレスは `CLAUDE.md`「検証コマンド」表の『開発サーバー起動』行に従う（行が未記入なら、推測で起動せず理由を報告する）。
- OAuth など外部サービスが `localhost` を許可しない場合は `127.0.0.1` で開く。
- 公開先（本番）を開くのは `/docdd:release` の公開先確認のときだけ。そのときも見るだけ（`open`・`snapshot`・`console`・`requests`・`eval`）にし、入力・送信・ログインなど中身を変える操作をしない。
- 本番へ向けないための決まりは `/docdd:verify-e2e` の「安全な既定」。

## 基本の使い方

```bash
# <ポート> は CLAUDE.md「検証コマンド」表の『開発サーバー起動』行に合わせる（例: 3000）
playwright-cli open http://127.0.0.1:<ポート>/login
playwright-cli snapshot                            # 現在の画面（ref は e15 のような形で返る）
playwright-cli find "ログイン"                      # 大きい画面は snapshot 全体より検索が安い
playwright-cli fill e5 "user@example.com"
playwright-cli click e15
playwright-cli eval "el => el.naturalWidth" e7     # 画像が実際に読めたかは属性で見る
playwright-cli console                             # コンソールエラー
playwright-cli requests                            # 失敗したリクエスト
playwright-cli resize 390 844                      # モバイル幅
mkdir -p /tmp/claude                               # 保存先のフォルダは自動では作られない
playwright-cli screenshot --filename=/tmp/claude/shot.png
playwright-cli close
```

- `--raw` を付けると値だけ返る（`playwright-cli --raw eval "document.title"`）。
- **ログインが要る画面**は `state-save` / `state-load` でログイン状態を使い回す（置き場は下の「保存先」。詳しくは `references/storage-state.md`）。

## 保存先（ログイン状態・trace・スクショ）

| 物 | 置き場 | 書き方 |
|---|---|---|
| ログイン状態（cookie など。秘密値を含む） | `.playwright-cli/` 配下 | `playwright-cli state-save .playwright-cli/auth-state.json`、使うときは `playwright-cli state-load .playwright-cli/auth-state.json`（名前を省くと `.playwright-cli/storage-state-<時刻>.json`） |
| trace（操作の記録） | `.playwright-cli/traces/` | `tracing-start`／`tracing-stop` の既定のまま（場所を変えない） |
| スクショ | `/tmp/claude/` | `--filename=/tmp/claude/<名前>.png`（名前を省くと `.playwright-cli/` に置かれる） |

- `.playwright-cli/` は `.gitignore` 済み（`/docdd:init` が足す）。ログイン状態も trace もコミットしない。コミット前の `git status` に `.playwright-cli/` やログイン状態の JSON が出ていたら stage せず、`.gitignore` に `.playwright-cli/` を足すよう利用者に伝える。
- `references/` の英語の例は、ログイン状態を `auth.json`・`my-auth-state.json` などカレントディレクトリ直下に、trace を `traces/` に置く書き方をしている。**そのまま使わず、上の置き場に読み替える。**
- ログイン状態のファイルの中身を、報告やログに貼らない。

## 落とし穴

- **要素があること ≠ 表示されていること。** 画像は `naturalWidth > 0` まで見る。CSP 違反・署名 URL の失効・デコード失敗は、実物を描画したときにしか出ない。
- **開発サーバーは初回リクエストで画面をコンパイルすることがある**（例: Next.js の `next dev`）。触った直後の1回目は遅いことがある。「遅い＝壊れている」と決める前に、編集を挟まずもう一度開く。
- **稼働中の開発サーバーを止めずに別ポートで確かめたいとき。** 同じディレクトリで開発サーバーを2つ起動できないフレームワークがある（例: Next.js）。`CLAUDE.md`「検証コマンド」表の『ビルド』行を通してから、『本番モード起動』行のコマンドを別ポートで起動する。行が「無い」か未記入なら、この確かめ方は使わず理由を報告する。
- **`open` が `Chromium distribution 'chrome' is not found` で失敗する。** 既定では手元の Google Chrome を使う。Chrome が無ければ `playwright-cli open --browser=chromium <URL>` で Playwright 用のブラウザを使う。Playwright 用のブラウザも入っていなければ、取得（数百 MB のダウンロード）してよいかを利用者に聞き、承知を得てから `playwright-cli install-browser chromium`。

## 詳しい話（必要になったら読む。英語）

| やりたいこと | 参照 |
|---|---|
| Playwright テストの実行・デバッグ | `references/playwright-tests.md` |
| リクエストのモック | `references/request-mocking.md` |
| ブラウザ内でコードを走らせる | `references/running-code.md` |
| セッション管理（複数ブラウザ） | `references/session-management.md` |
| cookie / localStorage | `references/storage-state.md`（保存先は上の「保存先」に読み替える） |
| テスト生成（plan / generate / heal） | `references/test-generation.md` |
| trace | `references/tracing.md`（保存先は上の「保存先」に読み替える） |
| 動画 | `references/video-recording.md` |
| 要素の属性を見る | `references/element-attributes.md` |
