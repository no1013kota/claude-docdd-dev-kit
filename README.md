# docdd — 非エンジニアのための Claude Code / Codex 開発キット

プラグイン マーケットプレイスです。プラグイン `docdd` を入れると、1 人の非エンジニアが Web アプリやゲームなどを作り続けるための「約束（AGENTS.md）・仕様書（docs）・作業キュー（BACKLOG）・手順書（スキル）」がそろいます。
要望をタスクにし、実装・検証・仕様書の更新・コミット・本番反映までを、毎回同じ手順で進めさせます。
**Claude Code（ターミナル・Desktop・IDE）と Codex CLI の、どちらでも同じように使えます**（同じプロジェクトで併用もできます）。

## 使える条件

- **Claude Code の有料プラン**（Pro・Max・Team・Enterprise）か、**Codex CLI** で利用できます。
- ターミナル・VS Code などで使えます。Codex での入れ方と違いは「[Codex で使う](plugins/docdd/README.md#codex-で使う)」。
- **git と Node.js 18 以上**をインストールしたmacOS・Linux で使えます。Windows では Git for Windows を入れてください。
- **作るものの技術は問いません**（仕様書・タスク・コミットの流れはどれでも同じです）。ただしブラウザ画面でのE2Eテストのスキルなどは Web アプリ向けで、Unity などのゲームやネイティブアプリでは機能しません。
- **本番へ出す時に使う `/docdd:release`** には、git の push 先が必要です。

## 全体像

図の `/docdd:…` は、あなたが打つスキル（プラグインが持つ手順書）です。円柱の箱はファイル・フォルダです。

```mermaid
flowchart TD
  I["/docdd:init<br/>最初の 1 回。雛形を置き、表を埋める"] --> C[("AGENTS.md の表<br/>検証コマンド・反映コマンド<br/>スキルは検証・反映にここのコマンドを使う")]
  I --> S
  Y["docs を自分で書き換えたとき<br/>（PRD に機能を足した など）"] --> S
  S[("docs/ 仕様の正本<br/>PRD＝何を作るか／requirements＝どう作るか")] --> A["/docdd:add-task<br/>タスクを作る<br/>やりたいことを書けば 1 件<br/>何も書かなければ<br/>仕様書からまとめて"]
  A -->|タスクと要決定を書く| B[("tasks/BACKLOG.md<br/>いま動いているものだけ<br/>todo のタスク／あなたへの要決定 D-番号")]
  B -->|上から 1 件だけ取る| D["/docdd:dev-loop<br/>仕様を読む → 実装 → 検証<br/>→ 仕様書を更新（中で doc-sync）→ コミット"]
  S -.->|タスクの仕様を読む| D
  D -.->|書き足す・直す| S
  D -->|決めてほしいことが出た| Q["あなたが D-番号に答える"]
  Q --> B
  D -->|done にして次の 1 件へ| B
  D -->|終わったタスク・決まった判断を移す| AR[("tasks/archive/BACKLOG-done.md")]
  B ~~~ X
  X["スキルを通さず<br/>自分でコードを直したとき"] --> DS["/docdd:doc-sync<br/>実装に合わせて仕様書を直す"]
  DS -.->|書き直す| S
  D -->|依頼が全部終わった| F["仕上げ（必要なときだけ）<br/>/docdd:refactor・/docdd:speed-up・/docdd:security-audit"]
  DS -->|直し終わった| F
  F --> R["/docdd:release<br/>本番へ出す前に必ず「はい」を聞く"]
  R --> L["公開<br/>自動公開／確認してから公開／コマンドで公開"]
```

| ファイル・フォルダ | 何が入るか | 誰が書くか |
|---|---|---|
| `AGENTS.md` | このプロジェクトの約束（検証コマンド・反映コマンドの表と、スキルへの追加指示）と、どのプロジェクトにも共通の約束（仕様書と実装をそろえる・変更に合わせて回す検証など）。Claude Code も Codex も毎回読む | 上半分は init が置いて表を埋め、あなたが直す。共通の約束は印で囲んであり、`/docdd:update-kit` が新しい版にする |
| `CLAUDE.md` | Claude Code 用に、`AGENTS.md` を読み込むだけの 1 行 | init が置く。あなたは直さない |
| `docs/`（まず `docs/PRD.md`） | 何を作るか・どう作るかの正本（正しい 1 か所）。自分で書いた仕様書も置ける。技術判断の記録（ADR）と、控えと戻し方などの運用文書もここ | あなたと Claude |
| `tasks/BACKLOG.md` | **作業キュー**。いま動いているタスクと「要決定」（あなたに決めてほしいこと）だけを置く。dev-loop はここから 1 件ずつ取る | スキルが書き、あなたが要決定に答える |
| `tasks/archive/BACKLOG-done.md` | 終わったタスクと決まった判断 | スキルが移す |

- 図に無いスキル（検証・点検など）も含めた一覧は、次の「[使えるコマンド](#使えるコマンド)」にあります。
- `/docdd:release` は、あなたが自分で打ったときだけ動きます。データの控えと、前の版へ戻す手順は「[控えと戻し方](plugins/docdd/README.md#控えと戻し方)」にあります。
- 取り消しにくい git 操作と、秘密の値（API キーなど）が入ったコミットは、hook（自動の見張り）が止めます。

## 使えるコマンド

Claude Code の入力欄で `/docdd:`（Codex は `$docdd:`）と打つと、この一覧が出ます。「自分で打つ」と書いたものは、Claude が会話の流れで勝手に動かすことはありません。

| コマンド | 使うとき |
|---|---|
| `/docdd:init` | 最初の 1 回。雛形を置き、検証コマンドの表を埋める（自分で打つ） |
| `/docdd:add-task <やりたいこと>` | 作りたいこと・直したいことを、1 件のタスクにする |
| `/docdd:add-task`（何も書かない） | 書き換えた仕様書や、まだタスクになっていない所を、まとめてタスクにする |
| `/docdd:dev-loop` | タスクを 1 件、実装・検証・仕様書の更新・コミットまで進める |
| `/docdd:doc-sync` | スキルを通さず自分でコードを直したあと、仕様書を実装に合わせる |
| `/docdd:ui-polish` | 画面や UI 部品を作る・直す（Web のみ） |
| `/docdd:verify-integration` | DB・権限・サーバー側の処理を変えたあとに確かめる |
| `/docdd:verify-e2e` | 利用者の操作の流れを変えたあとに、最後まで通して確かめる |
| `/docdd:refactor` | 動きを変えずに、コードの中身を整える |
| `/docdd:speed-up` | 画面の表示が遅いときに速くする（Web のみ） |
| `/docdd:security-audit` | 公開前や、ログイン・課金・外部連携を触ったあとに、穴を探す |
| `/docdd:release` | 本番へ出す（自分で打つ。出す前に必ずあなたの「はい」を聞く） |
| `/docdd:maintenance` | 週 1 回の点検（`/docdd:maintenance monthly` で月次も） |
| `/docdd:update-kit` | プラグインを更新したあと、置いた雛形を新しい版にする（自分で打つ） |

場面ごとの使い分けは「[毎日の使い方](plugins/docdd/README.md#毎日の使い方)」にあります。

## 入れ方

**用意するもの**: Claude Code（有料プラン）か Codex CLI・git・Node.js 18 以上。入れるのに GitHub のアカウントは要りません。

### 1. アプリのフォルダを用意する（すでにアプリがあれば飛ばす）

1. 空のフォルダを作り、そこで Claude Code を開く（ターミナルなら `mkdir my-app && cd my-app && claude`）
2. Claude Code に頼む: 「Next.js で新しいアプリの土台を作って、`npm run dev` で画面が出るところまで」
   - Next.js 以外でもよい（例: 「Vite と React で」「Python の FastAPI で」）。Unity などのゲームは、Unity Hub で新しいプロジェクトを作る
3. ブラウザで画面が出たら完了

土台を作る道具（create-next-app など）は空のフォルダで使うので、docdd より先に作ります。

### 2. docdd を入れる

アプリのフォルダで Claude Code を開き、次を順に打ちます。

1. `/plugin marketplace add no1013kota/claude-docdd-dev-kit`
2. `/plugin install docdd@claude-docdd-dev-kit`（範囲を聞かれたら User）
3. `/docdd:init`（プロジェクト名や作りたいものを聞かれるので、答えていく）

1・2 は一度だけで、ほかのプロジェクトでも使えます。新しいプロジェクトでは 3 だけを打ちます。

Codex で使うときは、ターミナルで `codex plugin marketplace add no1013kota/claude-docdd-dev-kit` → `codex plugin add docdd@claude-docdd-dev-kit` と打ち、プロジェクトのフォルダで `$docdd:init` と打ちます（詳しくは「[Codex で使う](plugins/docdd/README.md#codex-で使う)」）。

### 3. docdd を更新する（新しい版が出たとき）

**おすすめ: 自動更新をオンにする（一度だけ）**

docdd の自動更新は、最初はオフです。次の手順で一度オンにすると、あとは Claude Code を起動したときに、裏で新しい版を取ってきます。

1. `/plugin` と打つ
2. **Marketplaces** を選び、**claude-docdd-dev-kit** を選ぶ
3. **Enable auto-update** を選ぶ

新しい版が入ると、`/reload-plugins` を打つよう知らせが出ます（打たなくても、次に起動したときから新しい版で動きます）。

**手で更新するとき**（自動更新をオフのままにする場合）

1. `/plugin marketplace update claude-docdd-dev-kit`（配布元の一覧を取り直す）
2. `/plugin` と打ち、画面で docdd を選んで更新する（ターミナルなら、Claude Code を終了してから `claude plugin update docdd@claude-docdd-dev-kit` と打ち、開き直す）
3. `/reload-plugins` と打つ（開いているセッションは、起動時に読み込んだ版を使い続けるため。打てないときは Claude Code を開き直す）

**Codex で使っているとき**は、ターミナルで `codex plugin marketplace upgrade claude-docdd-dev-kit` と打ちます（配布元を取り直し、プラグインのファイルも新しくします）。

**どちらの場合も、最後に** 各プロジェクトのフォルダで `/docdd:update-kit`（Codex は `$docdd:update-kit`）と打ちます。プロジェクトに置いた雛形を、新しい版にそろえます（あなたのファイルを書き換えるので、自動では動かず、承知を得てから書き換えます）。更新したあとにプロジェクトを開くと、打つよう 1 行で知らせます。

何が変わったかは [CHANGELOG](plugins/docdd/CHANGELOG.md) にあります。

## 詳しい説明書

**使い方の詳細は [plugins/docdd/README.md](plugins/docdd/README.md) にあります。** Windows・Desktop アプリ・VS Code で入れるときは「[前提](plugins/docdd/README.md#前提)」、init が終わったら「[init のあとにやること](plugins/docdd/README.md#init-のあとにやること)」、英語の確認が出て迷ったら「[英語で出る確認と答え方](plugins/docdd/README.md#英語で出る確認と答え方)」を読みます。

変更履歴は [plugins/docdd/CHANGELOG.md](plugins/docdd/CHANGELOG.md)。

## 困ったら

[Issues](https://github.com/no1013kota/claude-docdd-dev-kit/issues/new/choose) へ。不具合・質問（分かりにくい所）・要望の中から選べます（日本語で書けます。無料の GitHub アカウントが要ります）。書いてほしいことは、選んだ画面に出ます。API キーや `.env` の中身は貼らないでください。

## ライセンス

Apache-2.0（[LICENSE](LICENSE)）。
playwright-cli スキルの一部は [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli)（Apache-2.0、Copyright (c) Microsoft Corporation）に由来します。詳しくは [NOTICE](NOTICE)。
