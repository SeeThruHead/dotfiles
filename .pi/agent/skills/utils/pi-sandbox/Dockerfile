# General-purpose pi sandbox.
# Covers node/bun/go/python projects. Includes Chrome + Xvfb for browser automation.
FROM oven/bun:1.3-debian

# Dev tools + Chrome deps + virtual display
RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    ripgrep \
    tmux \
    openssh-client \
    xvfb \
    wget \
    gnupg \
    make \
    build-essential \
    fd-find \
    && ln -s $(which fdfind) /usr/local/bin/fd 2>/dev/null || true \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python 3 + pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Go (latest stable)
RUN curl -fsSL https://go.dev/dl/go1.24.1.linux-amd64.tar.gz | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}"

# tk CLI (ticket management — used by autonomous-dev skill)
RUN git clone https://github.com/wedow/ticket.git /opt/ticket \
    && ln -s /opt/ticket/ticket /usr/local/bin/tk

# Pi
RUN npm install -g @mariozechner/pi-coding-agent

WORKDIR /pi-sandbox

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
