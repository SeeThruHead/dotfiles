---
id: age-zn5n
status: closed
deps: [pew-njbr, pew-e8kd]
links: []
created: 2026-03-07T08:44:15Z
type: task
priority: 1
assignee: shane keulen
tags: [agents, instructions, sub-agent]
---
# Update AGENTS.md with spawn_agent/spawn_agents_parallel tool guidance

Update the global AGENTS.md instructions to tell the agent about spawn_agent and spawn_agents_parallel tools. The agent should know these tools exist and what they're for, but should NOT use them unless the user explicitly asks. Key points: (1) spawn_agent for sequential blocking sub-agents, (2) spawn_agents_parallel for concurrent independent tasks, (3) only use when user requests sub-agents or parallel work, (4) never spawn sub-agents autonomously for simple tasks, (5) alt+a overlay for monitoring.

## Acceptance Criteria

1. AGENTS.md documents spawn_agent and spawn_agents_parallel tools
2. Instructions clearly state: only use when user asks
3. Describes when each tool is appropriate (sequential vs parallel)
4. Mentions alt+a overlay for monitoring
5. Agent does not spontaneously use sub-agents for normal tasks

