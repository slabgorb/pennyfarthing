---
name: gui
description: |
  BikeRack GUI detection and status. Use when checking if running inside BikeRack GUI,
  getting session status, or accessing GUI-specific features.
args: "[check|status]"
---

# /pf-gui - BikeRack GUI

## Commands

### `/pf-gui` or `/pf-gui check`

Check if running inside BikeRack GUI.

<run>
.pennyfarthing/scripts/bikerack/is-gui.sh
</run>

<output>
JSON: `{"gui": true}` with exit 0 if in BikeRack GUI, `{"gui": false}` with exit 1 if not.
</output>

<example>
.pennyfarthing/scripts/bikerack/is-gui.sh
# Returns: {"gui": true}
</example>

---

## Environment Variables

BikeRack GUI sets these environment variables when spawning Claude:

| Variable | Value | Description |
|----------|-------|-------------|
| `PF_GUI` | `1` | Always set when running in BikeRack GUI |
| `PF_GUI_SESSION_ID` | UUID | Session tracking identifier |
| `PF_PROJECT_DIR` | path | Project directory if specified |
| `PF_GUI_THEME_PATH` | path | Custom theme file path |
| `PF_GUI_DEV_WEB` | `1` | Set in web dev mode |

---

## Starting BikeRack GUI

Use `just gui` from the project root (outside of Claude Code):

```bash
# Web dev mode (browser + hot reload, default)
just gui

# Web dev in current directory
just gui here

# Web server only (production)
just gui server
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
| `/pf-gui` | `bikerack/is-gui.sh` |
| `/pf-gui check` | `bikerack/is-gui.sh` |

## Related Skills

| Skill | Purpose |
|-------|---------|
| `/theme` | Theme management (list, show, set) |
| `/pf-just` | Run just recipes including `just gui` |
