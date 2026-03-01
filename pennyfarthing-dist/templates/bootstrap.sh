#!/usr/bin/env bash
# Pennyfarthing bootstrap — auto-installs pf on first clone.
# Committed to repo. Fires via .claude/settings.json SessionStart hook.
set -uo pipefail

# Fast path: pf installed + shim exists → delegate to real dispatcher
if command -v pf &>/dev/null && [ -f ".pennyfarthing/bin/pf" ]; then
    exec .pennyfarthing/bin/pf hooks dispatch SessionStart
fi

# --- Bootstrap ---
echo "Setting up Pennyfarthing..." >&2

if ! command -v pf &>/dev/null; then
    if command -v uv &>/dev/null; then
        uv tool install pennyfarthing-scripts >&2 2>&1 || true
    elif command -v pipx &>/dev/null; then
        pipx install pennyfarthing-scripts >&2 2>&1 || true
    else
        echo "Cannot install pf: need uv or pipx (https://docs.astral.sh/uv/)" >&2
        exit 0
    fi

    # uv/pipx install to ~/.local/bin which may not be on PATH yet
    if ! command -v pf &>/dev/null; then
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

if command -v pf &>/dev/null; then
    pf init >&2 2>&1 || true
    # Signal to session_start that this was a bootstrap install
    mkdir -p .pennyfarthing && touch .pennyfarthing/.bootstrap-just-ran
    [ -f ".pennyfarthing/bin/pf" ] && exec .pennyfarthing/bin/pf hooks dispatch SessionStart
fi

echo "pf install failed — run 'uv tool install pennyfarthing-scripts' manually" >&2
exit 0
