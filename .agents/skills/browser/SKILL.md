---
name: browser
description: "Drive a real browser to do frontend development against a running dev server (Storybook or Vite), the cmux browser experience. Use for: view/verify a component or page, hit Storybook, open a story, click/fill/type in a UI, snapshot the DOM, take screenshots, read console/network errors, and iterate on frontend changes with live reload. Uses the agent-browser CLI (Chrome via CDP)."
allowed-tools: Bash(agent-browser:*), Bash(curl:*), Bash(pnpm:*), Bash(lsof:*), Read
---

# browser

Frontend dev loop with a real Chrome window, mirroring cmux's browser surface. Driven by the `agent-browser` CLI (Chrome for Testing via CDP, accessibility-tree snapshots with `@eN` refs). This repo has no in-app browser pane, so the browser is a separate headed window plus screenshots you read back.

## Default rule

Never guess story ids, URLs, or element refs. Always look them up first (index.json, then `snapshot`). Prefer `--headed` so the human can watch, and screenshot after every state change so both of you see the result.

## Core loop

```bash
agent-browser open --headed <url>   # 1. Open the story/page (headed = visible window)
agent-browser snapshot -i           # 2. See interactive elements + fresh @eN refs
agent-browser click @e3             # 3. Act on a ref from the snapshot
agent-browser snapshot -i           # 4. RE-snapshot after any change (refs go stale)
agent-browser screenshot /tmp/x.png # 5. Capture, then Read the PNG to verify
```

Refs (`@e1`, `@e2`, ...) are assigned fresh on every snapshot and go **stale the moment the DOM changes** (filter select, tab switch, navigation, modal open). "Unknown ref" means re-`snapshot` and use the new ref. This is normal, not an error to debug.

## Prerequisites (trm specific, do this before opening a story)

1. **A dev server must be running in the target worktree.** Storybook uses port 6006, one at a time.
   - Trader (`app`): `pnpm --filter @trm/app storybook`
   - Admin (`apps/admin`): `pnpm --filter @trm/admin storybook`
   - Storybook `dev` mode lazy-compiles stories, so a broken story elsewhere does not take down the server. Do NOT use `pnpm storybook` (root), it does a composed static build that fails hard on any single broken import.
   - Check up: `curl -sf http://localhost:6006/index.json >/dev/null && echo up`
   - If 6006 is taken by the wrong workspace: `lsof -ti tcp:6006 | xargs kill`

2. **Codegen must have run, or admin/app stories fail with "Failed to fetch dynamically imported module" / "Failed to resolve import @trm/generated/types".** Generated types are gitignored and per-worktree.
   - Root types (`@trm/generated/types`): `pnpm run codegen:app`
   - Admin types (`apps/admin/generated/`): `cd apps/admin && pnpm run codegen`
   - Codegen needs the GraphQL schema (local Crystal on :4000 or the cached schema). If a story shows that resolve error, run codegen first, then `agent-browser reload`.

## Targeting a story

Find the real id from the running Storybook, never invent it:

```bash
curl -s http://localhost:6006/index.json | node -e "const d=JSON.parse(require('fs').readFileSync(0));const e=Object.values(d.entries||d.stories);e.filter(x=>/<search>/i.test(x.title)&&x.type==='story').forEach(x=>console.log(x.id,'|',x.title,'>',x.name))"
```

Open the isolated canvas (no Storybook chrome) for a clean view:

```bash
agent-browser open --headed "http://localhost:6006/iframe.html?id=<story-id>&viewMode=story"
```

## Command groups

- **Navigate:** `open [--headed] <url>`, `navigate`, `reload`, `back`, `forward`, `close`, `close --all`
- **Read:** `snapshot -i` (interactive only, preferred), `snapshot` (full), `snapshot -s "<css>"` (scoped), `read`, `get text|html|attr|value|title|url|count @eN`
- **Interact:** `click @eN` (`--new-tab`), `dblclick`, `hover`, `focus`, `fill @eN "text"` (clears first), `type @eN "text"`, `press Enter`, `check`/`uncheck`, `select`, `scroll`
- **Wait:** `wait --load networkidle`, `wait --selector <css>`, `wait --text "<t>"`, `wait --url-contains <s>`
- **Debug:** `console`, `errors`, `screenshot <path>` (`--full`), `eval "<js>"`, `highlight @eN`
- **Live view:** `dashboard start --port 4848` (cmux-style live pane at http://localhost:4848), `inspect` (open DevTools)
- **State:** `cookies`, `storage`, `state save|load` (for auth-gated real app pages)

## Common patterns

Verify a component after a code edit (Storybook hot-reloads):
```bash
# edit the .tsx, then:
agent-browser reload
agent-browser snapshot -i
agent-browser screenshot /tmp/after.png   # then Read it
```

Debug a blank/broken story:
```bash
agent-browser errors            # surfaces the vite import-analysis error, e.g. missing @trm/generated/types
agent-browser console
# usually the fix is codegen (see Prerequisites), not a story edit
```

Exercise interactions (each re-snapshot gets fresh refs):
```bash
agent-browser snapshot -i && agent-browser click @e6      # switch tab
agent-browser snapshot -i && agent-browser click @e10     # open dropdown
agent-browser snapshot -i && agent-browser click @e5      # pick option
agent-browser snapshot -i && agent-browser fill @e15 "12345"  # search
```

## Rules

- One dev server per worktree on 6006; kill the old one before starting another workspace's Storybook.
- Prefer `snapshot -i` over full `snapshot` and over parsing HTML; it is ~200-400 tokens.
- Re-snapshot before every ref interaction that follows a DOM change.
- When a story is blank with no error, wait/reload once (first compile), then check `errors`, then reach for codegen.
- Screenshots go to `/tmp`; Read them to actually see the result before reporting.
- These are fixture-backed Storybook stories: filtering/selecting works offline; anything needing a live backend will not.
- Isolated Chrome for Testing profile by default. For real trm app pages behind login, use `--profile Default` or `--cdp <port>` plus `state save/load`.
- Revert any demo edits and leave the working tree clean.
