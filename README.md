# dotfiles

Managed with [yadm](https://yadm.io). Ansible-based bootstrap for full macOS workstation setup.

## Fresh Mac Setup

```bash
curl -sL https://raw.githubusercontent.com/SeeThruHead/dotfiles/main/.config/yadm/setup.sh | bash
```

This will:
1. Install Xcode CLI tools
2. Install Homebrew
3. Install yadm and clone dotfiles
4. Decrypt secrets (`.npmrc` etc — will prompt for GPG passphrase)
5. Run ansible bootstrap — installs brew packages, casks, sets macOS defaults, clones p10k/tpm, installs tmux plugins, pi extension deps

## What's Included

**Brew packages:** bat, btop, eza, fd, fzf, gh, go, htop, jq, neovim, ripgrep, tmux, zoxide, zig, and more

**Cask apps:** 1Password, Amethyst, BetterTouchTool, Discord, Ghostty, Karabiner, OBS, Raycast, Signal, Slack, Stats, SuperWhisper, Tailscale, VS Code, VLC

**macOS defaults:** Dock (autohide, left, no recents), fast key repeat, disable autocorrect/autocapitalize, dark mode, screenshots to `~/Screenshots`

**Configs:** kitty, tmux, neovim (LazyVim), p10k prompt, karabiner, zsh, git (delta pager)

## Re-running Bootstrap

```bash
yadm bootstrap
```

Idempotent — safe to run anytime.
