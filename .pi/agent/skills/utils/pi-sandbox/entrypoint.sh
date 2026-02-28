#!/bin/bash
# Start virtual display, then run pi.
# Chrome sees a real display — not headless mode.
export DISPLAY=:99
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
sleep 0.5

# SSH: copy host keys into a writable ~/.ssh so we can add our own config
mkdir -p /root/.ssh
if [[ -d /root/.ssh-host ]]; then
  cp -a /root/.ssh-host/* /root/.ssh/ 2>/dev/null || true
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/id_* 2>/dev/null || true
  chmod 644 /root/.ssh/*.pub 2>/dev/null || true
fi

# Accept all host keys automatically so git clone just works
echo -e "Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null" > /root/.ssh/config
chmod 600 /root/.ssh/config

# Start agent and load keys (handles passphrase-less keys)
eval "$(ssh-agent -s)" > /dev/null 2>&1
ssh-add /root/.ssh/id_* 2>/dev/null || true

# Install deps if needed
if [[ -f "bun.lock" ]] && [[ ! -d "node_modules" ]]; then
  bun install --frozen-lockfile
elif [[ -f "package-lock.json" ]] && [[ ! -d "node_modules" ]]; then
  npm ci
fi

# Go: download modules if go.mod exists
if [[ -f "go.mod" ]]; then
  go mod download 2>/dev/null || true
fi

pi "$@"
exec bash
