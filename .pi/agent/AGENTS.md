# Agent Instructions

## Rules

- Always ask before running any git commands (commit, push, stash, checkout, rebase, etc.). Never run them without explicit confirmation.
- Use `yadm` instead of `git` when working in the dotfiles repo (~/.pi/agent, ~/.config, etc.).
- Never run `yadm status -u` without a tight path filter — HOME is the worktree, it will hang.
- Use `tk` for ticket management, never edit .tickets/ files directly. Tickets are for the autonomous-dev workflow, not for context hygiene sub-agents.

## Tool Discovery

Before starting a task, grep `~/.pi/agent/_agents/cli-tools.md` for relevant keywords to find CLI tools that can help. The file is tag-indexed — search by concept (e.g., `csv`, `review`, `git`, `data`, `docker`). Then run `<tool> --help` to learn its interface.

Example: `grep -i "csv\|parquet\|data" ~/.pi/agent/_agents/cli-tools.md`

## Reference

Read the linked file only when you need details on that topic.

| Topic | File | When to read |
|-------|------|-------------|
| CLI Tools | [_agents/cli-tools.md](_agents/cli-tools.md) | Grep by keyword to discover tools |
