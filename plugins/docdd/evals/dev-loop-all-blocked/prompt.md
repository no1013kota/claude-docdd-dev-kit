---
description: todo のタスクが全部「未決の要決定」に依存しているとき、dev-loop が実装を始めずに止まり、決めてほしいことを列挙する
tags: [dev-loop]
runs: 1
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: どのタスクにも着手せず（BACKLOG もコードも変えず、コミットもせず）、D-1 と D-2 を案つきで挙げて決定を求める。
---

/docdd:dev-loop
