---
name: github-handoff
description: Use when wrapping up a coding session, hitting context or quota limits, switching AI agents or machines, finishing a verified milestone, or resuming a repository where another agent left off via GitHub.
---

# GitHub Handoff

Single source of truth for cross-session and cross-agent continuity on GitHub: maintain a concise root `HANDOFF.md` synced with git history so any agent (Antigravity, Claude Code, Codex, Cursor, Gemini CLI) resumes from disk truth in 30 seconds.

## Mode 1: Handoff (Wrap Up & Push)

1. **Gather Disk & Git Truth (never rely on chat memory):**
   Run the helper script or inspect directly:
   ```bash
   bash scripts/handoff-snapshot.sh
   ```
   (Fallback if run from repo root: `bash .agents/skills/github-handoff/scripts/handoff-snapshot.sh`.)

2. **Verify Current State Honestly:**
   Run the repository verification commands declared in `AGENTS.md` / `package.json`.
   - Record ONLY commands you ran after your last edit and observed exit 0.
   - If work is mid-flight or failing, mark `Status: WIP` or `Status: BLOCKED` and paste the exact failing command and error. Never claim untested work passes.

3. **Update Root `HANDOFF.md` (strictly <= 120 lines):**
   Keep `HANDOFF.md` terse, actionable, and overwritten in place (git log preserves older snapshots). Use this exact schema:
   ```markdown
   # Project Handoff

   - **Updated:** YYYY-MM-DD HH:MM TZ
   - **Status:** READY | WIP | BLOCKED
   - **Branch / HEAD:** <branch> @ <short-sha>
   - **Verified Commands:** `<cmd>` (pass count, duration), ...

   ## Current Goal
   1-2 sentences stating the active product goal and current milestone.

   ## Completed Since Last Handoff
   - Bullet list of concrete shipped modules, routes, migrations, or fixes with file paths.

   ## Decisions & Constraints (Do Not Re-litigate)
   - Fixed product rules, naming constraints, architecture seams, and environment gotchas.

   ## Known Risks / Open Blockers
   - Exact blockers or external manual steps remaining (or `None`).

   ## Next Atomic Steps
   1. Exact first action with file paths or commands.
   2. Exact second action.

   ## Copy-Paste Resume Prompt
   > Read `HANDOFF.md`, `AGENTS.md`, and `docs/PROGRESS.md`. Confirm `git status --short && git log -n 3 --oneline`, run baseline verification (`npm test && npm run lint` or repo equivalent), adopt all Decisions & Constraints without re-litigating, and execute Next Atomic Step #1.
   ```

4. **Sync Project Progress Ledger:**
   If the repository maintains `docs/PROGRESS.md` or `docs/ROADMAP.md`, update the active milestone checklists before committing.

5. **Commit & Push Safely:**
   - Check `git status --short` and `git diff --cached --name-only` to ensure zero `.env*`, private keys, tokens, or scratch/build outputs are staged.
   - Stage changes and write a structured commit (`chore(handoff): ...` or `feat(scope): ...`) containing `Completed / Verified / Next`.
   - Push with `git push origin <current-branch>` (never `--force`).

6. **Deliver Opener to User:**
   In your final message, provide the ready-to-paste `Copy-Paste Resume Prompt` and exact pushed commit SHA.

## Mode 2: Resume (Fresh Agent Pickup)

1. **Read Ground Truth First:** Read `HANDOFF.md` at the repository root, then `AGENTS.md` / `CLAUDE.md` and `docs/PROGRESS.md` (if present).
2. **Verify Disk Matches Notes:** Run `git status --short && git log -n 5 --oneline` and baseline tests (`npm test && npm run lint` or project check) before editing.
3. **Honor Settled Decisions:** Adopt `Decisions & Constraints` as binding unless the user explicitly overrides them.
4. **Act on Step #1 Immediately:** Start executing `Next Atomic Steps` #1 without asking redundant orientation questions.

## Red Flags (Never Do These)

- Summarizing state from memory without reading git status and test results.
- Marking failing or unrun checks as passing.
- Allowing `HANDOFF.md` to exceed 120 lines (compact old history into git / `docs/PROGRESS.md`).
- Staging secrets, `.env` files, or unignored scratch artifacts.
- Force-pushing shared branches.
