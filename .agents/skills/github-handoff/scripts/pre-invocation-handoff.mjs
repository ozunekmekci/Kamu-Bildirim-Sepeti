import {
  collectGitSnapshot,
  findHandoffRoot,
  readHookInput,
  writeHookOutput,
} from './handoff-lib.mjs';

const CHECKPOINT_INTERVAL = 12;
const payload = readHookInput();
const invocationNum = Number(payload?.invocationNum ?? 0);

if (!Number.isFinite(invocationNum) || invocationNum <= 0 || invocationNum % CHECKPOINT_INTERVAL !== 0) {
  writeHookOutput({});
  process.exit(0);
}

const root = findHandoffRoot(payload);
if (!root) {
  writeHookOutput({});
  process.exit(0);
}

try {
  const git = collectGitSnapshot(root);
  if (git.dirtyLines.length === 0 && git.unpushedCount === 0) {
    writeHookOutput({});
    process.exit(0);
  }

  writeHookOutput({
    injectSteps: [
      {
        systemMessage: {
          systemMessage: `[AUTO-HANDOFF CHECKPOINT #${invocationNum}] Branch "${git.branch}" has ${git.dirtyLines.length} modified/untracked file(s) and ${git.unpushedCount} unpushed commit(s). At the next clean verification boundary (or immediately if quota is low), run github-handoff: update HANDOFF.md + docs/PROGRESS.md, verify tests/lint, commit, and push to GitHub.`,
        },
      },
    ],
    terminationBehavior: '',
  });
} catch {
  writeHookOutput({});
}
