---
description: 自分で書いた CLAUDE.md と運用文書がある Unity のプロジェクトに、引数モードで docdd を導入する。Web 以外として進め、Web 向けの行を足さない
tags: [init, non-web]
runs: 1
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: 既存の CLAUDE.md の文章を残して表を 1 回だけ足し、『開発サーバー起動』『型検査』『lint』を「無い」にし、.gitignore に node_modules/ などの Web 向けの行を足さず、ProjectSettings/ProjectVersion.txt を動かさずにコミットまで進む。git add -A などのまとめた stage を使わない。
---

/docdd:init RTSゲーム "Unity のリアルタイムストラテジーゲーム" commit
