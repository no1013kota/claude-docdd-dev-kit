---
description: 記入済みの PRD がある導入済みプロジェクトで tasks-from-docs を打つ。非対話では承認が得られないので、BACKLOG に書かず、下書きを見せて承認を求める
tags: [tasks-from-docs]
runs: 1
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: PRD の Must の機能（A-1〜A-3）から、T-02 から始まるタスクの下書きを見せて承認を求める。承認が無いので tasks/BACKLOG.md は変えず、コミットもしない。
---

/docdd:tasks-from-docs
