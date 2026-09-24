---
name: rebase
description: Rebase a PR branch onto origin/main with linear history (no merge commits, ever), resolving conflicts to the spirit of the PR. Use when the user asks to rebase, update a branch, resolve conflicts, or get a PR mergeable. Handles lockfile conflicts by regenerating, verifies with tests, force-pushes with lease.
---

# Rebase a PR branch onto main

Goal state: the branch is `origin/main` plus the PR's commits replayed on top. Linear history, no merge commits. Merging main into the branch is never acceptable; if a merge is already in progress, `git merge --abort` and rebase instead.

## Procedure

1. `git fetch origin main <branch>`. Source of truth is `origin/main`, not local main (it lags).
2. Pick a safe checkout. If the current working tree is dirty with changes you didn't make, do NOT stash, reset, or switch branches there. This repo keeps per-branch worktrees as siblings (`<repo>.<branch-with-slashes-as-dashes>`); `git worktree add` will tell you if one already exists for the branch. Use it, or create a temp worktree. Leave the user's checkout untouched.
3. `git rebase origin/main`.
4. Resolve each conflict to the spirit of the PR (see below).
5. Verify (see below), then `git push --force-with-lease origin <branch>`. Never bare `--force`. Never rename the branch (kills the PR).

## Resolving to the spirit of the PR

Read the PR description and the branch's own diff first (`gh pr view <num> --json body`, `git diff origin/main...<branch>` before rebasing). The question for every conflict is: "what would this PR's change look like if it had been written against today's main?" Not "which side wins."

- Main is truth for everything the PR doesn't deliberately change. Take main's version of refactors, renames, and moved code, then re-apply the PR's intent on top of it.
- If the PR deletes something main has since modified, the deletion usually still stands; confirm main's modification wasn't a new consumer of the deleted thing before keeping the delete.
- If main deleted or moved something the PR modifies, port the PR's change to the new location; don't resurrect dead files.
- Never resolve a conflict by silently dropping part of the PR's change. If the PR's intent genuinely no longer applies on current main, stop and tell the user instead of guessing.

### Generated files and lockfiles

Never hand-merge conflict markers in generated files. Resolve the sources, then regenerate:

- `pnpm-lock.yaml`: with the conflicted lockfile still in place, run `pnpm install` — pnpm auto-resolves lockfile conflicts against the merged package.jsons. Then `git add pnpm-lock.yaml` and `git rebase --continue` (use `GIT_EDITOR=true` to skip the editor).
- Other generated artifacts (GraphQL schemas, API clients, snapshots): regenerate with the repo's generation script after resolving source conflicts.

## Verify before pushing

- Run the test files that CI reported failing, plus tests covering every file you touched during conflict resolution.
- A stale branch often fails CI on files the PR never touched because CI runs against the merge ref; rebasing onto current main usually fixes those for free. Confirm locally rather than assuming.
- Typecheck workspaces whose exports you changed.

After pushing, check `gh pr checks <num>` once CI has had time to run; don't declare the PR mergeable until checks are green.
