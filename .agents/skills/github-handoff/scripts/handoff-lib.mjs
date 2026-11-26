import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Read full hook stdin payload and parse JSON safely. */
export function readHookInput() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Emit valid JSON object to stdout for Antigravity hooks. */
export function writeHookOutput(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/** Find nearest parent directory containing HANDOFF.md from candidate roots. */
export function findHandoffRoot(payload) {
  const candidates = [];
  if (typeof payload?.cwd === 'string' && payload.cwd) {
    candidates.push(payload.cwd);
  }
  if (Array.isArray(payload?.workspacePaths)) {
    for (const wp of payload.workspacePaths) {
      if (typeof wp === 'string' && wp) candidates.push(wp);
    }
  }
  candidates.push(process.cwd());

  for (const rawStart of candidates) {
    if (!existsSync(rawStart)) continue;
    let current = resolve(rawStart);
    while (true) {
      if (existsSync(join(current, 'HANDOFF.md'))) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

/** Execute read-only git command inside repo root, returning trimmed stdout or ''. */
export function gitRead(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    }).trimEnd();
  } catch {
    return '';
  }
}

/** Collect compact git state snapshot without failing if upstream is unset. */
export function collectGitSnapshot(root) {
  const branch = gitRead(root, ['branch', '--show-current']) || 'detached';
  const head = gitRead(root, ['log', '-1', '--oneline']) || 'none';
  const statusShort = gitRead(root, ['status', '--short']);
  const diffStat = gitRead(root, ['diff', '--stat', 'HEAD']);
  const unpushedRaw = gitRead(root, ['rev-list', '--count', '@{u}..HEAD']);
  const unpushedCount = /^\d+$/.test(unpushedRaw.trim()) ? Number(unpushedRaw.trim()) : 0;
  const dirtyLines = statusShort ? statusShort.split(/\r?\n/).filter(Boolean) : [];
  return { branch, head, statusShort, diffStat, dirtyLines, unpushedCount };
}
