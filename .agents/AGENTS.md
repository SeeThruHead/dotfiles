# Global agent policy (all harnesses)

This is the personal (dotfiles) version. On a work machine the file is overridden locally with additional employer-specific sections; that override is never staged in yadm.

This file is the single source of truth for Claude Code, Pi, OpenCode and Codex. Each harness reads it via a symlink (`~/.claude/CLAUDE.md`, `~/.pi/agent/AGENTS.md`, `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md`). Everything it references lives under `~/.agents/`:
- `~/.agents/skills/` skills (every harness is pointed here)
- `~/.agents/rules/` domain playbooks, read on demand
- `~/.agents/agents/` subagent definitions (used by harnesses that support them)
- `~/.agents/RTK.md` rtk usage notes, read it now if you have not this session
- `~/.agents/shared/`, `~/.agents/utils/` helper scripts used by skills

# Communication
- No em dashes. Use commas, parens, or sentence breaks.
- Ask inline in plain text; never use a structured question/prompt UI if the harness offers one.
- Explain what you're doing and why; don't fix silently.
- No time estimates (hours/days); effort and ordering are fine.
- Don't hedge (presumably/probably/likely) when it's verifiable. Go check.
- Treat reported errors and pasted command output as current; never call them stale.
- Never state counts/numbers unless verified end-to-end.
- URLs in chat are not clickable for Shane, so pasting them is useless. Run `open <url>` to put it in his browser, and refer to things by name/number in the text.
- One foreground tool call, then answer. No background greps or multi-pass verification (push multi-pass work into a subagent where the harness has them).

# Code
- Functional iteration; no for/while loops.
- No mutation: const only, no reassignment, no .push/splice/in-place edits.
- No code comments (no //, no TSDoc); rationale goes in the PR.
- TS interfaces are plain nouns (WorkflowRunner); qualifier on the impl (TemporalWorkflowRunner).
- Declare deps in the consuming package.json; no shamefully-hoist/phantom-dep hacks.

# Artifacts (scratch files, reports, query dumps)
- NEVER write artifacts to `/tmp`, `/private/tmp`, or `$TMPDIR`. macOS wipes them and investigation work is lost.
- Write them to `~/tmp/` instead, and for anything investigative use `~/tmp/investigations/<slug>/` (slug = ticket key or short kebab topic).
- Applies to every generated file: SQL, CSV/JSON dumps, HTML/MD reports, helper scripts, PR/ticket bodies.
- Only exception: a file that is genuinely single-command throwaway and never referenced again. If it might be reread, it goes in `~/tmp/`.

# Subagents and skills
- Only invoke Shane's own skills (`~/.agents/skills`); never a harness's built-in ones (run/verify/code-review/etc.) unless he types the slash command.
- Never spawn a harness's built-in agents (Explore/Plan/general-purpose) or use worktree isolation.
- If the harness supports custom subagents, use the definitions in `~/.agents/agents/`: route test runs to `test-runner`, and command-running / code-location / file+log summarizing to `gopher`. Prefer delegating grunt work to a cheaper model to preserve context; do it yourself only if delegating would be slower. Multi-step exploration belongs in a subagent, not the main thread.
- If the harness has no subagents (Pi), do the work in the main session and ignore delegation instructions.

# Tools
- `rtk`: Claude Code has a PreToolUse hook that rewrites shell commands through `rtk` automatically. No other harness does; there, read `~/.agents/RTK.md` and invoke `rtk` explicitly when appropriate.
- Bash search: ALWAYS `rg`, NEVER `grep`, and NEVER pass `-r`/`-R` (rtk rewrites it to `--replace` and corrupts output). Use `rg -n pat path`; `-g`, `-l`, `-i`, `-P`, `--files` are safe.
- User runs in tmux: read panes via `tmux list-panes` + `tmux capture-pane`, don't ask for file redirects.
- NEVER let a command sit on a long tool timeout. There is no `timeout` binary on this box: wrap anything that can block in `perl -e 'alarm N; exec @ARGV' -- <cmd>` with N of 20-60s, and set the harness's tool timeout just above N. A hung command that only surfaces after 5-10 minutes has burned Shane's time, and it has happened repeatedly.

# Dotfiles
- `$HOME` is a `yadm` worktree. For work under `~/.agents`, `~/.claude`, `~/.pi/agent`, `~/.codex`, or `~/.config`, use `yadm` instead of `git`.
- Never run `yadm status -u` without a tight path filter, since `$HOME` is the worktree.

# Safety (always on)
- git: `git status` before any add/commit/push; never `git add -A` unverified; new branches `sk/<kebab-desc>`, never rename an existing branch.
- git: ALWAYS `git fetch origin` before git work or code review, and cut new branches from freshly-fetched `origin/main`, never a stale local `main`. Verify the working branch includes the latest relevant base before inspecting or testing it. A branch can also go stale mid-work if a related PR merges into main; if so, merge/rebase `origin/main` in before assuming the branch reflects reality. For PR reviews, inspect and test the freshly fetched PR ref against freshly fetched `origin/main`; never read review evidence from an unrelated or stale working branch.
- git commits: ALWAYS `git diff --cached --stat` immediately before `git commit` and commit only if it's EXACTLY the intended files. `git add <paths>` does NOT unstage cruft already in the index (pre-staged files, hook/lint-staged adds), so a clean-looking add can still commit garbage. Verify the staged set, not just what you added.

# Playbooks
Detailed rules live in `~/.agents/rules/*.md` (self-describing names). Before domain work, `ls ~/.agents/rules/` and read the relevant file first.
