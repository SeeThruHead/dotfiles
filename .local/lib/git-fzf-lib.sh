#!/usr/bin/env bash
# git-fzf-lib.sh — shared base for fzf-based git tools
# Source this from git-recent, git-rfe, git-psi, etc.
#
# Provides:
#   FZF_GIT_DEFAULTS   — standard fzf flags
#   git_commit_preview  — preview script for a commit hash
#   git_branch_preview  — preview script for a branch name
#   SEPARATOR           — visual divider for preview panes

SEPARATOR='───────────────────────────────────────────────────'

FZF_GIT_DEFAULTS=(
  --ansi
  --no-sort
  --reverse
  --bind="j:down,k:up"
)

# Preview a single commit by hash.
# Usage in fzf --preview: source git-fzf-lib.sh; git_commit_preview <hash>
git_commit_preview() {
  local hash="$1"
  printf '\e[1;33m%s\e[0m \e[1m%s\e[0m\n' "$hash" "$(git log --format='%s' -1 "$hash" 2>/dev/null)"
  echo
  printf '\e[2mAuthor:\e[0m  %s\n' "$(git log --format='%an <%ae>' -1 "$hash" 2>/dev/null)"
  printf '\e[2mDate:\e[0m    %s\n' "$(git log --format='%cr' -1 "$hash" 2>/dev/null)"
  local body
  body=$(git log --format='%b' -1 "$hash" 2>/dev/null)
  if [[ -n "$body" ]]; then
    echo
    printf '\e[2m%s\e[0m\n' "$body"
  fi
  echo
  printf '\e[2m%s\e[0m\n' "$SEPARATOR"
  echo
  git diff --stat --color=always "$hash"^ "$hash" 2>/dev/null
  echo
  printf '\e[2m%s\e[0m\n' "$SEPARATOR"
  echo
  git diff --color=always "$hash"^ "$hash" 2>/dev/null
}

# Preview a branch — shows tip info + diff against default branch.
# Usage in fzf --preview: source git-fzf-lib.sh; git_branch_preview <branch>
git_branch_preview() {
  local name="$1"
  printf '\e[1;33m%s\e[0m\n' "$name"
  echo
  printf '\e[2mTip:\e[0m     %s\n' "$(git log --format='%h %s' -1 "$name" 2>/dev/null)"
  printf '\e[2mAuthor:\e[0m  %s\n' "$(git log --format='%an' -1 "$name" 2>/dev/null)"
  printf '\e[2mDate:\e[0m    %s\n' "$(git log --format='%cr' -1 "$name" 2>/dev/null)"
  local body
  body=$(git log --format='%b' -1 "$name" 2>/dev/null)
  if [[ -n "$body" ]]; then
    echo
    printf '\e[2m%s\e[0m\n' "$body"
  fi
  echo
  printf '\e[2m%s\e[0m\n' "$SEPARATOR"
  echo
  local base
  base=$(git merge-base main "$name" 2>/dev/null || git merge-base master "$name" 2>/dev/null || echo "")
  if [[ -n "$base" ]]; then
    local ahead
    ahead=$(git rev-list --count "$base".."$name" 2>/dev/null || echo "0")
    printf '\e[2m%s commit(s) ahead of default branch\e[0m\n\n' "$ahead"
    git diff --stat --color=always "$base".."$name" 2>/dev/null
    echo
    printf '\e[2m%s\e[0m\n' "$SEPARATOR"
    echo
    git diff --color=always "$base".."$name" 2>/dev/null
  else
    git log --oneline --color=always -10 "$name" 2>/dev/null
  fi
}

# Resolve the default branch for the repo (main, master, etc.)
# Checks: git config psi.base > remote HEAD > origin/main > origin/master > prompt
git_default_branch() {
  local remote="${1:-origin}"

  local configured
  configured=$(git config --local psi.base 2>/dev/null || true)
  if [[ -n "$configured" ]]; then
    echo "$configured"
    return
  fi

  local remote_head
  remote_head=$(git symbolic-ref "refs/remotes/$remote/HEAD" 2>/dev/null || true)
  if [[ -n "$remote_head" ]]; then
    echo "${remote_head##*/}"
    return
  fi

  if git show-ref --verify --quiet "refs/remotes/$remote/main" 2>/dev/null; then
    echo "main"
    return
  fi
  if git show-ref --verify --quiet "refs/remotes/$remote/master" 2>/dev/null; then
    echo "master"
    return
  fi

  echo "Could not detect default branch." >&2
  read -rp "Base branch for this repo (e.g. main, master): " branch </dev/tty
  if [[ -z "$branch" ]]; then
    echo "No branch specified. Aborting." >&2
    exit 1
  fi
  git config --local psi.base "$branch"
  echo "Saved psi.base=$branch for this repo." >&2
  echo "$branch"
}
