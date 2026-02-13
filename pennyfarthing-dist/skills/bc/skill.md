---
name: bc
description: |
  Panel focus management for Cyclist. Set which panel BikeRack/Cyclist should focus on,
  or clear the focus setting. Save and load named layouts. Writes to `.pennyfarthing/config.local.yaml`.
args: "[panel|reset|save|load|list|clear|clear-all] [name]"
---

# /bc - Panel Focus & Layout Management

Set or clear the focused panel in Cyclist/BikeRack. Save and restore named layouts.

## Panel Focus

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

## Named Layouts

Save, load, and manage named layouts. Layouts capture the full panel arrangement from a running Cyclist/BikeRack server.

### `/bc save <name>` - Save Layout

Fetch the active layout from the running Cyclist/BikeRack server and store it under a name.

<run>
pf bc save <name>
</run>

<example>
pf bc save normal     # Save current layout as "normal"
pf bc save review     # Save current layout as "review"
pf bc save debug      # Save current layout as "debug"
</example>

<output>
Success: `{"success": true, "name": "<name>", "panels": <count>}`
Error: `{"success": false, "error": "No running Cyclist/BikeRack server found, or layout is empty"}`
</output>

---

### `/bc load <name>` - Load Layout

Load a previously saved named layout.

<run>
pf bc load <name>
</run>

<example>
pf bc load normal     # Restore the "normal" layout
pf bc load review     # Switch to "review" layout
</example>

<output>
Success: `{"success": true, "name": "<name>", "layout": {...}}`
Error: `{"success": false, "error": "..."}`
</output>

---

### `/bc list` - List Layouts

List all saved named layouts.

<run>
pf bc list
</run>

<output>
Success: `{"success": true, "layouts": ["normal", "review", ...]}`
</output>

---

### `/bc clear <name>` - Delete Layout

Delete a specific named layout.

<run>
pf bc clear <name>
</run>

<example>
pf bc clear review    # Delete the "review" layout
</example>

<output>
Success: `{"success": true, "message": "layout cleared"}`
Error: `{"success": false, "error": "..."}`
</output>

---

### `/bc clear-all` - Delete All Layouts

Delete all saved named layouts.

<run>
pf bc clear-all
</run>

<output>
Success: `{"success": true, "message": "all layouts cleared"}`
</output>

---

## Notes

- The `message` panel (sacred center) is not focusable
- Config is written to `.pennyfarthing/config.local.yaml` under the `focus` key
- Named layouts are stored in `.pennyfarthing/config.local.yaml` under the `named_layouts` key
- All other config keys (theme, layout, display, etc.) are preserved
- If the config file or directory doesn't exist, it will be created
- `save` requires a running Cyclist/BikeRack server to fetch the current layout

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
| `/bc save <name>` | `pf bc save <name>` |
| `/bc load <name>` | `pf bc load <name>` |
| `/bc list` | `pf bc list` |
| `/bc clear <name>` | `pf bc clear <name>` |
| `/bc clear-all` | `pf bc clear-all` |
