---
name: bc
description: |
  Panel focus management for Cyclist. Set which panel BikeRack/Cyclist should focus on,
  or clear the focus setting. Writes to `.pennyfarthing/config.local.yaml`.
args: "[panel|reset]"
---

# /bc - Panel Focus Management

Set or clear the focused panel in Cyclist/BikeRack.

## Commands

### `/bc <panel>` - Set Focus

Set the focus panel. Valid panels:

| Panel | Description |
|-------|-------------|
| `sprint` | Sprint panel |
| `git` | Git panel |
| `diffs` | Diffs panel |
| `todo` | Todo panel |
| `workflow` | Workflow panel |
| `background` | Background panel |
| `audit-log` | Audit Log panel |
| `changed` | Changed panel |
| `ac` | Acceptance Criteria panel |
| `debug` | Debug panel |
| `settings` | Settings panel |
| `tty` | TTY panel |

<run>
pf bc <panel>
</run>

<example>
pf bc sprint    # Focus on Sprint panel
pf bc diffs     # Focus on Diffs panel
pf bc ac        # Focus on Acceptance Criteria panel
</example>

<output>
Success: `{"success": true, "panel": "<panel>"}`
Error: `{"success": false, "error": "Invalid panel '<name>'. Valid panels: sprint, git, ..."}`
</output>

---

### `/bc reset` - Clear Focus

Remove the focus setting from config.

<run>
pf bc reset
</run>

<output>
Success: `{"success": true, "message": "focus cleared"}`
</output>

---

## Notes

- The `message` panel (sacred center) is not focusable
- Config is written to `.pennyfarthing/config.local.yaml` under the `focus` key
- All other config keys (theme, layout, display, etc.) are preserved
- If the config file or directory doesn't exist, it will be created

## Quick Reference

| Command | CLI |
|---------|-----|
| `/bc sprint` | `pf bc sprint` |
| `/bc git` | `pf bc git` |
| `/bc diffs` | `pf bc diffs` |
| `/bc todo` | `pf bc todo` |
| `/bc workflow` | `pf bc workflow` |
| `/bc background` | `pf bc background` |
| `/bc audit-log` | `pf bc audit-log` |
| `/bc changed` | `pf bc changed` |
| `/bc ac` | `pf bc ac` |
| `/bc debug` | `pf bc debug` |
| `/bc settings` | `pf bc settings` |
| `/bc tty` | `pf bc tty` |
| `/bc reset` | `pf bc reset` |
