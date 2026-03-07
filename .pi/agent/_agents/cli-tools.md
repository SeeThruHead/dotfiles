# CLI Tools Reference

Searchable index of CLI commands available in this environment. Grep this file to find the right tool for a task.

## Custom Scripts (~/.local/bin)

| Command | Description | Interactive | Notes |
|---------|-------------|:-----------:|-------|
| `git-psi` | Push selected commits rebased onto target | yes | fzf picker |
| `git-recent` | Switch to recent branch with diff preview | yes | fzf picker |
| `git-rfe` | Explore reflog with diff preview | yes | fzf picker |
| `img` | Browse and preview images with chafa | yes | j/k navigation |
| `pi-sandbox` | Run pi in Docker sandbox against current dir | no | |
| `wt-recent` | Switch git worktree with diff preview | yes | fzf picker |

## Dotfile Management

| Command | Description | Notes |
|---------|-------------|-------|
| `yadm` | Git wrapper for dotfiles (worktree=HOME) | Run `yadm --help` for usage. NEVER `yadm status -u` without path filter — hangs |

## Ticket System

| Command | Description | Notes |
|---------|-------------|-------|
| `tk` | Minimal ticket system with dependency tracking | Run `tk --help` for usage. Tickets in `.tickets/` |

## Shell Aliases

See `~/.zshrc` for full list. Key ones: `dc`=docker-compose, `gs`=git status, `ga`=git add --all, `ls`/`ll`/`lt`=eza.

## Git Aliases

See `~/.config/git/aliases`. Key ones: `git fsh` (fetch+rebase), `git pushf` (force-push-with-lease), `git rct` (recent branches).
