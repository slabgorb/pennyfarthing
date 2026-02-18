---
name: theme
description: Manage persona themes - list available themes, show current/specific theme details, set active theme, create themes, and run the interactive theme maker wizard.
args: "[list|show|set|create|maker] [options]"
---

# /theme - Theme Management

Manage persona themes for agent characters.

## Quick Reference

| Command | CLI | Purpose |
|---------|-----|---------|
| `/theme` | `pf.sh theme show` | Show current theme |
| `/theme list` | `pf.sh theme list` | List all available themes |
| `/theme show [name]` | `pf.sh theme show [name] [--full]` | Show theme details |
| `/theme set <name>` | `pf.sh theme set <name> [--dry-run]` | Set active theme |
| `/theme create <name>` | `pf.sh theme create <name> [--base X] [--user] [--dry-run]` | Create from base theme |
| `/theme maker` | *(interactive wizard)* | AI-driven theme creation |

### After Setting a Theme

Refresh the current agent persona:
```bash
pf.sh agent start "sm"
```
Adopt the new character immediately.

### Theme Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/personas/themes/` | Built-in themes (96+) |
| `.claude/pennyfarthing/themes/` | Project-level custom themes |
| `~/.claude/pennyfarthing/themes/` | User-level custom themes |
| `.pennyfarthing/config.local.yaml` | Active theme selection |

---

**Detailed options and behavior:** [usage.md](usage.md)
**Practical examples and theme maker guide:** [examples.md](examples.md)
