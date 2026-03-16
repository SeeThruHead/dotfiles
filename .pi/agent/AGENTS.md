# Agent Instructions

## Rules

- Always ask before running any git commands (commit, push, stash, checkout, rebase, etc.). Never run them without explicit confirmation.
- Use `yadm` instead of `git` when working in the dotfiles repo (~/.pi/agent, ~/.config, etc.).
- Never run `yadm status -u` without a tight path filter — HOME is the worktree, it will hang.
- Use `tk` for ticket management, never edit .tickets/ files directly.
- Use `rg` (ripgrep) instead of `grep` for searching files.
- Don't use `show_widget` unless explicitly asked to visualize something.

## Tool Discovery

Before starting a task, grep `~/.pi/agent/_agents/cli-tools.md` for relevant keywords to find CLI tools that can help. The file is tag-indexed — search by concept (e.g., `csv`, `review`, `git`, `data`, `docker`). Then run `<tool> --help` to learn its interface.

Example: `grep -i "csv\|parquet\|data" ~/.pi/agent/_agents/cli-tools.md`

## Approach

- For mechanical/bulk tasks (comparing lists, pruning files, renaming, refactoring), write a throwaway script instead of doing it interactively. It's faster and more reliable.

## Subagents

Only use subagents for their specific skill. Don't delegate generic tasks (grep, reading files, simple bash commands) to a subagent — run those directly. A subagent is for isolated, specialized work (e.g., test-runner runs tests), not a proxy for things you can do yourself.

## Reference

Read the linked file only when you need details on that topic.

| Topic | File | When to read |
|-------|------|-------------|
| CLI Tools | [_agents/cli-tools.md](_agents/cli-tools.md) | Grep by keyword to discover tools |
