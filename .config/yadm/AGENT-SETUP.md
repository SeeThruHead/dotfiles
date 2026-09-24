# Agent workstation setup

One-shot instructions for an AI agent (Claude Code, Pi or Codex) setting up Shane's
agentic workflow on a personal Mac after the dotfiles are in place. Every step is
idempotent; rerun the whole file if anything is unclear. Ask Shane before doing
anything marked "human".

## 0. Preconditions

- The fresh-Mac script from `README.md` has run (Xcode CLT, Homebrew, yadm, dotfiles
  cloned, `yadm bootstrap` completed). If not, run it first and come back.
- `yadm status` is clean and `yadm alt` has been run. Two tracked files are yadm
  templates (`.config/herdr/config.toml##template`, `.codex/hooks.json##template`);
  `yadm alt` renders them with this machine's `$HOME`. Confirm both rendered files
  exist and contain no `/Users/shanekeulen`.
- These symlinks exist and resolve (yadm restores them):
  `~/.claude/CLAUDE.md`, `~/.pi/agent/AGENTS.md`, `~/.codex/AGENTS.md`,
  `~/.config/opencode/AGENTS.md` → `~/.agents/AGENTS.md`;
  `~/.claude/skills`, `~/.claude/_rules`, `~/.claude/agents` → `~/.agents/{skills,rules,agents}`.

## 1. CLI tools not covered by bootstrap

```sh
brew install worktrunk grip uv
brew install withgraphite/tap/graphite
brew install --cask codex
brew install nvm && mkdir -p "$HOME/.nvm"
```

Then Node and the npm globals the agents rely on:

```sh
source "$HOME/.nvm/nvm.sh" && nvm install 24.7.0 && nvm alias default 24.7.0
npm install -g @anthropic-ai/claude-code @earendil-works/pi-coding-agent pi-subagents \
  hunkdiff agent-browser mcporter @mariozechner/claude-trace pnpm
uv tool install claude-tap
```

Already installed by bootstrap: `rtk`, `wedow/tools/ticket` (provides `tk`), `gh`,
`jq`, `fzf`, `ripgrep`, `fd`, `gitleaks`, `tmux`, `neovim`, kitty, Raycast, the
`claude` and `codex-app` desktop casks.

## 2. herdr

```sh
curl -fsSL https://herdr.dev/install.sh | sh
herdr --version
herdr integration install claude
herdr integration install codex
herdr integration install pi
herdr integration status
```

The integrations write hook files that yadm already tracks
(`~/.claude/hooks/herdr-agent-state.sh`, `~/.codex/herdr-agent-state.sh`,
`~/.pi/agent/extensions/herdr-agent-state.ts`) and may rewrite `~/.claude/settings.json`
and `~/.codex/hooks.json` with absolute paths. After installing, restore the tracked
versions so the `$HOME`-relative forms win:

```sh
yadm checkout -- .claude/settings.json
yadm alt
yadm status --porcelain -- .claude .codex .pi/agent .config/herdr
```

The last command should print nothing. Config lives in `~/.config/herdr/config.toml`
(rendered from the template; prefix is `ctrl+a`, worktrees under `~/.herdr/worktrees`).
The `prefix+…` popup key runs `~/.config/herdr/new-worktree.sh`, which needs `wt`
(worktrunk), `jq` and `herdr` on `PATH`.

## 3. Logins (human)

Run each once in a terminal and let Shane complete the browser flow:

```sh
claude          # Anthropic login; the zsh `claude` wrapper routes through claude-tap
codex login
pi              # writes ~/.pi/agent/auth.json (never tracked)
gh auth login
gt auth         # Graphite, optional
```

## 4. Verify

```sh
type claude oclaude wt         # zsh functions from .zshrc
herdr --version; wt --version; gt --version; tk --version; rtk --version
hunk --version; agent-browser --version; claude-tap --version; grip --version
ls -la ~/.claude/CLAUDE.md ~/.claude/skills ~/.agents/skills
```

Open `herdr` in any git repo, press the worktree popup key, create a throwaway
branch, and confirm a workspace opens on it. Then `wt remove` the branch.

## 5. What is intentionally not here

- Work-only rules and skills (TRM, Crystal, Jira, Notion, PSA triage, flag-batch,
  query-* skills, topstep-tools, trm-release) and the `sdlc-*`/`launchpad-apps`
  symlinks. They live on the work machine only. `~/.agents/AGENTS.md` still
  references some of them; those lines are inert without the files.
- `~/.codex/config.toml` (work project trust list and MCP servers). Create a minimal
  one here if Codex is used: `approval_policy`, `sandbox_mode`, `model`.
- `~/.config/worktrunk/config.toml` is tracked without any `[projects]` blocks; add
  per-repo blocks locally for personal repos as needed.
- `~/.zshrc.trm-cli` is sourced only if present; its absence is fine.
- Secrets: `.npmrc` and `~/.config/licenses/*` come from yadm encrypt (GPG prompt
  during bootstrap). Agent auth files are never tracked.
