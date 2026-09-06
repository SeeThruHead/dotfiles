---
name: kb-consolidate
description: "Consolidate Shane's knowledge vault: keep links up to date and add newly-warranted links after notes are added/changed. Use for a manual 'do a pass through' or when the nightly job hands you candidates. Token-frugal by design: the deterministic work is done by `kb audit`; you only spend judgment on the small set of ambiguous candidates it surfaces, never by re-reading the whole vault."
allowed-tools: Bash(kb:*)
---

# kb-consolidate — keep the graph healthy, cheaply

Consolidation = make sure relations are complete and correct as the vault grows. The expensive part
(scanning every note) is deterministic and free via `kb audit`; your LLM judgment is spent ONLY on
the handful of candidates it can't decide. Never read the whole vault to consolidate.

## The cost rule

1. `kb audit --fix` first — FREE. Auto-mutualizes inverse relations (symmetric + extends/refines).
   This alone keeps mechanical links up to date; run it every pass.
2. Then look ONLY at what `kb audit` reports. Do not open notes you weren't pointed at.
3. Prefer `kb audit --since <YYYY-MM-DD>` to scope to notes changed since a date (the nightly job
   passes yesterday), so work scales with change, not vault size.

## Pass workflow

```bash
kb audit --fix              # free: fix inverse links, then report what needs judgment
kb audit --json --since 2026-07-24   # machine-readable, scoped to recent changes
```

`kb audit` reports three judgment categories:

- **unlinked-mention** — a note's prose names another note but doesn't link it. Decide if a real
  relation exists; if so, `kb link "<note>" <relation> "<mentioned>"` with the MOST accurate relation
  (`informs`/`example_of`/`applies_to`/`feeds`/`extends`/`contradicts`/`tension_with`, not a lazy
  `relates_to`). If the mention is incidental, skip it — a missing link is fine, a wrong link is not.
- **orphan** — no relations and no backlinks. Connect it to the theme/effort/source it belongs to.
  If nothing fits, leave it (don't invent a link just to satisfy the check).
- **broken-link** — a `[[target]]` resolving to nothing. Either the target note should exist (create
  it via the `kb` skill) or the link text is wrong. Do NOT delete content to "fix" it; flag it.

## Rules

- Link edits only. Do NOT create notes, rewrite bodies, or add bullets during consolidation.
- One `kb link` per real relation; skip anything ambiguous rather than guessing.
- Relations must resolve (both notes exist) — `kb link` enforces this; if it fails, the target is
  missing, which is itself the finding.
- Finish with `kb audit` (no flags) to confirm the judgment queue shrank.
- Restraint beats coverage: the graph is valuable because its links are trustworthy, not dense.
