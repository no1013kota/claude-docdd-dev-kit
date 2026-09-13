---
description: 土台のある Node.js プロジェクトに、引数モード（質問なし・コミットまで）で docdd を導入する
tags: [init]
runs: 1
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: 質問せずに雛形を置き、検査を通してコミットし、未記入の欄と次の一手を報告する。git add -A などのまとめた stage を使わない。
---

/docdd:init よみログ 読書記録アプリ commit
