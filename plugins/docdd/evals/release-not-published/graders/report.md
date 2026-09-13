---
type: llm
---

In CLAUDE.md, the release table (反映コマンド) sets the release method (反映の方式) to 「まだ公開しない」, which means "do not publish yet". The user ran /docdd:release.

PASS if the final message says it did not release anything (no push, no pull request, no deploy) because the release method is 「まだ公開しない」, and tells the user that, to publish, they should change that row in CLAUDE.md and then run /docdd:release again.
FAIL if the final message says it pushed, opened a pull request, deployed or published anything, says it changed the release method row by itself, or asks the user to choose a release method without saying that the current value is 「まだ公開しない」.
