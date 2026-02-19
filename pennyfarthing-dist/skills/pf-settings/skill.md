---
name: pf-settings
description: |
  View and manage .pennyfarthing/config.local.yaml settings.
  Get, set, and show configuration values using dot-path notation.
args: "[show|get|set] [key] [value]"
---

# /pf-settings - Configuration Settings

View and manage `.pennyfarthing/config.local.yaml` settings.

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/pf-settings show` | `pf.sh settings show` | Pretty-print all settings |
| `/pf-settings get <key>` | `pf.sh settings get <key>` | Get value by dot-path |
| `/pf-settings set <key> <value>` | `pf.sh settings set <key> <value>` | Set value by dot-path |

## Examples

```bash
# Show all interesting settings (theme, workflow, display, split, last_panel)
pf.sh settings show

# Get a specific value
pf.sh settings get theme                    # → fifth-element
pf.sh settings get workflow.relay_mode       # → True
pf.sh settings get display.colorPreset      # → catppuccin

# Set a value (auto-coerces bool/int)
pf.sh settings set workflow.bell_mode false
pf.sh settings set workflow.relay_mode true
pf.sh settings set display.colorPreset monokai
```

## Notes

- Dot-path notation traverses nested keys: `workflow.relay_mode` → `workflow: { relay_mode: ... }`
- Value coercion: `true`/`false` → bool, numeric strings → int, else string
- `show` skips large blobs (layout, bikerack_layout, panels, theme_characters) for readability
