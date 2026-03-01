# secret-guard

Pi coding agent extension that prevents secret values from leaking into the LLM context.

## How it works

**Smart redaction, not blocking.** All tool output is scanned and secret values are automatically redacted. Config values (ports, hostnames, booleans, local connection strings) stay visible for debugging.

You can freely `read`, `cat`, `grep` any file — `.env` files, private keys, SSH configs, AWS credentials, anything. Secrets are replaced with `<REDACTED>` before the LLM ever sees them.

Secret detection is powered by:
- **221 gitleaks rules** (`gitleaks-rules.json`) — provider-specific token prefixes (AWS, Stripe, GitHub, Anthropic, Slack, etc.)
- **Key name heuristics** — `SECRET`, `PASSWORD`, `TOKEN`, `API_KEY`, etc.
- **Value shape analysis** — long random strings, embedded credentials, remote connection strings
- **Safe value recognition** — booleans, numbers, env names, localhost URLs, common dev defaults

## Commands

| Command | Description |
|---|---|
| `/secrets` | Show status |
| `/secrets-copy` | Copy a variable between .env files (value never shown) |

## Performance

**Optimized keyword pre-filter** finds all ~250 secret-related keywords using V8's SIMD-accelerated `String.indexOf()`. Only rules whose keywords appear in the text are tested — typically 2-5 regexes instead of 221. Non-env output (code, logs, file listings) skips the per-line parser entirely.

Typical performance on a modern Mac:
- 50KB code output: ~2ms
- 23KB clean .env: ~2ms
- Small tool output: <0.1ms

## Files

- `index.ts` — extension entry, event handlers, commands
- `patterns.ts` — classification pipeline (first match wins)
- `gitleaks.ts` — loads gitleaks-rules.json, keyword pre-filter + regex matching
- `gitleaks-rules.json` — 221 rules extracted from gitleaks
- `redaction.ts` — text redaction with fast-path
- `types.ts` — shared types
