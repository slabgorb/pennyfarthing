---
name: cyclist
description: |
  Cyclist visual terminal detection and status. Use when checking if running inside Cyclist,
  getting session status, or accessing Cyclist-specific features.
args: "[check|status]"
---

# /cyclist - Cyclist Visual Terminal

## Commands

### `/cyclist` or `/cyclist check`

Check if running inside Cyclist visual terminal.

<run>
.pennyfarthing/scripts/core/run.sh cyclist/is-cyclist.sh
</run>

<output>
JSON: `{"cyclist": true}` with exit 0 if in Cyclist, `{"cyclist": false}` with exit 1 if not.
</output>

<example>
.pennyfarthing/scripts/core/run.sh cyclist/is-cyclist.sh
# Returns: {"cyclist": true}
</example>

---

## Environment Variables

Cyclist sets these environment variables when spawning Claude:

| Variable | Value | Description |
|----------|-------|-------------|
| `CYCLIST` | `1` | Always set when running in Cyclist |
| `CYCLIST_SESSION_ID` | UUID | Session tracking identifier |
| `CYCLIST_PROJECT_DIR` | path | Project directory if specified |
| `CYCLIST_THEME_PATH` | path | Custom theme file path |
| `CYCLIST_DEV_WEB` | `1` | Set in web dev mode |

---

## Starting Cyclist

Use `just cyclist` from the project root (outside of Claude Code):

```bash
# Electron with folder picker (default)
just cyclist

# Electron in current directory
just cyclist here

# Web dev mode (browser + hot reload)
just cyclist web

# Web server only (production)
just cyclist server
```

---

## Internal Codenames

| Codename | Component | Description |
|----------|-----------|-------------|
| **WheelHub** | Server | Central coordination (API, WebSocket, OTLP) |
| **TirePump** | Context clearing | Clear session, reset stats, reload agent |
| **JobFair** | Character benchmarking | Discover which characters excel at each role |

---

## Quick Reference

| Command | Script |
|---------|--------|
| `/cyclist` | `cyclist/is-cyclist.sh` |
| `/cyclist check` | `cyclist/is-cyclist.sh` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/theme` | Theme management (list, show, set) |
| `/just` | Run just recipes including `just cyclist` |
