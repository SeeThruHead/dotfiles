# secret-guard

Pi coding agent extension that prevents secret values from leaking into the LLM context.

## How it works

**Smart redaction, not blocking.** You can freely `read`, `cat`, `grep` any `.env` file. Secret values are automatically redacted in tool output — config values (ports, hostnames, booleans, local connection strings) stay visible for debugging.

Secret detection is powered by:
- **221 gitleaks rules** (`gitleaks-rules.json`) — provider-specific token prefixes (AWS, Stripe, GitHub, Anthropic, Slack, etc.)
- **Key name heuristics** — `SECRET`, `PASSWORD`, `TOKEN`, `API_KEY`, etc.
- **Value shape analysis** — long random strings, embedded credentials, remote connection strings
- **Safe value recognition** — booleans, numbers, env names, localhost URLs, common dev defaults

## What gets blocked

| Category | Behavior |
|---|---|
| `.env` files | ✅ Readable — secrets auto-redacted, config visible |
| `~/.ssh/`, `~/.aws/`, `*.pem`, `*.key` | 🔒 Hard-blocked (not redactable) |
| `env`, `printenv`, `echo $VAR` | 🔒 Blocked (dumps process env) |
| Arbitrary tool output | ✅ Scanned for inline secret patterns |

## Commands

| Command | Description |
|---|---|
| `/secrets` | Show status and whitelist |
| `/secrets-copy` | Copy a variable between .env files (value never shown) |
| `/secrets-whitelist` | Allow a blocked file or command |
| `/secrets-clear` | Clear the whitelist |

## Performance

Keyword pre-filtering avoids running all 221 gitleaks regexes on every tool output. Only rules whose keywords appear in the text are tested. Non-env output (code, logs, file listings) skips the per-line parser entirely.

## Updating gitleaks rules

Regenerate `gitleaks-rules.json` from the latest gitleaks config:

```bash
curl -s https://raw.githubusercontent.com/zricethezav/gitleaks/master/config/gitleaks.toml > /tmp/gitleaks.toml
# run extraction script (see repo history)
```

## Files

- `index.ts` — extension entry, event handlers, commands
- `patterns.ts` — classification pipeline (cond-style, first match wins)
- `gitleaks.ts` — loads and indexes gitleaks-rules.json
- `gitleaks-rules.json` — 221 rules extracted from gitleaks
- `redaction.ts` — text redaction with fast-path
- `whitelist.ts` — project/global whitelist persistence
- `types.ts` — shared types
