import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectGitSnapshot,
  findHandoffRoot,
  readHookInput,
  writeHookOutput,
} from './handoff-lib.mjs';

const START_MARKER = '<!-- AUTO-SNAPSHOT:START -->';
const END_MARKER = '<!-- AUTO-SNAPSHOT:END -->';
const ABNORMAL_REASONS = new Set([
  'MAX_TOKEN_BUDGET_EXCEEDED',
  'ERROR',
  'MAX_INVOCATIONS',
  'MAX_FORCED_INVOCATIONS',
  'USER_CANCELED',
  'TERMINAL_STEP_TYPE',
  'TERMINAL_CUSTOM_HOOK',
]);

const payload = readHookInput();
const root = findHandoffRoot(payload);

if (!root) {
  writeHookOutput({});
  process.exit(0);
}

try {
  const git = collectGitSnapshot(root);
  const reason = typeof payload?.terminationReason === 'string' && payload.terminationReason
    ? payload.terminationReason
    : 'UNKNOWN';
  const hasDirtyOrUnpushed = git.dirtyLines.length > 0 || git.unpushedCount > 0;
  const isAbnormal = ABNORMAL_REASONS.has(reason) || Boolean(payload?.error);

  if (reason === 'NO_TOOL_CALL' && !hasDirtyOrUnpushed && !payload?.error) {
    writeHookOutput({});
    process.exit(0);
  }

  if (!isAbnormal && !hasDirtyOrUnpushed) {
    writeHookOutput({});
    process.exit(0);
  }

  const handoffPath = join(root, 'HANDOFF.md');
  const existing = readFileSync(handoffPath, 'utf8');
  const rawInput = typeof payload?.lastUserInput === 'string' ? payload.lastUserInput : '';
  const sanitizedInput = rawInput.replace(/[\r\n]+/g, ' ').replace(/\u2014/g, '-').trim().slice(0, 160) || '(none)';
  const dirtyPreview = git.dirtyLines.slice(0, 25).join('\n') || '(clean working tree)';
  const diffPreview = git.diffStat ? git.diffStat.split(/\r?\n/).slice(0, 12).join('\n') : '(no tracked diff)';
  const errorLine = typeof payload?.error === 'string' && payload.error.trim()
    ? `- **Stop Error:** ${payload.error.replace(/[\r\n]+/g, ' ').trim().slice(0, 180)}`
    : null;

  const block = [
    START_MARKER,
    '## Auto-Snapshot on Stop (Zero-Token Hook)',
    `- **Captured At (UTC):** ${new Date().toISOString()}`,
    `- **Termination Reason:** ${reason}`,
    ...(errorLine ? [errorLine] : []),
    `- **Branch / HEAD:** \`${git.branch}\` @ \`${git.head}\` (unpushed commits: ${git.unpushedCount})`,
    `- **Last User Input:** ${sanitizedInput}`,
    '- **Working Tree Snapshot:**',
    '```text',
    dirtyPreview,
    '```',
    '- **Diff Stat:**',
    '```text',
    diffPreview,
    '```',
    END_MARKER,
  ].join('\n');

  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  let updated;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    updated = `${existing.slice(0, startIdx)}${block}${existing.slice(endIdx + END_MARKER.length)}`;
  } else {
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    updated = `${existing}${sep}${block}\n`;
  }

  if (updated !== existing) {
    writeFileSync(handoffPath, updated, 'utf8');
  }
} catch {
  // Never block Stop hook or fail loudly
}

writeHookOutput({});
