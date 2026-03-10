# Agent Instructions

## Rules

- Always ask before running any git commands (commit, push, stash, checkout, rebase, etc.). Never run them without explicit confirmation.
- Use `yadm` instead of `git` when working in the dotfiles repo (~/.pi/agent, ~/.config, etc.).
- Never run `yadm status -u` without a tight path filter — HOME is the worktree, it will hang.
- Use `tk` for ticket management, never edit .tickets/ files directly. Tickets are for the autonomous-dev workflow, not for context hygiene sub-agents.

## Context Hygiene — Sub-Agent Delegation

Proactively use sub-agents to keep the main context clean. The principle: **if you only need a summary of the result, delegate it.**

### Delegate to a sub-agent

- **Test runs** — spawn a sub-agent to run tests. It reads all output and returns: pass/fail, which tests failed, relevant error messages.
- **Builds / compiles** — same pattern. You need "it worked" or "these 3 errors", not 200 lines of webpack output.
- **Lint / type-check** — delegate, get back only the diagnostics that matter.
- **Exploratory searches** — large greps, find commands, scanning unfamiliar codebases. Sub-agent explores and returns a structured summary.
- **Log analysis** — reading long log files, stack traces, CI output.
- **Any command with verbose output** — if the output is likely >30 lines and you only need key facts, delegate.

### Keep in the main context

- File reads you're about to edit (you need the full content to make precise edits).
- Planning and architecture discussions with the user.
- Small, targeted commands where the full output is useful context (e.g., `ls`, short `grep`, `git diff` on a few files).
- Edits and writes — these must happen in the main agent.

### How to delegate

Use `spawn_agent` with a task prompt that tells the sub-agent what to run and what to report back. Be specific about the summary format you want. Use `codex-mini` model for simple run-and-summarize tasks to save cost.

Example task: *"Run `npm test` in /path/to/project. Report: total pass/fail count, and for any failures list the test name and error message. Keep it concise."*

### Sub-Agent API

**spawn_agent** — single sub-agent, runs to completion, blocking.
- `task` (required) — the prompt
- `model` — model override (e.g., `codex-mini`, `claude-opus-4`)
- `tools` — comma-separated tool list to restrict (default: all)
- `skills` — comma-separated skill names to load
- `extensions` — comma-separated extension names to load
- `systemPrompt` — additional system prompt
- `cwd` — working directory

**spawn_agents_parallel** — multiple sub-agents concurrently, blocks until ALL complete.
- `agents` — array of agent specs, each with the same params as spawn_agent

### Sub-Agent Behaviors

- Sub-agents are autonomous — no human input, they always complete and return.
- Abort cascades: if a parent is aborted, all children are aborted too.
- Agent IDs use sequential letters: a, b, c... nested: a/b, a/b/c
- Nesting works at any depth — each agent gets both spawn tools.
- Dashboard: `alt+a` to open, `j/k` navigate, `Enter` to view, `ctrl+x` to clear completed.

## Tool Discovery

Before starting a task, grep `~/.pi/agent/_agents/cli-tools.md` for relevant keywords to find CLI tools that can help. The file is tag-indexed — search by concept (e.g., `csv`, `review`, `git`, `data`, `docker`). Then run `<tool> --help` to learn its interface.

Example: `grep -i "csv\|parquet\|data" ~/.pi/agent/_agents/cli-tools.md`

## Reference

Read the linked file only when you need details on that topic.

| Topic | File | When to read |
|-------|------|-------------|
| CLI Tools | [_agents/cli-tools.md](_agents/cli-tools.md) | Grep by keyword to discover tools |
