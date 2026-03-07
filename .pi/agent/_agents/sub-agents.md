# Sub-Agent Tools

Two tools for spawning sub-agents. Only use when the user explicitly asks.

## spawn_agent

Spawn a single sub-agent that runs to completion and returns its result. Blocking.

**When to use:** User asks you to delegate a task, run something in isolation, or when the autonomous-dev skill needs sequential steps.

**Parameters:**
- `task` (required) — the prompt for the sub-agent
- `model` — model override (e.g., `codex-mini`, `claude-opus-4`)
- `tools` — comma-separated tool list to restrict (default: all)
- `skills` — comma-separated skill names to load (default: none)
- `extensions` — comma-separated extension names to load (default: none)
- `systemPrompt` — additional system prompt
- `cwd` — working directory

## spawn_agents_parallel

Spawn multiple sub-agents that run concurrently. Blocks until ALL complete.

**When to use:** User asks for parallel work, or autonomous-dev skill needs to run multiple independent tickets simultaneously.

**Parameters:**
- `agents` — array of agent specs, each with the same params as spawn_agent

## Dashboard

- `alt+a` opens the agent tree overlay
- `j/k` to navigate, `Enter` to view output, `Esc` to go back
- `ctrl+x` to clear completed agents
- Status bar above prompt shows running/done/failed counts

## Key behaviors

- Sub-agents are autonomous — no human input, they always complete and return
- Abort cascades: if a parent is aborted, all children are aborted too
- Agent IDs use sequential letters: a, b, c... nested: a/b, a/b/c
- Each agent gets spawn_agent + spawn_agents_parallel so nesting works at any depth
