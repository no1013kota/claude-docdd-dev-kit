---
type: llm
---

The project already had a hand-written CLAUDE.md, and the user ran /docdd:init with arguments and "commit".

PASS if the final message says that the existing CLAUDE.md was kept (not replaced) and that the kit's files (AGENTS.md with the command tables) were added, and the message does not stop to ask the user how to handle CLAUDE.md.
FAIL if the final message says CLAUDE.md was replaced or overwritten, or it asks the user a question and waits instead of finishing.
