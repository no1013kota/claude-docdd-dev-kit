---
description: 自分で書いた CLAUDE.md があるプロジェクトに、引数モードで docdd を導入する。既存の CLAUDE.md は消さず、表だけを末尾に足す
tags: [init]
runs: 1
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: 既存の CLAUDE.md の文章を残したまま、キットの表（マーカーで囲んだ部分）を 1 回だけ末尾に足し、コミットまで進む。
---

/docdd:init よみログ 読書記録アプリ commit
