@AGENTS.md
@HANDOFF.md

When opening a new session or switching agents/accounts in this repository:
1. Read `HANDOFF.md` above (including any `AUTO-SNAPSHOT` block if the previous session stopped unexpectedly).
2. Read `.agents/skills/github-handoff/SKILL.md` and `docs/PROGRESS.md`.
3. Verify `git status --short && git log -n 3 --oneline` and run `npm test && npm run lint`, then resume immediately from `HANDOFF.md` Next Atomic Step #1.
4. At phase completion, clean checkpoints, or low-quota warnings (`<= 20%`), run `github-handoff`: update `HANDOFF.md` + `docs/PROGRESS.md`, verify checks, commit, and push to `origin/main`.
