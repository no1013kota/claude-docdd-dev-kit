---
type: llm
---

The user ran /docdd:init with arguments and "commit", which means the skill must finish without asking questions.

PASS if the final message does all of the following: (1) says the kit was installed and a commit was made; (2) points out that some fields are still unfilled (placeholders in double curly braces) and names at least one file that has them, such as docs/PRD.md or CLAUDE.md; (3) suggests at least one next command that starts with /docdd: (for example /docdd:tasks-from-prd, /docdd:add-task or /docdd:dev-loop).
FAIL if the final message asks the user questions and waits, says that nothing was committed, or does not mention the unfilled fields.
