# pi-sandbox

Run [pi](https://github.com/badlogic/pi-mono) sandboxed in a container. Only the current repo is mounted — no access to the rest of your filesystem.

Includes Chrome + Xvfb for browser automation (e.g. CRA PDOC). Chrome runs against a virtual display, so it's non-headless without needing a physical screen.

## Setup

```bash
# Symlink to PATH
ln -s "$(pwd)/pi-sandbox" /usr/local/bin/pi-sandbox
```

## Usage

```bash
export ANTHROPIC_API_KEY=sk-ant-...
cd ~/code/some-repo
pi-sandbox
```

All pi args are forwarded:

```bash
pi-sandbox "fix the tests"
pi-sandbox -t prompt-template @context-file
```

## ARM Macs

This runs an x86 container (Chrome has no Linux ARM64 build). OrbStack handles Rosetta emulation automatically. Docker Desktop users need to enable "Use Rosetta" in settings.

## What's sandboxed

- Only `$(pwd)` is mounted at `/repo`
- No access to home directory, credentials, other repos
- API keys passed via env vars only (not persisted)
- `--shm-size=2g` for Chrome stability
