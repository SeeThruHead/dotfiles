# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Ensure Homebrew is in PATH (for non-login interactive shells)
if [[ -z "$HOMEBREW_PREFIX" ]]; then
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# Aliases
alias dc="docker-compose"
alias gs="git status"
alias ga="git add --all"
alias dash="gh dash"

# Go
[[ -d ~/go/bin ]] && export PATH="$PATH:$HOME/go/bin"

# Python (use whatever version is available via brew)
local python_path="$HOMEBREW_PREFIX/opt/python@3.14/libexec/bin"
[[ -d "$python_path" ]] && export PATH="$python_path:$PATH"

# Bun
export BUN_INSTALL="$HOME/.bun"
[[ -d "$BUN_INSTALL" ]] && export PATH="$BUN_INSTALL/bin:$PATH"
[[ -s "$BUN_INSTALL/_bun" ]] && source "$BUN_INSTALL/_bun"

# Local bin
[[ -d "$HOME/.local/bin" ]] && export PATH="$HOME/.local/bin:$PATH"

# Powerlevel10k prompt
# Install on new machine: git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/powerlevel10k
source ~/powerlevel10k/powerlevel10k.zsh-theme
[[ -f ~/.p10k.zsh ]] && source ~/.p10k.zsh

# Dotfiles bin
[[ -d "$HOME/.dotfiles/bin" ]] && export PATH="$HOME/.dotfiles/bin:$PATH"

# Interactive shell tools
if [[ $- == *i* ]]; then
  # eza (modern ls)
  alias ls='eza --icons --grid --group-directories-first'
  alias ll='eza -la --icons --git'
  alias lt='eza --tree --level=2 --icons'

  alias cat='bat'
  alias mactop='sudo mactop'
fi

# zoxide (smart cd)
eval "$(zoxide init zsh)"

# tmux rct — fuzzy find and attach to a tmux session
tmux() {
  if [[ "$1" == "rct" ]]; then
    local session
    session=$(~/.local/bin/tmux-recent)
    [[ -n "$session" ]] && command tmux switch-client -t "$session" 2>/dev/null || command tmux attach -t "$session"
  else
    command tmux "$@"
  fi
}
compdef tmux=tmux

if command -v wt >/dev/null 2>&1; then
  eval "$(command wt config shell init zsh)"
  # Save the shell-integration wt function, wrap with custom subcommands
  functions[_wt_inner]="$functions[wt]"
  wt() {
    if [[ "$1" == "rct" ]]; then
      local branch
      branch=$(~/.local/bin/wt-recent)
      [[ -n "$branch" ]] && _wt_inner switch "$branch"
    else
      _wt_inner "$@"
    fi
  }
  compdef wt=wt
fi
