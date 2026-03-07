---
id: pew-e8kd
status: done
deps: [pew-njbr]
links: []
created: 2026-03-07T06:51:12Z
type: feature
priority: 0
assignee: shane keulen
tags: [extension, sub-agent, parallel]
---
# spawn-agents-parallel extension — concurrent sub-agent dashboard

Build a generic Pi extension that registers a spawn_agents_parallel tool. Takes an array of agent configs (each with task, model, tools, systemPrompt, cwd). Runs them concurrently with a configurable concurrency limit (default 5). Live dashboard widget shows all agents' status in a compact stacked view. Returns aggregated results when all finish. This is what Level 1 (the planner) uses to launch multiple orchestrators working on different tickets simultaneously.

## Acceptance Criteria

1. Tool registered as spawn_agents_parallel callable by LLM
2. Accepts array of agent configs with per-agent task, model, tools, systemPrompt, cwd
3. Concurrency limit parameter (default 5)
4. Stacked widget showing all agents: status icon, task preview, elapsed, tool count, last line
5. Agents that finish rotate out or show ✓, new ones start
6. Returns array of results (output, exitCode, elapsed) for each agent
7. Abort signal kills all running subprocesses
8. Handles partial failures — if one agent fails, others continue
9. Aggregated summary at completion (N succeeded, M failed, total time)

