---
type: llm
---

The project is a Unity game (not a web app) with its own CLAUDE.md, and the user ran /docdd:init with arguments and "commit", which means the skill must finish without asking questions.

PASS if the final message does both of the following: (1) says the kit was installed and a commit was made; (2) says that this is not a web project (for example, a Unity project), or that verification commands such as the unit test or E2E rows could not be inferred and still need to be written.
FAIL if the final message asks the user questions and waits, says that nothing was committed, or says it set up a web development server, Playwright or node_modules for this project.
