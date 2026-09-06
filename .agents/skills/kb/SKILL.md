---
name: kb
description: "Capture and connect Shane's thinking in his structured knowledge vault via the `kb` CLI. Use whenever he wants to record a musing/idea/take, distil a YouTube video / talk / book / article, relate a thought to his current work or long-running themes (functional programming, distributed systems, architecture, team training), or browse/traverse the graph. The vault is Obsidian-flavored markdown at ~/knowledge, served as a live Quartz wiki on http://localhost:8080. ALWAYS mutate the vault through `kb`, never by hand-editing markdown."
allowed-tools: Bash(kb:*), Read
---

# kb — structured knowledge vault

Shane's thinking, stored as a machine-traversable graph of Obsidian markdown at `~/knowledge`
(override with `KB_VAULT`). The `kb` CLI is the ONLY sanctioned way to mutate it — it enforces the
schema deterministically so notes never drift. A live Quartz wiki renders it at
http://localhost:8080 (graph, backlinks, search).

## The one rule

Never hand-write or Edit vault markdown. Every create/append/link goes through `kb`. If something
can't be expressed with a `kb` command, say so — don't route around the tool. (Shane may edit a file
inline himself; that's his prerogative, not yours.)

## Philosophy (get the framing right)

Nodes are **provisional** — these are musings, ruminations, half-thoughts, not "facts I believe."
Facts aren't things you believe; they are or they aren't. The value is the **connective tissue**:
how a thought relates to a talk he watched, a book, the code on his desk, his effort to train the
team, his interests in FP / architecture / distributed systems. Capture the relations, not prose.

## Ontology (fixed — the CLI rejects anything else)

Note **types**: `musing` (default atomic note, half-formed) · `idea` (a musing hardened into a
position) · `source` (his *distillation* of a video/talk/book/article — his take, not a summary) ·
`theme` (long-running interest; an anchor: Functional programming, Distributed systems, Architecture
and design, Team training) · `effort` (current work: Example Effort) · `concept` (a reusable
idea referenced across notes).

Body-bullet **kinds** (epistemically honest, never "fact"): `musing` · `take` · `tension` ·
`question` · `evidence`.

**Relations** (typed wikilinks — the whole point): `informs` · `relates_to` · `contradicts` ·
`tension_with` · `extends` · `refines` · `example_of` · `applies_to` · `feeds` · `from`.

**Status**: `seed` · `growing` · `evergreen` (default `seed`).

## Commands

```bash
kb new <type> "<title>" [--status seed|growing|evergreen] [--theme X]... [--effort Y]... [--tag T]...
kb add  <note> <musing|take|tension|question|evidence> "<text>"   # appends a typed bullet under ## Thinking
kb link <from> <relation> <to> [--note "gloss"] [--mutual]        # appends a typed wikilink under ## Relations
kb list [--type <t>] [--theme <x>]
kb show <note>          # prints body
kb path <note>          # prints file path
kb validate             # reports broken wikilinks across the vault
```

Notes resolve by title OR filename (case-insensitive), so `kb add "Example Effort" ...`
works. `--theme`/`--effort`/`--tag` repeat for multiple values.

## Referential integrity

`kb link` **fails** unless BOTH notes already exist — links can't dangle. So create the target
first, then link. `--mutual` also writes the inverse on the target, but only for relations that have
one: `contradicts`, `relates_to`, `tension_with` (symmetric), and `extends`↔`refines`. For the
others `--mutual` is a no-op.

## Capture workflow

When Shane hands you a thought, a talk, or a realisation:

1. **Pick the type.** A raw thought → `musing`. A position he's arguing → `idea`. A video/talk/book →
   `source`. Something referenced repeatedly → `concept`.
2. **Create it** (skip if `kb list` shows it exists): `kb new musing "..."` optionally tagging the
   `--theme`/`--effort` it belongs to.
3. **Add the thinking** as typed bullets: `kb add "<title>" take "..."`, `... tension "..."`,
   `... question "..."`. One bullet = one thought.
4. **Wire the graph** — this is the payoff. Link to the theme(s), the effort, the source, and any
   related note: `kb link "<title>" feeds "Functional programming"`,
   `kb link "<title>" applies_to "Example Effort"`,
   `kb link "<title>" from "<source note>"`. Create any missing target note first.
5. **`kb validate`** if you did a batch, to catch typos in link targets.

Anchors already exist: themes `Functional programming`, `Distributed systems`, `Architecture and
design`, `Team training`; effort `Example Effort`. Reuse them; make new anchors sparingly.

## Reading / traversing

- `kb list` / `kb list --theme "Functional programming"` to orient.
- `kb show "<note>"` to read one.
- Follow `## Relations` wikilinks to traverse; that graph is why the vault exists.
- The rendered wiki (graph, backlinks, search) is at http://localhost:8080.

## Don't

- Don't invent types, bullet kinds, or relations outside the lists above (the CLI rejects them).
- Don't write summaries as prose; write typed bullets + relations.
- Don't create a note just to link to it as a stub without at least one bullet of substance.
- Don't touch `~/knowledge/_archive/**` (legacy pre-tool notes, being ported).
