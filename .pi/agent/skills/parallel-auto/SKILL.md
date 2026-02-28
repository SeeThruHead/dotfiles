---
name: parallel-auto
description: Run multiple tickets in parallel using git worktrees. Composes on top of autonomous-dev — each parallel worker runs the same plan/implement/review flow in its own worktree. Use when multiple independent tickets are ready and you want to speed up throughput.
---

# Parallel Autonomous Workflow

A meta-orchestrator that runs multiple tickets simultaneously, each in its own git worktree. Composes on top of the `autonomous-dev` skill — child orchestrators run the same plan → implement → review → commit flow, they just don't know they're in a worktree.

## Prerequisites

- Everything from `autonomous-dev` (tk, pi, bun)
- Git worktree support (standard git)
- Shared utilities: `~/.pi/agent/skills/shared/cpu-semaphore.sh`, `~/.pi/agent/skills/shared/cleanup.sh`

## When to Use

- Multiple tickets are ready (`tk ready` shows 2+)
- Tickets are likely independent (touching different files)
- You want to reduce wall-clock time

When only 1 ticket is ready, fall back to normal `autonomous-dev` flow.

## Design Principles

1. **Children don't know they're parallel.** Each child orchestrator sees a normal git repo and runs the standard autonomous-dev flow.
2. **Meta-orchestrator owns all ticket management.** Only the meta-orchestrator calls `tk start`, `tk close`, etc. Children just implement and commit.
3. **Merge conflicts are expected.** The meta-orchestrator handles them after children complete.
4. **Conservative parallelism.** Default to 2 parallel workers. Never exceed 2 — more causes CPU saturation from concurrent tsc/vitest runs.
5. **Resource-gated CPU operations.** All CPU-intensive operations (tsc, vitest) use the semaphore to prevent concurrent execution.
6. **Timeouts everywhere.** Every sub-agent has a timeout to prevent runaway processes.
7. **Cleanup on exit.** Always clean up worktrees and processes, even on failure.
8. **Staggered startup.** Pi uses a global lock file (`~/.pi/agent/settings.json`) during startup. Concurrent `pi` launches will crash with "Lock file is already being held". **Always sleep 5 seconds between spawning pi processes.**

## Resource Management

### CPU Semaphore

The semaphore at `~/.pi/agent/skills/shared/cpu-semaphore.sh` prevents concurrent CPU-intensive operations. Children use `sem_run` to gate tsc and vitest — only 1 typecheck and 1 test run at a time across ALL parallel workers.

Children's implementation prompts must include semaphore-wrapped commands:

```bash
# Instead of:
cd packages/ui && bunx tsc --noEmit
cd packages/ui && bunx vitest run

# Children must use:
source ~/.pi/agent/skills/shared/cpu-semaphore.sh
cd packages/ui && sem_run typecheck 1 -- bunx tsc --noEmit
cd packages/ui && sem_run test 1 -- bunx vitest run
```

**Why only 1 slot?** TypeScript compilation alone can saturate 4-8 cores. Two concurrent tsc runs on a 12-core machine leaves nothing for the OS, editors, browsers, etc. One at a time is the safe default.

### Process Timeouts

Every `pi -p` invocation gets a timeout using the portable `pitimeout` wrapper (macOS has no `timeout` command):

```bash
source ~/.pi/agent/skills/shared/pitimeout.sh
pitimeout 600 pi -p "..." --no-session 2>/dev/null > /tmp/parallel-{id}.log 2>&1 &
```

600 seconds (10 minutes) per child worker. This prevents runaway agents from consuming resources indefinitely.

### Staggered Startup (CRITICAL)

Pi acquires a synchronous lock on `~/.pi/agent/settings.json` during startup. If two `pi` processes start simultaneously, one crashes with "Lock file is already being held" and fails entirely (no models loaded, no work done).

**Always sleep 5 seconds between spawning pi processes:**

```bash
pi -p "..." --no-session 2>/dev/null > /tmp/parallel-{id_1}.log 2>&1 &
PID_1=$!
sleep 5  # CRITICAL: wait for settings lock to release

pi -p "..." --no-session 2>/dev/null > /tmp/parallel-{id_2}.log 2>&1 &
PID_2=$!
```

This also applies to autonomous-dev sub-agents — the orchestrator must not spawn a new sub-agent while a previous one is still starting up.

### Max Parallelism: 2

Hard limit of 2 parallel workers. Rationale:
- Each pi process + node runtime ≈ 200-400MB RAM
- tsc compilation is CPU-intensive even serially
- 2 workers with semaphore-gated CPU ops = good throughput without CPU saturation
- 3+ workers showed empirically to peg the CPU and freeze the system

### Pre-Flight Check

Before starting parallel work, verify the system isn't already overloaded:

```bash
# Check for existing parallel workers
existing=$(ps aux | grep -c "[p]i -p" || true)
if [ "$existing" -gt 0 ]; then
  echo "WARNING: $existing pi processes already running. Clean up first:"
  echo "  bash ~/.pi/agent/skills/shared/cleanup.sh"
  exit 1
fi

# Clean stale semaphores from previous crashed runs
source ~/.pi/agent/skills/shared/cpu-semaphore.sh
sem_clean_all
```

## Workflow

### Phase 0: Pre-Flight & Select Tickets

```bash
# Clean up any leftovers from previous runs
bash ~/.pi/agent/skills/shared/cleanup.sh --force
source ~/.pi/agent/skills/shared/cpu-semaphore.sh
sem_clean_all

tk ready
```

Pick up to **2** tickets (hard limit). Prefer tickets that touch different areas. If unsure, spawn a quick assessment agent:

```bash
pi -p "Read these ticket descriptions and estimate which files each would touch. Flag any pair that likely overlaps.
Tickets:
1. {ticket_1_title}: {ticket_1_description}
2. {ticket_2_title}: {ticket_2_description}
Output: INDEPENDENT or OVERLAPPING with details." --no-session 2>/dev/null
```

If tickets overlap, run them sequentially instead.

### Phase 1: Setup

Start all tickets and create worktrees:

```bash
# Start tickets from main
tk start {id_1}
tk start {id_2}

# Create worktrees on feature branches
git worktree add /tmp/worktree-{id_1} -b feat/{id_1}
git worktree add /tmp/worktree-{id_2} -b feat/{id_2}
```

### Phase 2: Parallel Execution

Spawn child orchestrators in parallel with **staggered startup** and **timeouts**:

```bash
source ~/.pi/agent/skills/shared/pitimeout.sh

pitimeout 600 pi -p "{child_prompt_1}" --no-session 2>/dev/null > /tmp/parallel-{id_1}.log 2>&1 &
PID_1=$!

sleep 5  # CRITICAL: prevent pi settings lock contention

pitimeout 600 pi -p "{child_prompt_2}" --no-session 2>/dev/null > /tmp/parallel-{id_2}.log 2>&1 &
PID_2=$!

# Wait for all children
wait $PID_1
EXIT_1=$?
wait $PID_2
EXIT_2=$?
```

#### Child Prompt Template

Each child gets a self-contained prompt that includes semaphore usage:

```
You are an autonomous coding agent. You will plan, implement, review, and commit a ticket.

## Project Context
- Working directory: /tmp/worktree-{id}
- Package manager: bun

## CPU-Intensive Commands
IMPORTANT: You MUST use the semaphore for tsc and vitest to prevent CPU saturation.

For typecheck:
  source ~/.pi/agent/skills/shared/cpu-semaphore.sh && cd packages/ui && sem_run typecheck 1 -- bunx tsc --noEmit

For tests:
  source ~/.pi/agent/skills/shared/cpu-semaphore.sh && cd packages/ui && sem_run test 1 -- bunx vitest run

NEVER run bare `bunx tsc --noEmit` or `bunx vitest run` without the semaphore wrapper.

## Ticket
ID: {ticket_id}
Title: {ticket_title}
Description: {ticket_description}

## Workflow
Execute these phases in order:

### 1. Plan
Read the relevant source files, understand the current state, and produce a detailed implementation plan. Explore files with read/grep/find. Plan what files to create/modify/delete, what tests to write, what the changes are.

### 2. Implement
Implement your plan step by step. Use the semaphore-wrapped commands above for tests and typecheck. Fix any failures.

BEFORE REPORTING: Re-read the ticket title and verify your implementation matches what was asked for.

### 3. Self-Review
Run: git add -A && git diff --cached

Review your own diff against the ticket intent:
- Does the implementation match the TICKET INTENT?
- For UI changes: Is the element in the right place?
- Sufficient tests?
- Code style consistent? (Mantine style props, semantic button variants, theme tokens)
- Any bugs or leftover debug code?

If you find issues, fix them and re-review.

### 4. Commit
When satisfied:
git add -A
git commit -m "feat: {short description}"

### 5. Report
Output exactly one of:
- TICKET_COMPLETE: {ticket_id}
- TICKET_FAILED: {ticket_id} <reason>
```

### Phase 3: Collect Results

Read each child's log file:

```bash
tail -20 /tmp/parallel-{id_1}.log
tail -20 /tmp/parallel-{id_2}.log
```

Check for `TICKET_COMPLETE` or `TICKET_FAILED` in each.
Also check exit codes — non-zero means timeout or crash.

### Phase 4: Merge

Merge completed branches back to main one at a time:

```bash
# Back on main
git checkout main

# Merge first branch
git merge feat/{id_1} --no-edit

# Merge second branch (may conflict)
git merge feat/{id_2} --no-edit
```

#### If merge conflicts occur:

```bash
# Get the conflict details
git diff --name-only --diff-filter=U

# Spawn a conflict resolution agent (with timeout)
timeout 300 pi -p "You are a coding agent. Resolve the merge conflicts in the current working directory.

Working directory: {cwd}
These files have conflicts:
{conflicted_files}

Branch being merged: feat/{id_2}
Ticket: {ticket_title_2}

Instructions:
1. Read each conflicted file
2. Resolve conflicts by keeping both changes where possible
3. If changes truly conflict, prefer the incoming branch's changes and adapt
4. Run tests (with semaphore): source ~/.pi/agent/skills/shared/cpu-semaphore.sh && cd packages/ui && sem_run test 1 -- bunx vitest run
5. Run typecheck (with semaphore): source ~/.pi/agent/skills/shared/cpu-semaphore.sh && cd packages/ui && sem_run typecheck 1 -- bunx tsc --noEmit
6. Stage resolved files: git add {files}
7. Complete the merge: git commit --no-edit

STATUS: PASS or STATUS: FAIL" --no-session 2>/dev/null
```

If conflict resolution fails, abort the merge and run that ticket sequentially:

```bash
git merge --abort
# Fall back to sequential for this ticket
```

### Phase 5: Cleanup (ALWAYS runs, even on failure)

```bash
# Remove worktrees
git worktree remove /tmp/worktree-{id_1} --force 2>/dev/null || rm -rf /tmp/worktree-{id_1}
git worktree remove /tmp/worktree-{id_2} --force 2>/dev/null || rm -rf /tmp/worktree-{id_2}

# Delete feature branches
git branch -D feat/{id_1} 2>/dev/null || true
git branch -D feat/{id_2} 2>/dev/null || true

# Clean semaphores
source ~/.pi/agent/skills/shared/cpu-semaphore.sh
sem_clean_all

# Clean log files
rm -f /tmp/parallel-{id_1}.log /tmp/parallel-{id_2}.log

# Close tickets
tk close {id_1}
tk close {id_2}

# Commit ticket status changes
git add .tickets/ && git commit -m "chore: close parallel tickets {id_1}, {id_2}"
```

**IMPORTANT:** Phase 5 cleanup must happen even if Phase 2-4 fail. Structure your orchestration with a trap or always-execute-finally pattern.

## Failure Recovery

If the parallel workflow crashes mid-run (e.g., you Ctrl+C the orchestrator):

```bash
# Run the cleanup script
bash ~/.pi/agent/skills/shared/cleanup.sh

# This will:
# 1. Kill orphaned pi processes
# 2. Remove dangling worktrees
# 3. Clean stale semaphore locks
```

## Limits

- **Max parallel workers: 2.** Hard limit. Do not increase without profiling system resources.
- **Max timeout per child: 600s (10 min).** Prevents runaway processes.
- **Max retries per child: 1.** If a child fails, don't retry in parallel — fall back to sequential.
- **CPU-intensive ops gated to 1 concurrent.** Only 1 tsc and 1 vitest run at any time across all workers.
- **Barrel exports will conflict.** If both tickets add exports to `index.ts`, expect a merge conflict. The conflict resolver handles this.
- **Screenshot review skipped in parallel mode.** Children commit without screenshot review. The meta-orchestrator can do a batch screenshot review after all merges complete.

## Post-Merge Verification

After all branches are merged, run a final verification (semaphore-gated):

```bash
source ~/.pi/agent/skills/shared/cpu-semaphore.sh
cd packages/ui && sem_run typecheck 1 -- bunx tsc --noEmit
cd packages/ui && sem_run test 1 -- bunx vitest run
```

If tests/types fail after merge, spawn a fix agent on main.

## Falling Back to Sequential

If at any point parallel execution isn't worth it:
- Only 1 ticket ready → use normal `autonomous-dev`
- Tickets heavily overlap → run sequentially
- Merge conflicts too complex → abort parallel, run remaining sequentially
- System load already high → reduce parallelism or go sequential

This skill is an optimization. The `autonomous-dev` skill is the foundation. When in doubt, fall back to sequential.
