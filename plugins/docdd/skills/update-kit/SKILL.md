---
name: update-kit
description: プラグインを新しい版に更新したあと、プロジェクトに置いた雛形（検査スクリプト・AGENTS.md の表と約束・docs の節）を新しい版へ追随させる。手付かずのキットのファイルは承知を得て置き換え、手を入れたファイルは差分を見せて1件ずつ聞く。v0.13 以前（CLAUDE.md 中心）で導入したプロジェクトの AGENTS.md への移行にも使う。
argument-hint: "[--dry-run]"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs update*) Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" update*) Bash(git add *) Bash(git commit *) Bash(node scripts/check-doc-dates.mjs) Bash(node scripts/check-doc-refs.mjs) Bash(node scripts/check-doc-placeholders.mjs)
---

# update-kit：置いた雛形を新しい版へ追随させる

プラグインを更新すると、手順書（スキル）は新しくなる。しかし `/docdd:init` がプロジェクトへ置いたファイル（検査スクリプト・キット共通の約束・`AGENTS.md` の表など）は古いまま残る。
このスキルは、その差を `init.mjs update` で調べて分類し、**運営者の承知を得たものだけ**を新しい版にする。

- 判定と書き換えは `init.mjs` が行う。Claude は手でファイルを書き換えない。
- 承知の無いファイルは変えない。利用者のファイル（`AGENTS.md`・`docs/`・`tasks/`）は、**新しい版で増えた節・行を足し、雛形のまま残った行（名前の変わったスキルを指す行など）を新しい形に置き換えるだけ**で、書いてある内容は消さない（v0.1 系からの移行で、移った節を消すときだけ例外。差分を見せて承知を得る）。
- 引数に `--dry-run` があれば、分類と差分を見せるだけで、何も書き換えない。

## 手順

### 0. 調べる

`${CLAUDE_PLUGIN_ROOT}` はこのプラグインのフォルダを指す（Claude Code が渡す）。**Codex では空になる**ので、この `SKILL.md` があるフォルダの 2 つ上（`…/skills/<スキル名>/SKILL.md` の `…` の部分）の実際のパスに置き換えて実行する。

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" update --json` を実行する。
2. `state` で分ける。
   - `not-installed` → 止まる。「docdd の雛形が見つかりません。先に `/docdd:init` で導入してください」と伝える。
   - `installed-above` → 止まる。上のフォルダ（`projectRoot`）に導入済みなので、そのフォルダで Claude Code を開き直してからもう一度打つよう伝える。
   - `legacy` → v0.1 系の構成。手順 1 の中で「v0.1 系からの移行」も扱う。
   - `installed`／`partial` → そのまま進む。
3. `summary` の件数が全部 0 なら、「新しい版（v<kitVersion>）で変わったところはありません」と伝えて終わる。

### 1. 分類ごとに、承知を得る

`files` の各要素の `action` で分ける。まとめて聞けるものは 1 回で聞く（AskUserQuestion）。

| action | 意味 | 聞き方 |
|---|---|---|
| `replace` | キットのファイルで、置いたときから手が入っていない（`status: untouched`） | 一覧（パスと `matchedVersion`）を示し、「まとめて新しい版に置き換えてよいか」を 1 回だけ聞く |
| `add` | 新しい版で増えたファイル、または見当たらないファイル | 一覧を示し、「置いてよいか」をまとめて聞く |
| `review` | キットのファイルだが、手が入っている（`status: modified`） | `diff` を見せ、「新しい版で置き換える（入れた変更は消える）／いまのまま」を**1 件ずつ**聞く。いまのままを選んだファイルは、次回も同じ質問が出ると伝える |
| `append` | 利用者のファイルに、新しい版で増えた節・行・`.gitignore` の行・`package.json` の script がある。または、名前が変わったスキルや、ほかのスキルにまとめて無くなったスキルを指す行が雛形のまま残っている（`kind: rename`。`from` を `to` に置き換える）。`AGENTS.md` の「キット共通の約束」が古い版なら `kind: rules`（印の間だけ新しい版に入れ替える）。`CLAUDE.md` に `@AGENTS.md` の行が無ければ `kind: claude-pointer`（末尾に 1 行足すだけ。元の中身は消さない） | `additions` の中身（見出しと本文、行、または置き換える前と後）を見せ、「足してよいか（置き換えてよいか）」をファイルごとに聞く |
| `migrate-to-agents` | v0.13 以前の `CLAUDE.md`（v0.1 系も含む） | 下の「AGENTS.md への移行」 |
| `none` | することが無い | 聞かない |

`.claude/settings.json` と `.mcp.json` は変えない（上書きもマージもしない）。`settings` の `missingDeny`・`missingAsk`・`missingAllow` に項目があれば、報告に差分として載せ、「足したいときは Claude に『.claude/settings.json の deny に … を足して』と頼む」と伝える。`settings.currentDefaultMode` が null でなければ、その値（始まりのモード）も載せる。いまの雛形は始まりのモードを決めない（Pro・Max・Team の既定の auto モードを上書きしない）。消すかどうかは運営者が決め、消したいときは Claude に『.claude/settings.json の permissions から defaultMode を消して』と頼む、と伝える。

#### AGENTS.md への移行（`AGENTS.md` の `action: migrate-to-agents`）

v0.13 以前は、このプロジェクトのことを `CLAUDE.md` に、キット共通の約束を `.claude/rules/docdd-kit.md` に書いていた。v0.14.0 からは両方を `AGENTS.md` にまとめる（Claude Code も Codex も同じファイルを毎回読む）。`CLAUDE.md` は `AGENTS.md` を読み込む 1 行になり、`.claude/rules/docdd-kit.md` は消える。**この 3 つは `AGENTS.md` を適用すると一度に入れ替わる**（`CLAUDE.md` を別に指定しない）。

1. `AGENTS.md`（`action: migrate-to-agents`）の `diff` を見せる。移行では次のことが起きる、と説明する。
   - `CLAUDE.md` の中身がそのまま `AGENTS.md` へ移り、末尾にキット共通の約束が `<!-- docdd:rules:begin -->` と `<!-- docdd:rules:end -->` で囲んで入る（約束に手を入れていなければ新しい版、手を入れていればそのまま運ぶ）
   - `docs/` と `tasks/` の文書にある `.claude/rules/docdd-kit.md` への参照は `AGENTS.md` に言い換える（書き換えたファイルは `applied[].alsoWrote` と `toStage` に出る）
   - v0.1 系のときは、さらに `CLAUDE.md` から `AGENTS.md` などへ移った節を消す（`legacy.removals` の見出しと移り先）
   - 「検証コマンド」「反映コマンド」の表を新しい形にし、`<!-- docdd:tables:begin -->` と `<!-- docdd:tables:end -->` で囲む。記入済みの値はそのまま移る。新しい行（開発サーバー起動・テスト用 DB など）は `{{…}}`（未記入）で足される
   - 「スキルへの追加指示」の節を足す
   - v0.1 の雛形のまま未記入（`<…>`）で残っている行（PRD の機能一覧など）は、雛形と完全に同じ行だけ `{{…}}` の形にする（`AGENTS.md` は移行の中で、ほかの文書は `additions` の `kind: placeholder`）。`{{…}}` は未記入欄の検査が拾う
2. `legacy.removals` に `customized: true` の節があれば、その `text` を見せる。運営者が手を入れた節なので、「消す（新しい約束に任せる）／残す」を聞く。残すなら、手順 2 で `--keep-customized` を付ける。消す場合、このプロジェクトだけの指示は「スキルへの追加指示」表へ移すよう提案する。
3. ほかの `replace`・`add`（検査スクリプトや、新しい版で増えたファイル）も、移行と同じ承知にまとめて聞いてよい。

### 2. 適用する

`--dry-run` なら、ここで止めて手順 4 の報告だけする。

1. 承知を得たパスを、カンマ区切りで渡す。

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" update --json --apply <パス>,<パス>[,…] [--keep-customized]
   ```

2. `errors` があれば文面をそのまま報告する。`applied` が適用できたもの。`.docdd/manifest.json` も書き直される（どのファイルを新しい版にしたかの記録。更新のお知らせを止める `"notifyUpdates": false` は残る）。

### 3. 検査して、コミットする

1. 結果の `toStage` を**パスを明示して** `git add` する（`git add -A` は使わない）。
2. `node scripts/check-doc-dates.mjs && node scripts/check-doc-refs.mjs` を実行する（`AGENTS.md`「検証コマンド」表の『docs の検査』行）。落ちたら文面をそのまま報告する。キットが置いていない既存の文書の記述が原因なら、勝手に直さない（運営者の承知を得て直すか、報告に `ファイル:行 → 参照先` を載せる）。
   - 移行で足した表の行は `{{…}}` のままになる。`node scripts/check-doc-placeholders.mjs` の一覧を報告に載せ、`/docdd:init` をもう一度打つと推定と聞き直しで埋められる、と伝える。
3. 運営者の承知があれば `git commit -m "chore: docdd キットを v<kitVersion> に更新"` でコミットする。承知が無ければ stage までで止める。

### 4. 報告する

- 置き換えた／足した／移行したファイル（`applied`）
- いまのままにしたファイル（`review` で「いまのまま」を選んだもの）と、次回も聞かれること
- `.claude/settings.json`・`.mcp.json` の差分（あれば）
- 未記入の欄（`ファイル:行  {{トークン}}`）
- v0.1 の未記入のまま残っている箇所（結果の `legacyPlaceholders`。`ファイル:行  <…>` の形）。雛形と行が違うので `{{…}}` にできず、未記入欄の検査にも出ない。「中身を書くか、要らない行なら消してください」と添える
- `/context` と打つと、Memory files に `AGENTS.md` が出ることで、新しい約束が読み込まれているかを確かめられる

## やらないこと

- 承知の無いファイルの書き換え
- `.claude/settings.json`・`.mcp.json` の書き換え
- 利用者が書いた内容の削除（移行で移った節を、承知を得て消す場合だけ例外）
