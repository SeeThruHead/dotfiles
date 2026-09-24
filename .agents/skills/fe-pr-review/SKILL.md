---
name: fe-pr-review
description: Review a front-end / React PR against our standards (ui-kit-first, reusable primitives pushed into ui-kit, state hidden in hooks, pure component + hook + container split, forms as a single onChange, inline props). Use when asked to review a front-end / React / admin / app / ui-kit PR or branch. Produces inline review comments.
---

# fe-pr-review — Review front-end PRs to our standards

Self-contained. Judge every FE PR against the criteria below WITHOUT being
asked item by item.

## Process

1. **Get the real diff.** `gh pr view <n> --json title,body,files` and
   `gh pr diff <n>`. If the local checkout is stale/diverged, read from the PR
   head: `gh pr view <n> --json headRefOid,headRefName`, then
   `git show origin/<branch>:<path>`. Confirm the head SHA before anchoring
   comments; line numbers must match the `commit_id` you post against.
2. **Map the architecture first** (pure component / hook / container split?),
   before nitpicking lines.
3. **Quantify, don't vibe:**
   - Bare HTML per file:
     `git show <ref>:<file> | rg -o -e '<div' -e '<span' -e '<button' -e '<section' -e '<header' -e '<footer' -e '<p[ >]' -e '<h[1-6][ >]' | sort | uniq -c`
   - `useState` per component: `rg -c 'useState' <file>`
   - Compare against already-merged sibling components as the bar (usually
     ui-kit-first, zero raw buttons).
4. **Check ui-kit inventory** before accepting anything hand-rolled:
   `packages/ui-kit/src/components/base/index.ts` and
   `.../application/index.ts`. "Not in ui-kit yet" is a claim to verify.
5. **Draft comments** (voice below) and ALWAYS walk through them with Shane
   first. Never post without his explicit approval, even on internal repos.
   Present the full set, wait for his go-ahead (or edits), then post.
6. **Post once, only after approval:** one review, inline comments, submitted
   as "Comment" (not Approve/Request-changes) unless told. NO severity prefixes
   (`blocking:`/`nit:`) unless explicitly asked for.

## Criteria

Read `fe-pr-review.md` (sibling file in this skill dir) and apply every item.
It is the single source of truth for the standards (architecture, ui-kit,
code, review mechanics) and is kept in sync with the write-time rule. Do not
duplicate its contents here; load it.

## Comment voice

Open with the observation, never praise. State the reason inline, close with
one plain ask ("could we", "what do you think", "curious whether"). Short by
default; a real design concern gets a paragraph, a nit gets a clause. Peer,
not grader. Lowercase/casual fine. No em dashes. No loaded labels ("dead
work", "wrong"). Reference concrete files/symbols and related PRs by name;
code blocks when a concrete alternative helps. Matter-of-fact but not curt:
no bare imperatives ("Delete this"), say "i think we can drop this" + why. A
hand-rolled workaround usually means the clean path fought them, so ask ("was
this to get around X?"), name the fix, offer to be wrong. Shane strongly prefers
array methods over loops (strong preference, not a hard rule): a for/while loop
only when clearly superior; if the rewrite is merely equivalent, prefer the
method and raise it for this PR, don't undersell it as "style-only" or oversell
it as required. See the `pr-review-comments` skill for the full voice.

## Posting cheatsheet

- One review with inline comments:
  `gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input <json>`
  where json = `{commit_id, event:"COMMENT", body, comments:[{path,line,side:"RIGHT",body}]}`.
- Threaded reply:
  `gh api repos/<owner>/<repo>/pulls/comments/<id>/replies --method POST -f body="..."`.
- Edit a posted comment:
  `gh api repos/<owner>/<repo>/pulls/comments/<id> --method PATCH -f body="..."`.
