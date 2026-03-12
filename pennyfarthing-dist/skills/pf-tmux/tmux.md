---
name: tmux
description: |
  Pane management for tmux sessions. Run commands in worker panes, list panes with
  role/status, create new panes, and close panes. Protects claude and tui panes from
  accidental targeting. Use when running shell commands in background panes, checking
  pane availability, or managing worker pane lifecycle.
args: "[list|run|create|send|close|register] [args...]"
---

# /tmux - Pane Management

Run commands in managed tmux panes with role-based targeting and protection.

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/tmux list` | `pf tmux list [--json]` | Show all panes with role, status, protection |
| `/tmux run "<cmd>"` | `pf tmux run "<cmd>" [--title NAME]` | Run command in idle worker (creates one if needed) |
| `/tmux create` | `pf tmux create [--role worker\|agent\|script] [--title NAME] [--owner NAME]` | Create a new pane |
| `/tmux send <ref> "<cmd>"` | `pf tmux send <ref> "<cmd>"` | Send keys to a pane by reference |
| `/tmux close <ref>` | `pf tmux close <ref>` | Close a pane |
| `/tmux register` | `pf tmux register` | Force full registry rebuild |

## Pane References

Target panes by any of:
- **pane_id**: `%5` — tmux stable identifier
- **role**: `worker`, `agent`, `script`
- **title**: `Worker 1`, `Dev Agent`

## Protection

`claude` and `tui` panes are always protected. `send` and `close` refuse protected panes.

## Typical Usage

```bash
# Run a command — finds idle worker or creates one
pf tmux run "npm test"

# Check what's available
pf tmux list

# Send to a specific pane
pf tmux send worker "git status"

# Clean up
pf tmux close worker
```

## Rules

1. **Always use `pf tmux run`** — never raw `tmux send-keys`
2. **Never target `claude` or `tui`** — they are protected
3. Idle = pane is at a shell prompt (zsh/bash/fish)
4. Max 5 panes by default — close idle workers to free slots
