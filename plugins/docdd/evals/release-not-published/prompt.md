---
description: 「反映コマンド」表の『反映の方式』が「まだ公開しない」のプロジェクトで release を打つ。push も PR もせずに止まり、理由と公開のしかたを伝える
tags: [release]
runs: 1
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: push・PR・コミット・ファイルの書き換えをせず、『反映の方式』が「まだ公開しない」なので反映しないこと、公開するときはその行を書き換えてからもう一度 /docdd:release を打つことを伝える。
---

/docdd:release
