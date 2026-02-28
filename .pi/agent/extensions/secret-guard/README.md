# secret-guard

Pi extension that prevents secret values from leaking into the LLM context while keeping non-secret config visible for debugging.

## How it works

**Smart redaction on output** — Pi can read `.env` files and see config like `PORT=3000`, `HOST=localhost`, `NODE_ENV=development`. But values that look like secrets (API keys, tokens, passwords, connection strings with credentials) are replaced with `<REDACTED>` before the LLM sees them.

**Hard blocks** — Some things are blocked entirely: `echo $VAR`, `env`, `printenv`, `export -p`, and access to `~/.ssh/`, `~/.aws/`, `~/.gnupg/`, private key files.

**Content scanning** — Even if a secret ends up in an unexpected file, the output scanner catches known secret patterns (OpenAI keys, AWS keys, GitHub tokens, Stripe keys, JWTs, connection strings, private key headers, etc.) and blocks them.

## What gets redacted

| Detected as secret | Example |
|---|---|
| API key prefixes | `sk-`, `sk_live_`, `AKIA`, `ghp_`, `glpat-`, `xoxb-`, `SG.`, `whsec_` |
| JWT tokens | `eyJ...` |
| Connection strings with credentials | `postgres://user:pass@host/db` |
| URLs with embedded credentials | `https://user:pass@host` |
| Secret-named keys with non-trivial values | `*SECRET*=`, `*PASSWORD*=`, `*TOKEN*=`, `*AUTH*=`, `*CREDENTIAL*=` |
| Long random strings (32+ chars) | Likely tokens or keys |
| Private keys | `-----BEGIN RSA PRIVATE KEY-----` |

## What stays visible

Ports, hostnames, booleans, feature flags, environment names, log levels, app names, short simple values, numbers — anything that's clearly config and not a secret.

## CLI

The `secret-env` CLI (installed to `~/.local/bin/`) provides a fully-redacted view when you want to see structure without any values:

```
secret-env read <file>                   Show .env with values as <SET>/<EMPTY>
secret-env check <file> <KEY>            Check if a variable exists and has a value
secret-env list [dir]                    List all .env files and their variable names
secret-env copy <source> <target> <KEY>  Copy a variable between .env files on disk
secret-env keys <file>                   List just the variable names
```

## Commands

- `/secrets` — show status and current whitelist
- `/secrets-whitelist` — add a file or command to the whitelist (project or global)
- `/secrets-clear` — clear whitelist

## Whitelist

When something gets blocked that shouldn't be, the user can run `/secrets-whitelist` to allow it. Whitelists are stored as JSON:

- **Project:** `.pi/secret-guard.json`
- **Global:** `~/.pi/agent/secret-guard.json`

## Install

Already included in dotfiles. On a new machine, `yadm pull` brings it down at `~/.pi/agent/extensions/secret-guard/`. The `secret-env` CLI lands at `~/.local/bin/secret-env` (make sure `~/.local/bin` is on your PATH).

## Files

```
secret-guard/
├── index.ts       Extension entry — event handlers, commands
├── patterns.ts    Regex patterns and pure classification functions
├── redaction.ts   Pure text redaction (string in, string out)
├── whitelist.ts   Whitelist IO (load/save/query)
├── types.ts       Interfaces
├── bin/
│   └── secret-env Bash CLI for fully-redacted .env access
└── README.md
```
