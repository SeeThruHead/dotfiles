---
name: kb-dev
description: "Build, extend, and operate the knowledge-vault system itself (the `kb` CLI codebase and the Quartz server) — NOT day-to-day note capture (use the `kb` skill for that). Use when adding/changing a kb command, editing the ontology, touching the Effect/Vault/Schema code, typechecking, or starting/restarting/persisting the Quartz site. Stack: Bun + TypeScript, all Effect (@effect/cli, @effect/platform-bun, Schema, Data.TaggedError), Quartz 5 for the web view."
allowed-tools: Bash(kb:*), Bash(bun:*), Bash(bunx:*), Bash(npx:*), Bash(curl:*), Bash(lsof:*), Read, Edit, Write
---

# kb-dev — building the vault system

The `kb` CLI and the Quartz site that render Shane's knowledge vault. All Bun + TypeScript,
**fully Effect**. For using the vault (capturing notes), use the `kb` skill instead.

## Layout

- `~/knowledge/` — the vault. Note-type folders: `musings/ ideas/ sources/ themes/ efforts/
  concepts/`. `index.md` is the Quartz home. `_archive/` = legacy pre-tool notes.
- `~/knowledge/kb/` — the CLI package (Bun). Source in `src/`:
  - `ontology.ts` — **single source of truth**: `noteTypes`/`bulletKinds`/`relationKinds`/`statuses`
    as `as const` arrays + `Schema.Literal(...)` derived from them, `folderOf`, `inverseOf`.
  - `note.ts` — `Frontmatter` Schema, pure `splitFrontmatter` (hand-rolled frontmatter parse) +
    `serializeNote`.
  - `sections.ts` — pure `addUnderHeading` / `hasLine` for `## Thinking` / `## Relations`.
  - `errors.ts` — `Data.TaggedError` types (`NoteNotFound`, `NoteExists`, `InvalidInput`, `DuplicateEntry`).
  - `vault.ts` — `Vault` via `Effect.Service` over `@effect/platform` `FileSystem`/`Path`
    (`dependencies: [BunContext.layer]`). Methods: `pathFor`, `readNote`, `listNotes`, `resolve`,
    `create`, `update`. `listNotes` scans only the six type folders.
  - `kb.ts` — `@effect/cli` commands, provided `Vault.Default` + `BunContext.layer`, run via
    `BunRuntime.runMain`.
- `~/knowledge/.quartz/` — Quartz 5 checkout (ignored by `kb`). Config `quartz.config.yaml`
  (ignorePatterns exclude the tooling dirs). Home page comes from `~/knowledge/index.md`.

`kb` on `$PATH` is a wrapper at `~/.bun/bin/kb` → `bun run ~/knowledge/kb/src/kb.ts "$@"`.

## Code style (Shane's rules — non-negotiable)

Functional only: no `for`/`while` (use `map`/`filter`/`reduce`/`Effect.forEach`), `const` only, no
mutation (no `.push`/reassignment), NO code comments (rationale goes in the PR/chat). Effect
idioms: `Effect.gen`, `Schema` for all decoding, `Data.TaggedError` for failures, services via
`Effect.Service`, `Layer` for wiring. Keep IO in Effect (FileSystem/Path), keep parsing pure.

## Add a new command (recipe)

1. If it introduces a new type/kind/relation, add it to the `as const` array in `ontology.ts` ONLY —
   the Schema and CLI validation flow from there.
2. Define a `Command.make("name", { ...Args/Options }, (args) => Effect.gen(...))` in `kb.ts`. Use
   `Args.text` + `decodeArg(SomeSchema, value)` to validate against the ontology; `Options.choice`
   for closed sets, `Options.repeated` for lists, `Options.optional`/`Options.boolean` for flags.
3. Do IO through the `Vault` service (`yield* Vault`); add a method to `vault.ts` if needed rather
   than reaching for `FileSystem` in the command.
4. Register it in the `Command.withSubcommands([...])` array.
5. `cd ~/knowledge/kb && bunx tsc --noEmit` must be clean (strict, `exactOptionalPropertyTypes`,
   `noUncheckedIndexedAccess`). Then smoke-test the command.

## Typecheck / smoke

```bash
cd ~/knowledge/kb && bunx tsc --noEmit && echo clean
kb list && kb validate
```

## Quartz server

```bash
# is it up?
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/     # 200 = up
# start (foreground blocks; run detached for always-on)
cd ~/knowledge/.quartz && npx quartz build --serve -d ~/knowledge --port 8080
# who's on 8080
lsof -ti tcp:8080
```

Quartz hot-reloads on file change (sub-second on this vault), so any `kb` write shows up live — no
restart needed. It renders Obsidian-flavored markdown, so the `[[wikilinks]]`, block refs `^id`, and
transclusions `![[Note#^id]]` the CLI writes all resolve, with graph + backlinks + search.

Note: `-d ~/knowledge` scans the vault; `.quartz/`, `kb/`, `_archive/` etc. are excluded via
`ignorePatterns` in `quartz.config.yaml`. Keep that list in sync if you add tooling dirs.

## Not yet built (roadmap)

- launchd agent to make the Quartz server truly always-on (survive reboot, restart on crash).
- YouTube ingestion: TS script (no Python/yt-dlp — use `youtubei.js` for transcripts) that writes a
  `source` note via `kb`, cron'd through launchd + `claude -p`.
- Making `~/knowledge` a git repo (Quartz warns; also gives history/backup).
