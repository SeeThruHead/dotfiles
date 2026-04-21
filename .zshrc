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
alias claude="claude --dangerously-skip-permissions"

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
  alias ls='eza --icons -lh --group-directories-first'
  alias ll='eza -la --icons --git'
  alias lt='eza --tree --level=2 --icons'

  alias cat='bat'
  alias mactop='sudo mactop'
fi

# zoxide (smart cd)
eval "$(zoxide init zsh)"

# Completion system (required for compdef below)
autoload -Uz compinit && compinit

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
    elif [[ "$1" == "prune" ]]; then
      # Interactively pick worktrees to remove.
      #   wt prune                → only branches merged into origin/<base> (incl. squash)
      #   wt prune -i|--interactive → pick from every non-main worktree; uses --force
      local show_all=0 prompt_label="prune" remove_flag="-D"
      if [[ "$2" == "--interactive" || "$2" == "-i" ]]; then
        show_all=1
        prompt_label="pick"
        remove_flag="--force"
      fi

      local base_branch
      base_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|^refs/remotes/origin/||')
      [[ -z "$base_branch" ]] && base_branch=main

      local json
      json=$(command wt list --format json 2>/dev/null) || {
        echo "wt list failed." >&2
        return 1
      }

      local -a branches
      branches=("${(@f)$(print -r -- "$json" | jq -r --arg base "$base_branch" '
        .[]
        | select(.is_main != true)
        | select(.worktree.detached != true)
        | select(.branch != null and .branch != $base)
        | .branch
      ')}")

      local -a candidates
      if (( show_all )); then
        candidates=("${branches[@]}")
      else
        # Detect merges by patch-id, not ancestry — catches squash/rebase merges.
        local b merge_base tree synthetic cherry
        for b in "${branches[@]}"; do
          [[ -z "$b" ]] && continue
          merge_base=$(git merge-base "refs/remotes/origin/$base_branch" "refs/heads/$b" 2>/dev/null) || continue
          tree=$(git rev-parse "refs/heads/$b^{tree}" 2>/dev/null) || continue
          synthetic=$(git commit-tree "$tree" -p "$merge_base" -m _ 2>/dev/null) || continue
          cherry=$(git cherry "refs/remotes/origin/$base_branch" "$synthetic" 2>/dev/null)
          [[ "$cherry" == "-"* ]] && candidates+=("$b")
        done
      fi

      if (( ${#candidates[@]} == 0 )); then
        if (( show_all )); then
          echo "No worktrees to prune."
        else
          echo "No merged worktrees found (base: $base_branch). Try: wt prune -i"
        fi
        return 0
      fi

      local LIB_DIR="${HOME}/.local/lib"
      [[ -f "$LIB_DIR/fzf-lib.sh" ]] && source "$LIB_DIR/fzf-lib.sh"

      local header_text
      if (( show_all )); then
        header_text="tab: select  enter: FORCE REMOVE (discards dirty changes)  esc: cancel"
      else
        header_text="tab: select  enter: confirm  esc: cancel  (base: origin/$base_branch)"
      fi

      local -a picked
      picked=("${(@f)$(
        printf '%s\n' "${candidates[@]}" \
        | fzf \
            "${FZF_GIT_DEFAULTS[@]}" \
            --multi \
            --prompt="${prompt_label}> " \
            --header="$header_text" \
            --preview-window="right,60%,wrap" \
            --preview="
              source \"$LIB_DIR/fzf-lib.sh\"
              git_branch_preview {}
            "
      )}")

      if (( ${#picked[@]} == 0 )); then
        echo "Nothing selected."
        return 0
      fi

      if (( show_all )); then
        echo "About to FORCE remove (discards any uncommitted changes):"
        printf '  %s\n' "${picked[@]}"
        echo ""
        read -q "?Proceed? [y/N] " || { echo ""; return 0; }
        echo ""
      fi

      for b in "${picked[@]}"; do
        [[ -z "$b" ]] && continue
        echo "Removing $b..."
        _wt_inner remove "$remove_flag" "$b"
      done
    else
      _wt_inner "$@"
    fi
  }
  compdef wt=wt
fi

# Machine-local overrides (not tracked by yadm)
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local

# bun completions
[ -s "/Users/sth/.bun/_bun" ] && source "/Users/sth/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

[[ -s "$HOME/.moon/bin/env" ]] && . "$HOME/.moon/bin/env"
