---
id: pew-njbr
status: done
deps: []
links: []
created: 2026-03-07T06:51:04Z
type: feature
priority: 0
assignee: shane keulen
tags: [extension, sub-agent, core]
---
# spawn-agent extension — single blocking sub-agent tool

Build a generic Pi extension that registers a spawn_agent tool. The tool spawns a pi subprocess in JSON mode (pi --mode json -p --no-session), streams progress back via a live widget (status icon, agent name, elapsed time, tool count, last output line), and returns the agent's full output when done. Parameters: task (prompt), model (optional override), tools (optional list), systemPrompt (optional), cwd (optional). Blocking — the calling agent waits for the result. Supports abort via signal. This is the foundation that orchestrator agents use for sequential steps (TDD, review, implement, fix).

## Acceptance Criteria

1. Tool registered as spawn_agent callable by LLM
2. Spawns pi --mode json -p subprocess
3. Parses JSON event stream for text deltas and tool execution events
4. Live widget shows: status icon (●/✓/✗), task preview, elapsed time, tool count, last output line
5. Model override works — can specify codex-mini or claude-opus-4 per invocation
6. Tools restriction works — can limit sub-agent to read,grep,find,ls
7. System prompt append works
8. CWD override works
9. Returns full text output to calling agent
10. Abort signal kills subprocess with SIGTERM
11. Proper cleanup on session shutdown


## Notes

**2026-03-07T06:54:00Z**

## UX Decision: Widget Placement
- Sub-agent status widgets go in the HEADER area (ctx.ui.setHeader) — pinned at the very top of the terminal
- This keeps them out of the way of the editor and footer
- Header is live-updating, showing running agent status
- When no agents running, header can show default Pi header or be minimal
- Keybinding (e.g., ctrl+shift+a) to toggle expanded/collapsed agent view
- Collapsed: one-line-per-agent summary
- Expanded: more detail (last few tool calls, output preview)
