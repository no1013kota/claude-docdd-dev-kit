---
description: 自分で書いた CLAUDE.md があるプロジェクトに、引数モードで docdd を導入する。既存の CLAUDE.md は消さず、AGENTS.md を置いて読み込む 1 行だけ足す
tags: [init]
runs: 1
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: AGENTS.md を新しく置いて表を入れ、既存の CLAUDE.md の文章は残したまま末尾に `@AGENTS.md` の 1 行だけ足し、コミットまで進む。
---

/docdd:init よみログ 読書記録アプリ commit
