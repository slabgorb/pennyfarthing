# Base image for Pennyfarthing E2E tests
# Mirrors a real consumer environment: Node 24, Python 3.14, git, pipx
FROM node:24-bookworm

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv pipx git jq tmux \
    && rm -rf /var/lib/apt/lists/*

# pipx needs to be on PATH
ENV PATH="/root/.local/bin:${PATH}"
RUN pipx ensurepath

# just (task runner) — used by some consumer workflows
RUN curl -fsSL https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Git config (commits need identity)
RUN git config --global user.email "e2e@test.local" && \
    git config --global user.name "E2E Test" && \
    git config --global init.defaultBranch main

# Copy the pennyfarthing repo (framework source)
COPY . /opt/pennyfarthing

# Install pf CLI from source
RUN pipx install /opt/pennyfarthing

# Verify pf is available
RUN pf --version

WORKDIR /workspace
