#!/usr/bin/env bash
set -uo pipefail

WT=/opt/homebrew/bin/wt
HERDR="$HOME/.local/bin/herdr"

LOG="$HOME/tmp/herdr-new-worktree.log"
mkdir -p "$HOME/tmp"
exec > >(tee -a "$LOG") 2>&1
printf '\n===== %s cwd=%s =====\n' "$(date -Iseconds)" "$PWD"

fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; printf 'press enter to close...' >&2; read -r _; exit 1; }

git rev-parse --git-common-dir >/dev/null 2>&1 || fail "not inside a git repository: $PWD"

common=$(git rev-parse --path-format=absolute --git-common-dir)
root=$(dirname "$common")

printf '\033[1mrepo:\033[0m %s\n' "$root"
printf '\033[1mbranch name:\033[0m '
read -r branch
[ -n "$branch" ] || fail "no branch name given"

default=$(git -C "$root" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed "s|^refs/remotes/origin/||")
[ -n "$default" ] || default=main

printf "\n==> fetching origin/%s\n" "$default"
perl -e 'alarm 90; exec @ARGV' -- git -C "$root" fetch origin "$default" || fail "git fetch origin $default failed"

perl -e 'alarm 90; exec @ARGV' -- git -C "$root" fetch origin --prune >/dev/null 2>&1 \
  || printf '\033[33mwarning: prune failed (stale or case-colliding remote refs), continuing\033[0m\n'

printf "\n==> wt switch --create %s (base origin/%s)\n\n" "$branch" "$default"
"$WT" -C "$root" -v switch --create "$branch" --base "origin/$default" || fail "wt switch --create failed"

path=$("$WT" -C "$root" list --format json 2>/dev/null \
  | jq -r --arg b "$branch" '.[] | select(.branch == $b and .is_main != true) | .path' \
  | head -1)

[ -n "$path" ] && [ -d "$path" ] || fail "could not resolve worktree path for branch: $branch"

printf '\n==> opening space at %s\n' "$path"
"$HERDR" worktree open --cwd "$root" --path "$path" --label "$branch" --focus || fail "herdr worktree open failed"
