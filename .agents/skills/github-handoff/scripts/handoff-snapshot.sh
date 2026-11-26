#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

echo "=== GIT HANDOFF SNAPSHOT ==="
echo "Root:   $ROOT"
echo "Branch: $(git branch --show-current 2>/dev/null || echo detached)"
echo "HEAD:   $(git log -1 --oneline 2>/dev/null || echo none)"
echo ""
echo "=== REMOTES ==="
git remote -v || true
echo ""
echo "=== WORKING TREE (git status --short) ==="
git status --short || true
echo ""
echo "=== RECENT COMMITS ==="
git log -n 5 --oneline || true
echo ""
echo "=== HANDOFF FILES ==="
for f in HANDOFF.md AGENTS.md CLAUDE.md docs/PROGRESS.md docs/ROADMAP.md .agents/skills/github-handoff/SKILL.md; do
  if [ -f "$f" ]; then
    lines="$(wc -l < "$f")"
    echo "[present] $f (${lines} lines)"
  else
    echo "[missing] $f"
  fi
done
