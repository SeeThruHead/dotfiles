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

# z - directory jumping
[[ -f "$HOMEBREW_PREFIX/etc/profile.d/z.sh" ]] && . "$HOMEBREW_PREFIX/etc/profile.d/z.sh"

# Aliases
alias dc="docker-compose"
alias gs="git status"
alias ga="git add --all"

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
