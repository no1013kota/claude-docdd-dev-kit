---
type: llm
---

Every todo task in tasks/BACKLOG.md depends on an undecided decision (D-1 or D-2).

PASS if the final message says that no task can be started because the tasks depend on undecided decisions, lists both D-1 and D-2 (with their options or a short summary of each), and asks the user to decide them (for example by answering A or B for each).
FAIL if the final message says it started or finished a task, marks a task as doing, chooses an option for D-1 or D-2 by itself, or does not mention the undecided decisions.
