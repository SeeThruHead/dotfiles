---
id: pew-3wow
status: open
deps: [pew-njbr, pew-e8kd]
links: []
created: 2026-03-07T06:51:24Z
type: task
priority: 1
assignee: shane keulen
tags: [skill, autonomous-dev, integration]
---
# Update autonomous-dev skill to use spawn_agent and spawn_agents_parallel tools

Update the autonomous-dev skill prompts so the orchestrator (Level 2) uses the spawn_agent tool instead of raw 'pi -p ... --no-session 2>/dev/null' for spawning Level 3 workers. Update Level 1 to use spawn_agents_parallel to launch multiple orchestrators in parallel (e.g., 5 at a time) instead of a single sequential orchestrator. The skill itself stays as a skill — we're just changing the sub-agent plumbing from raw pi -p to the new extension tools. Also remove pitimeout dependency since the extensions handle timeouts internally.

## Acceptance Criteria

1. Level 2 orchestrator prompt uses spawn_agent tool for TDD, test review, implement, code review, fix steps
2. Level 1 planner uses spawn_agents_parallel to launch N orchestrators for N ticket batches
3. Model per role specified in spawn_agent calls (e.g., codex-mini for implementation, claude-opus-4 for review)
4. No more raw pi -p or pitimeout in the skill
5. Skill still works end-to-end: plan → parallel orchestrate → sequential worker steps → commit
6. CPU semaphore still used for tsc/vitest within worker prompts

