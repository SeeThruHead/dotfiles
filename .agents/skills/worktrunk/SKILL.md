---
name: worktrunk
description: Manage git worktrees with WorkTrunk (wt). Create, switch, list, merge, and remove worktrees for parallel branch work. Use when the user mentions worktrunk, work trunk, wt, worktrees, or wants to work on multiple branches simultaneously.
---

# Worktrunk (`wt`) — Git Worktree Management

## Overview

Worktrunk manages git worktrees so each branch gets its own directory. Use `wt` instead of `git switch` for parallel branch work without stashing.

The binary is at `/opt/homebrew/opt/worktrunk/bin/wt`. Shell integration is set up in `~/.zshrc` so `wt switch` can `cd` into worktrees.

## Important

- **Always ask the user before running git commands** (commit, push, merge, etc.) per global agent instructions.
- `wt merge` and `wt remove` are destructive — always confirm before running.
- `wt step commit` and `wt step squash` generate LLM commit messages — review with user.

## Commands Reference

### Create & Switch Worktrees

```bash
wt switch --create <branch>           # New branch + worktree from default branch
wt switch --create <branch> --base <base>  # New branch from specific base
wt switch <branch>                    # Switch to existing worktree
wt switch -                           # Previous worktree (like cd -)
wt switch ^                           # Default branch worktree
wt switch @                           # Current worktree
wt switch pr:123                      # GitHub PR #123's branch
wt switch                             # Interactive picker (no args)
wt switch --create <branch> -x claude # Create worktree and launch claude in it
```

### List Worktrees

```bash
wt list                    # Table of all worktrees with status
wt list --full             # Include CI, diff stats, LLM summaries
wt list --branches         # Include branches without worktrees
wt list --format=json      # JSON output for scripting
```

**Status symbols**: `+` staged, `!` modified, `?` untracked, `^` default branch, `↑` ahead, `↓` behind, `⊂` integrated/safe to delete.

### Merge (current branch → default branch)

```bash
wt merge                   # Squash → rebase → fast-forward → remove worktree
wt merge --no-squash       # Preserve individual commits
wt merge --no-remove       # Keep worktree after merge
wt merge --no-commit       # Skip auto-commit (for manual commit prep)
wt merge develop           # Merge into specific target branch
```

Pipeline: stage → squash → rebase → pre-merge hooks → fast-forward → cleanup.

### Remove Worktrees

```bash
wt remove                  # Remove current worktree + delete branch if merged
wt remove <branch>         # Remove specific worktree
wt remove --force          # Force remove (untracked files like build artifacts)
wt remove -D               # Force-delete unmerged branch
wt remove --no-delete-branch  # Keep the branch
```

### Step (Individual Operations)

```bash
wt step commit             # Stage + commit with LLM message
wt step squash             # Squash all branch commits into one
wt step rebase             # Rebase onto target
wt step push               # Fast-forward target to current branch
wt step diff               # Show all changes since branching
wt step copy-ignored       # Copy gitignored files from another worktree
wt step prune              # Remove worktrees merged into default branch
```

### Hooks

```bash
wt hook show               # Show configured hooks
wt hook pre-merge          # Run pre-merge hooks manually
wt hook post-create        # Run post-create hooks manually
```

### Config

```bash
wt config create           # Create user config (~/.config/worktrunk/config.toml)
wt config create --project # Create project config (.config/wt.toml)
wt config show             # Show current config and file locations
wt config shell install    # Install shell integration
```

## Configuration

### User Config (`~/.config/worktrunk/config.toml`)

Controls worktree path layout and LLM commit generation:

```toml
# Where worktrees are created (default: sibling directory)
# worktree-path = "{{ repo_path }}/../{{ repo }}.{{ branch | sanitize }}"
# worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"

[commit.generation]
command = "claude -p --model=haiku"
```

### Project Config (`.config/wt.toml`)

Hooks and project-specific settings, committed to the repo:

```toml
[post-create]
deps = "npm ci"

[post-start]
copy = "wt step copy-ignored"
server = "npm run dev -- --port {{ branch | hash_port }}"

[pre-merge]
test = "npm test"
build = "npm run build"

[post-remove]
kill-server = "lsof -ti :{{ branch | hash_port }} -sTCP:LISTEN | xargs kill 2>/dev/null || true"

[list]
url = "http://localhost:{{ branch | hash_port }}"
```

### Template Variables

Available in hooks and config:

| Variable | Description |
|---|---|
| `{{ repo }}` | Repository directory name |
| `{{ repo_path }}` | Absolute repo path |
| `{{ branch }}` | Branch name |
| `{{ worktree_path }}` | Absolute worktree path |
| `{{ default_branch }}` | Default branch name |
| `{{ target }}` | Merge target (merge hooks only) |
| `{{ base }}` | Base branch (creation hooks only) |

### Template Filters

| Filter | Example | Description |
|---|---|---|
| `sanitize` | `{{ branch \| sanitize }}` | Replace `/` and `\` with `-` |
| `sanitize_db` | `{{ branch \| sanitize_db }}` | DB-safe identifier |
| `hash_port` | `{{ branch \| hash_port }}` | Deterministic port 10000-19999 |

## Typical Workflows

### Solo feature work
```bash
wt switch --create sk/my-feature    # Create worktree
# ... work ...
wt merge                            # Squash-merge to main, cleanup
```

### Review a PR
```bash
wt switch pr:456                    # Checkout PR in its own worktree
# ... review, test ...
wt remove                           # Clean up when done
```

### Parallel AI agents
```bash
wt switch --create feature-a -x claude -- "Implement feature A"
wt switch --create feature-b -x claude -- "Implement feature B"
wt list                             # Check progress
wt switch feature-a                 # Review when done
wt merge                            # Merge if good
```

### Quick rebase onto latest main
```bash
wt step rebase                      # Rebase current branch onto default
```

## Gotchas

- Worktrees share `.git` but NOT `node_modules`, `.env`, build artifacts — use `wt step copy-ignored` or `post-create` hooks to handle.
- `wt merge` does a **local** fast-forward merge, not a GitHub PR merge. Push separately if needed.
- Without `--create`, `wt switch <branch>` expects the branch to already exist.
- The `--execute` flag (`-x`) replaces the wt process — useful for launching editors/agents.
