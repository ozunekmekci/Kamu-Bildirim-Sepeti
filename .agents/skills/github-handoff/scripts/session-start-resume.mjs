import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectGitSnapshot,
  findHandoffRoot,
  readHookInput,
  writeHookOutput,
} from './handoff-lib.mjs';

const payload = readHookInput();
const root = findHandoffRoot(payload);

if (!root) {
  writeHookOutput({});
  process.exit(0);
}

try {
  const handoffText = readFileSync(join(root, 'HANDOFF.md'), 'utf8').slice(0, 8000).trimEnd();
  const git = collectGitSnapshot(root);
  const statusPreview = git.dirtyLines.slice(0, 20).join('\n') || '(clean working tree)';

  const message = [
    '[AUTO-RESUME: HANDOFF.md]',
    `Repo Root: ${root}`,
    `Branch: ${git.branch} | HEAD: ${git.head} | Unpushed commits: ${git.unpushedCount}`,
    'Git Status:',
    statusPreview,
    '',
    '--- HANDOFF.md ---',
    handoffText,
  ].join('\n');

  writeHookOutput({
    injectSteps: [
      {
        systemMessage: {
          systemMessage: message,
        },
      },
    ],
  });
} catch {
  writeHookOutput({});
}
