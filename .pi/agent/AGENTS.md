# Agent Instructions

## Rules

- Always ask before running any git commands (commit, push, stash, checkout, rebase, etc.). Never run them without explicit confirmation.
- Use `yadm` instead of `git` when working in the dotfiles repo (~/.pi/agent, ~/.config, etc.).
- Never run `yadm status -u` without a tight path filter — HOME is the worktree, it will hang.
- Use `tk` for ticket management, never edit .tickets/ files directly.
- Don't use sub-agents (spawn_agent, spawn_agents_parallel) unless the user explicitly asks.

## Reference

Read the linked file when you need details. Grep `_agents/cli-tools.md` to search for commands by keyword.

| Topic | File | When to read |
|-------|------|-------------|
| CLI Tools | [_agents/cli-tools.md](_agents/cli-tools.md) | Grep when you need a CLI command |
| Sub-Agents | [_agents/sub-agents.md](_agents/sub-agents.md) | When user asks to spawn agents |
