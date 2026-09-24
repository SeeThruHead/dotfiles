---
name: stack-prs
description: Create and maintain stacked branches/PRs with Graphite (gt) in Shane's repos. Use when branching off an existing (often still-open) PR branch to keep working, when a parent branch rebases and children need restacking, or when opening a chain of dependent PRs. Keeps gt local-only (nothing committed), respects the heavy pre-push hook, and runs tests sequentially so the machine doesn't thrash.
---

# stack-prs — Stacked branches/PRs with gt

Graphite (`gt`, /opt/homebrew/bin/gt) gives layered branches that restack when a parent changes, the "linked-list of branches" model. Use it instead of hand-rolled `git rebase --onto`.

## Ground rules

- gt is personal and local. Its state lives in the common `.git/.graphite_repo_config` and git refs, never in tracked files. Never commit graphite config. `.graphite_*` is already in `.git/info/exclude`.
- These repos use linked worktrees, so `.git` is a file. The gt config sits in the common dir (`git rev-parse --git-common-dir`), not the worktree.
- Branch names: `sk/<kebab-desc>`. Cut the base of a stack from freshly-fetched `origin/main`, never stale local `main`.
- Never rename an existing branch. Never force-push someone else's branch.

## Setup (once per repo)

```
gt init --trunk main --no-interactive
gt track --parent main <existing-branch>   # make an already-pushed branch stack-aware
```
`gt auth` is only needed for `gt submit` (talks to Graphite's API). Local stacking (create/restack/sync) works without it.

## Core loop

```
gt log short                 # see the stack
gt create sk/<desc> -m "msg" # new layer on top of current branch
gt modify / gt amend         # edit current layer; children auto-restack
gt up / gt down / gt checkout <b>
gt restack                   # rebase the stack after a parent changed
gt sync                      # pull main, delete merged branches, cascade-restack
gt submit                    # push stack + open/update one PR per layer
```

## When the parent PR rebases (the whole point)

If the base of the stack gets rebased onto `origin/main` (or a lower PR merges), restack the children onto the new tip instead of doing it by hand:
```
git fetch origin
gt sync        # or: gt restack, from the affected branch
```
gt moves each child onto its parent's new tip. Verify with `gt log short`, then `gt submit` to update the PRs.

## This repo's gotchas

- Heavy pre-push hook. `gt submit`/`gt push` invoke `git push`, which runs the crystal typecheck + full test suite and can OOM. After a rebase/restack it fans checks across the whole branch. Disable it for the push, the hook supports it:
  ```
  DISABLE_PRE_PUSH_CHECKS=true gt submit --no-interactive
  ```
  CI re-runs everything on the PRs anyway. Do NOT bypass to hide a real failure; only bypass the redundant local heavyweight run.
- Tests: run sequentially, never the full parallel suite (74 files fan out to every core and thrash the machine; symptom is one-timeout-per-file failures that aren't real). Scope to the changed files and cap workers, e.g. `--maxWorkers=2` or `--pool=forks --poolOptions.forks.singleFork`. Prefer routing to the test-runner subagent.
- Trust CI as the source of truth for green. If local fails but CI's `test`/`typecheck` pass, suspect local contention, not breakage.

## Leak check before submitting

A stack must not absorb unrelated changes from a rebase. Before `gt submit`, confirm each layer's diff is only its own files:
```
git diff --name-only <parent>...<branch>
```
Never "fix" broken main or other people's files inside a stacked PR.

## Submitting (internal GitHub = fine)

GitHub is an internal system in these repos, so opening/updating PRs via `gt submit` is normal work, not an external send. Still surface the plan (branch names, PR titles, base branches) before submitting a fresh stack.
