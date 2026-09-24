---
name: sidediff
description: Walk Shane through code in the sidediff browser review (GitHub-style diff with a notes column) and hold a spoken conversation while doing it. Use when he asks for a guided tour, to show or explain code in sidediff, to talk through a diff, or when a sidediff server is running and he speaks through its mic.
---

# sidediff

`sidediff` (repo `~/code/sidediff`, on PATH) serves a diff in the browser. Run commands from inside the repository being reviewed; they find the running server through `<git dir>/sidediff/server.json`.

## Drive the view

- `sidediff show <file>:<line>` scroll there. `--side old` for the old side.
- `sidediff highlight <file>:<a>-<b> [--text <substring>]` select lines and mark text.
- `sidediff explain <file>:<a>-<b> --title "<short>" --body "<plain explanation>" [--speak]` zoomed popover over the diff.
- `sidediff say "<text>"` speak and caption. Keep spoken text short and conversational.
- `sidediff clear` remove highlights, popovers and captions.
- `sidediff tour <steps.json>` load a scripted tour; each step is `{ "type": "show|highlight|explain|say|clear", ...same fields }`. Write tour files to `~/tmp/investigations/<slug>/`.
- `sidediff where` what he is looking at now.
- Notes: `sidediff note add|apply --stdin|list|rm|clear`.

Line numbers are the file's real line numbers on that side of the diff. Check them with `sed -n` before pointing.

## Conversation loop

He talks through the page's Talk button (`m`). Each finished sentence becomes an utterance.

1. Start a background listener: `sidediff listen --after <last id> --wait 3600` with the harness's background mode. It returns `<id>\t<text>` when he speaks.
2. When it completes, answer by driving the view (`show`/`highlight`/`explain`) and `say` a short spoken reply. Put detail in `explain`, not in speech.
3. Immediately start the next listener with `--after` set to the id you just handled. Never leave him talking to nothing.

Speech recognition is the browser's cloud service, so do not narrate secrets or customer data aloud.
