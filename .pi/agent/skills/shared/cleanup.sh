#!/usr/bin/env bash
# cleanup.sh — Kill orphaned pi/node processes and clean up worktrees
#
# Usage:
#   bash /path/to/cleanup.sh              # interactive: shows what it'll kill
#   bash /path/to/cleanup.sh --force      # non-interactive: kills immediately
#   bash /path/to/cleanup.sh --status     # just show status, don't kill anything

set -euo pipefail

FORCE=false
STATUS_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --status) STATUS_ONLY=true ;;
  esac
done

echo "=== PI Parallel Cleanup ==="
echo ""

# 1. Find orphaned pi processes (background pi -p processes)
echo "--- Orphaned pi processes ---"
PI_PROCS=$(ps aux | grep -E "[p]i -p|[p]i --print" | grep -v "grep" || true)
if [ -n "$PI_PROCS" ]; then
  echo "$PI_PROCS"
  PI_PIDS=$(echo "$PI_PROCS" | awk '{print $2}')
else
  echo "None found."
  PI_PIDS=""
fi
echo ""

# 2. Find dangling worktrees
echo "--- Dangling worktrees ---"
WORKTREES=$(git worktree list 2>/dev/null | grep -v "$(pwd)" || true)
TEMP_WORKTREES=$(echo "$WORKTREES" | grep "/tmp/worktree-" || true)
if [ -n "$TEMP_WORKTREES" ]; then
  echo "$TEMP_WORKTREES"
else
  echo "None found."
fi
echo ""

# 3. Find stale semaphore locks
echo "--- Stale semaphore locks ---"
SEM_DIR="/tmp/pi-semaphore"
if [ -d "$SEM_DIR" ]; then
  STALE=0
  for category_dir in "$SEM_DIR"/*/; do
    [ -d "$category_dir" ] || continue
    for lock in "$category_dir"/slot-*; do
      [ -d "$lock" ] || continue
      pid=$(cat "$lock/pid" 2>/dev/null || echo "")
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        echo "  Stale lock: $lock (PID $pid is dead)"
        STALE=$((STALE + 1))
      fi
    done
  done
  [ "$STALE" -eq 0 ] && echo "None found."
else
  echo "No semaphore directory."
fi
echo ""

# 4. Check for zombie node processes from pi sub-agents
echo "--- Potentially orphaned node processes ---"
NODE_PROCS=$(ps aux | grep -E "[n]ode.*pi" | grep -v "Visual Studio Code\|Slack\|Claude\|1Password" || true)
if [ -n "$NODE_PROCS" ]; then
  echo "$NODE_PROCS"
else
  echo "None found."
fi
echo ""

if $STATUS_ONLY; then
  echo "Status check only. No changes made."
  exit 0
fi

# Perform cleanup
if [ -n "$PI_PIDS" ] || [ -n "$TEMP_WORKTREES" ]; then
  if ! $FORCE; then
    echo "Kill orphaned processes and clean worktrees? [y/N]"
    read -r REPLY
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 0
    fi
  fi

  # Kill pi processes
  if [ -n "$PI_PIDS" ]; then
    echo "Killing pi processes..."
    echo "$PI_PIDS" | xargs kill 2>/dev/null || true
    sleep 2
    # Force kill if still running
    echo "$PI_PIDS" | xargs kill -9 2>/dev/null || true
    echo "Done."
  fi

  # Remove worktrees
  if [ -n "$TEMP_WORKTREES" ]; then
    echo "Removing worktrees..."
    echo "$TEMP_WORKTREES" | awk '{print $1}' | while read -r wt; do
      git worktree remove "$wt" --force 2>/dev/null || rm -rf "$wt"
      echo "  Removed: $wt"
    done
    echo "Done."
  fi
fi

# Always clean stale semaphores
if [ -d "$SEM_DIR" ]; then
  for category_dir in "$SEM_DIR"/*/; do
    [ -d "$category_dir" ] || continue
    for lock in "$category_dir"/slot-*; do
      [ -d "$lock" ] || continue
      pid=$(cat "$lock/pid" 2>/dev/null || echo "")
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        rm -rf "$lock"
      fi
    done
  done
fi

echo ""
echo "Cleanup complete."
