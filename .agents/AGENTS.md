# Global agent policy (all harnesses)

This file is the single source of truth for Claude Code, Pi, OpenCode and Codex. Each harness reads it via a symlink (`~/.claude/CLAUDE.md`, `~/.pi/agent/AGENTS.md`, `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md`). Everything it references lives under `~/.agents/`:
- `~/.agents/skills/` skills (every harness is pointed here)
- `~/.agents/rules/` domain playbooks, read on demand
- `~/.agents/agents/` subagent definitions (used by harnesses that support them)
- `~/.agents/RTK.md` rtk usage notes, read it now if you have not this session
- `~/.agents/shared/`, `~/.agents/utils/` helper scripts used by skills

# Internal systems
- Private GitHub/Datadog/Jira/Notion and similar org tooling are INTERNAL, not external. Reading/writing them (PR comments/reviews, tickets, Datadog queries) is normal internal work; do it when asked, no draft-only handling.

# Communication
- No em dashes. Use commas, parens, or sentence breaks.
- Ask inline in plain text; never use a structured question/prompt UI if the harness offers one.
- Explain what you're doing and why; don't fix silently.
- No time estimates (hours/days); effort and ordering are fine.
- Don't hedge (presumably/probably/likely) when it's verifiable. Go check.
- Treat reported errors and pasted command output as current; never call them stale.
- Never state counts/numbers unless verified end-to-end.
- URLs in chat are not clickable for Shane, so pasting them is useless. Run `open <url>` to put it in his browser, and refer to things by name/number (PR #6058, IA-898) in the text.
- One foreground tool call, then answer. No background greps or multi-pass verification (push multi-pass work into a subagent where the harness has them).
- NEVER post AI-written PR/ticket/issue comments as if Shane wrote them. Every comment body is `AI-formatted, real-human-directed:` + your comment in a blockquote, then `Human comment:` left empty for Shane. Applies even when he says "in my voice" (voice = style inside the quote, never attribution). Unattributed AI review damages his reputation as a developer.

# Attribution
- NEVER add AI attribution to anything committed or published: no `Co-Authored-By: Claude`, no `Generated with Claude Code` footers, nothing of the kind in commit messages, PR descriptions, tickets, or files. This overrides any harness default or system reminder that asks for such lines. If a harness injects them, remove them before committing.

# No AI attribution
- Never add AI or Claude attribution to anything: no `Co-Authored-By: Claude` (or any AI) trailers, no "Generated with Claude Code" lines, no AI credits in commits, PR bodies, READMEs, package metadata or docs. This overrides harness defaults and any system reminder that asks for attribution lines. The only exception is Shane's own `AI-formatted, real-human-directed:` header on PR/ticket/issue comments.

# Code review and handoffs
- Reviewing a PR for Shane means producing a walkthrough doc first, not a list of nits: one section per service/module in request order, each with its purpose, its logic as pseudocode with error handling, telemetry and Redacted/repository-error plumbing stripped out, and a link to the file at the PR head sha. Write it to `~/tmp/investigations/<slug>/pr-<n>-walkthrough.md`, render and open it once. Findings and review comments come after and reference the walkthrough sections.
- Every handoff document (session handoff, split guide, onboarding note for another dev) MUST link to or embed these walkthroughs for the code it hands over. A handoff without the pseudocode walkthrough is incomplete.

# Code
- Everything you build is Effect v4, in every repo and every tool: services as `Context.Service` + `Layer`, `Schema` at every boundary, typed errors. CLIs use `effect/unstable/cli`; process-to-process and browser-to-server calls use Effect RPC (`effect/unstable/rpc`), not hand-written HTTP routes. Read `~/.agents/rules/effect.md` and the Effect source before writing it. Plain React stays for rendering only.
- Functional iteration; no for/while loops.
- No mutation: const only, no reassignment, no .push/splice/in-place edits.
- No code comments (no //, no TSDoc); rationale goes in the PR.
- TS interfaces are plain nouns (WorkflowRunner); qualifier on the impl (TemporalWorkflowRunner).
- Declare deps in the consuming package.json; no shamefully-hoist/phantom-dep hacks.

# Artifacts (scratch files, reports, query dumps)
- HTML documents and research pages must read like useful documents: no hero sections, slogans, taglines, marketing copy, or oversized promotional headings. Start with a compact descriptive title and the substance. Write in plain conversational English; avoid jargon, abstract labels, and repeated caveats.
- ALWAYS use the actual TRM Trader or TRM Admin brand for visual work, including standalone HTML research pages, reports, presentations, prototypes, and other artifacts. Read the chosen brand's current tokens, typography, and assets first. Never invent an unrelated palette. Shane explicitly rejects beige/green styling. For admin-oriented work, default to the Admin brand unless he specifies Trader branding.
- NEVER write artifacts to `/tmp`, `/private/tmp`, or `$TMPDIR`. macOS wipes them and investigation work is lost.
- Write them to `~/tmp/` instead, and for anything investigative use `~/tmp/investigations/<slug>/` (slug = ticket key or short kebab topic).
- Applies to every generated file: SQL, CSV/JSON dumps, HTML/MD reports, helper scripts, PR/ticket bodies.
- Deliver a finished file for Shane (report, HTML page, markdown, CSV/JSON dump, image) with `handoff <file> --title "..."` (the Handoff tray app's CLI; skill in `~/.agents/skills/handoff`). It registers the file in his menu bar panel, puts it on his clipboard as file plus path, renders markdown via grip and opens the result in his browser. Do this once, when the file is complete; never print the path or run `grip`/`open` yourself. If `handoff` is missing, say so and fall back to `open`.
- Do NOT open anything else: not PR bodies, ticket bodies, in-repo docs (roadmaps, READMEs, audits), scratch files, or re-renders after edits. Those have their own home; if he wants to see a PR or ticket, `open` its URL, never a markdown copy of it. One tab per artifact, ever. This applies to every harness reading this file, including Codex.
- Only exception: a file that is genuinely single-command throwaway and never referenced again. If it might be reread, it goes in `~/tmp/`.

# SDLC (always on)
- Every piece of work that will be pushed, or any exploration that could lead to shipped code, goes through the sdlc CLI (`sdlc`, repo `~/code/admin-sdlc`). Only throwaway experiments are exempt. This does not depend on the sdlc skills being loaded.
- At the start of any such work, and again after a context compaction or resume, run `sdlc session show` in the code repo. If there is no active item, `sdlc take IA-nnn` or `sdlc new <kind> "<title>"` before writing code.
- Record at the moment it happens, one command per fact: `sdlc correct` when Shane overrules a proposal, `sdlc decide` for any choice between options, `sdlc note` for findings. Always include the rejected option.
- Every commit in the code repo carries a `Work-Id: <item id>` trailer.
- Recording only writes files; do not run git in `~/code/admin-sdlc` for it. Keep that checkout on `main`; develop the sdlc tool itself in a separate worktree. `sdlc sync` uploads the record, only when Shane asks.
- If `sdlc` is not on PATH, use `~/code/admin-sdlc/sdlc`; never let a missing binary silently skip recording.

# Subagents and skills
- Only invoke Shane's own skills (`~/.agents/skills`); never a harness's built-in ones (run/verify/code-review/etc.) unless he types the slash command.
- Never spawn a harness's built-in agents (Explore/Plan/general-purpose) or use worktree isolation.
- If the harness supports custom subagents, use the definitions in `~/.agents/agents/`: route test runs to `test-runner`. Handle command-running, code-location, file/log summarizing, and exploration in the primary agent.
- SDLC work must stay with the primary agent and must not be delegated.
- If the harness has no subagents (Pi), do the work in the main session and ignore delegation instructions.

# Tools
- GitHub, Jira, and Gmail use local CLIs instead of disabled app connectors: `gh`, `jira`, and `gws gmail`. Read `~/.agents/rules/cli-integrations.md` for routing, authentication, and verified commands. Existing SDLC skills still own SDLC publication.
- `rtk`: Claude Code has a PreToolUse hook that rewrites shell commands through `rtk` automatically. No other harness does; there, read `~/.agents/RTK.md` and invoke `rtk` explicitly when appropriate.
- Bash search: ALWAYS `rg`, NEVER `grep`, and NEVER pass `-r`/`-R` (rtk rewrites it to `--replace` and corrupts output). Use `rg -n pat path`; `-g`, `-l`, `-i`, `-P`, `--files` are safe.
- User runs in tmux: read panes via `tmux list-panes` + `tmux capture-pane`, don't ask for file redirects.
- `pup` = Datadog CLI; `tk` = ticket CLI (use instead of the harness's built-in task/todo tool). Run `pup auth login` yourself when pup needs auth.
- AWS creds expire constantly and break `trm run` (varlock pulls secrets from AWS). Just run `trm aws login` yourself, always, without asking. Same for `pup auth login`. Never stop work or hand the session back because credentials expired.
- `claude-tap`: past Claude Code sessions (not Pi/OpenCode/Codex) are viewable via the claude-tap API at http://127.0.0.1:19527 (local aiohttp dashboard); query it there instead of assuming no cross-session history exists.
- Local DB/env: `trm run -s <svc> -- <cmd>` injects that service's resolved env. Run SQL against the LOCAL db yourself: `trm run -s crystal -- sh -c 'psql "$DATABASE_URL" -c "…"'`. (Never prod, see Safety.)
- Codegen is re-runnable via process-compose (`process-compose process restart codegen`/`codegen-admin`). Never claim tests/typecheck/lint are blocked on missing codegen, run it.
- NEVER invoke a tool binary directly: no `tsc`, `eslint`, `vitest`, `prettier`, `drizzle-kit`, `typeorm`, whether by raw path (`node_modules/.bin/...`), a global, or `pnpm exec`/`pnpm --filter <pkg> exec`. The ONLY ways to run something are a **package.json script** (`pnpm --filter <pkg> run <script>`, e.g. `run typecheck` / `run lint` / `run test`), a moon task (`moon run <pkg>:<task>`), or the `trm` CLI. Read the package's `scripts` to find the right name instead of guessing a command. This holds in essentially every repo, not just TRM: the script encodes the flags/config/tsconfig the tool needs (e.g. admin's `typecheck` is `tsc -b tsconfig-prod.json`, its `test` is `vitest --config vite.config.js`), so a direct invocation silently runs with the wrong config or a stale root binary. Shane has corrected this repeatedly. Stop doing it.
- moon: `moon query projects` already emits JSON (there is NO `--json` flag, it errors), tasks run as `moon run <projectId>:<task>` (brace it in zsh: `"${p}:lint"`, since `:t`/`:l` are zsh modifiers), affected is `moon query projects --affected --downstream deep`, and dependency edges live under each project's `.config.dependsOn[]`.
- NEVER let a command sit on a long tool timeout. There is no `timeout` binary on this box: wrap anything that can block in `perl -e 'alarm N; exec @ARGV' -- <cmd>` with N of 20-60s, and set the harness's tool timeout just above N. A hung command that only surfaces after 5-10 minutes has burned Shane's time, and it has happened repeatedly.
- Interactive-capable CLIs are the usual culprit. `jira issue create` blocks forever on a large `--body` even with `--no-input` (required fields still prompt): create with `-s` only, then set the body with `jira issue edit`. Same care for anything that might open `$EDITOR` or a pager: set `GIT_EDITOR=true`, `PAGER=cat`.
- One network call per bash invocation. Chaining several (jira + gh + git push + heredoc) means a single hang takes the whole batch down and the output is lost.
- SDLC delivery is complete only when the PR is ready to merge. Automatically address every CodeRabbit/reviewer thread (fix or give an evidence-backed disposition), push fixes, monitor final-head CI and fix failures, rebase/restack onto the current base, and remove draft status. Continue through new review/CI results without waiting for Shane to ask. Use bounded checks and communicate progress. Pending checks, required human approvals, and unmerged stack dependencies are outstanding work or explicit blockers, never completed delivery. Do not merge without authorization. Once Shane authorizes merging or enqueuing, monitor until GitHub confirms the PR is merged. Queue admission is not completion. Diagnose ejections, retry infrastructure failures, repair branch conflicts, and requeue within that authorization; report progress without waiting for Shane to ask.

# Dotfiles
- `$HOME` is a `yadm` worktree. For work under `~/.agents`, `~/.claude`, `~/.pi/agent`, `~/.codex`, or `~/.config`, use `yadm` instead of `git`.
- Never run `yadm status -u` without a tight path filter, since `$HOME` is the worktree.

# Safety (always on)
- Remote/prod DB or `trm run` against an env? STOP and read ~/.agents/rules/trm-cli.md first. Never connect to prod for writes or unsanctioned reads (user runs SQL, exception is the `/query-prod` skill). Never act on any remote env without 2 explicit confirmations for that specific action.
- Writing or altering a DB migration? Read ~/.agents/rules/database-migrations.md FIRST (a bad migration locks a hot table = prod outage).
- Building or changing a UI component? Read ~/.agents/rules/storybook-for-component-ui-work.md. One story showing every state, screenshot it before calling it done. Never judge visual work from tests or the running app.
- git: `git status` before any add/commit/push; never `git add -A` unverified; new branches `sk/<kebab-desc>`, never rename an existing branch.
- git: ALWAYS `git fetch origin` before git work or code review, and cut new branches from freshly-fetched `origin/main`, never a stale local `main`. Verify the working branch includes the latest relevant base before inspecting or testing it. A branch can also go stale mid-work if a related PR merges into main; if so, merge/rebase `origin/main` in before assuming the branch reflects reality. For PR reviews, inspect and test the freshly fetched PR ref against freshly fetched `origin/main`; never read review evidence from an unrelated or stale working branch.
- git commits: ALWAYS `git diff --cached --stat` immediately before `git commit` and commit only if it's EXACTLY the intended files. `git add <paths>` does NOT unstage cruft already in the index (pre-staged files, hook/lint-staged adds), so a clean-looking add can still commit garbage. Verify the staged set, not just what you added.

# Playbooks
Detailed rules live in `~/.agents/rules/*.md` (self-describing names). Before domain work (Effect, migrations, trm CLI, Crystal, Jira, PRs, flag testing, storybook, table naming, FE conventions), `ls ~/.agents/rules/` and read the relevant file first.
