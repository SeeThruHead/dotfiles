# Git & PRs

- PR comments/reviews: collaborative tone, respect the author. Frame as suggestions/questions ("what do you think about", "could we"), not verdicts. No loaded labels ("dead work", "false contract", "wrong", "keep it dumb"); critique the code, never imply the person was careless. It's their PR; you're offering input, not grading it. Use the pr-review-comments skill to write/post in my voice (observation first, no praise preamble, concise, not AI-flavored).
- New branches `sk/<kebab-desc>`; never rename an existing branch (kills its PR).
- `git status` before any add/commit/push; never `git add -A` unverified.
- Never rm lockfiles or nuke node_modules; update incrementally.
- Local main lags: fetch and diff against `origin/main`. For PR review, source of truth is `gh pr diff <num>`.
- Commit messages state what changed; no diagnostic theories/speculation (that belongs in the PR).
