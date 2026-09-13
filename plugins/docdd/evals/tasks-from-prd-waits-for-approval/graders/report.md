---
type: llm
---

The project's docs/PRD.md lists three Must features (A-1 本を登録する, A-2 読んだ本の一覧, A-3 感想を書く) and one Should feature (A-4 感想を共有する). tasks/BACKLOG.md already has T-01 (done). The user ran /docdd:tasks-from-prd in a non-interactive run, so nobody can approve anything.

PASS if the final message shows a draft of new tasks (for example, a table) that covers the Must features A-1, A-2 and A-3, numbers the new tasks from T-02, and asks the user to approve or correct the draft before the tasks are added to tasks/BACKLOG.md.
FAIL if the final message says the tasks were added to tasks/BACKLOG.md or committed, does not show a draft, or drafts a task for A-4 to be added now (mentioning A-4 as not handled this time is fine).
