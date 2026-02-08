---
name: theme
description: Manage persona themes - list available themes, show current/specific theme details, and set active theme. Use when switching persona themes, viewing available characters, or checking which theme is currently active.
---

# Theme Management Skill

<run>
To manage persona themes, use the `pf theme` CLI:
- `pf theme list` - List all available themes
- `pf theme show [name]` - Show current theme or specific theme details
- `pf theme show [name] --full` - Show extended details (OCEAN, quirks, catchphrases)
- `pf theme set <name>` - Set the active theme
- `pf theme create <name> [--base <theme>] [--user]` - Create a new custom theme
- `/theme-maker` - Create a new custom theme interactively (AI-driven)
</run>

<output>
Theme commands return theme names, descriptions, agent mappings, and confirmation of theme changes. Current theme is stored in `.pennyfarthing/config.local.yaml`.
</output>

## Overview

Pennyfarthing uses themed personas to give each agent a unique character. This skill provides commands to list, view, and change themes.

## Quick Reference

| Action | Command |
|--------|---------|
| List all themes | `pf theme list` |
| Show current theme | `pf theme show` |
| Show specific theme | `pf theme show <name>` |
| Show full details | `pf theme show <name> --full` |
| Set active theme | `pf theme set <name>` |
| Create new theme | `pf theme create <name>` |
| Interactive creation | `/theme-maker` |

## List Available Themes

```bash
pf theme list
```

## Show Theme Details

```bash
# Show current theme
pf theme show

# Show specific theme
pf theme show blade-runner

# Show full details (OCEAN scores, quirks, catchphrases, helpers)
pf theme show blade-runner --full
```

## Set Active Theme

```bash
pf theme set <name>
```

Then start a new agent session to use the new theme.

## Create Custom Theme

```bash
# Create from default base (minimalist)
pf theme create my-theme

# Create from specific base
pf theme create my-theme --base blade-runner

# Create as user-level theme (available across all projects)
pf theme create my-theme --user
```

## Theme File Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/personas/themes/` | Built-in themes (96+) |
| `.claude/pennyfarthing/themes/` | Project-level custom themes |
| `~/.claude/pennyfarthing/themes/` | User-level custom themes |
| `.pennyfarthing/config.local.yaml` | Theme selection (agent-writable, gitignored) |

## Theme Structure

Each theme YAML defines agents with:

```yaml
theme:
  name: theme-name
  description: Brief description

agents:
  sm:
    character: Character Name
    style: Communication style description
    trait: Key personality trait
    helper: Helper/assistant description
    ocean: { O: 3, C: 4, E: 2, A: 3, N: 2 }
    quirks: [...]
    catchphrases: [...]
  tea:
    # ...same structure...
  dev:
    # ...
```

## Creating Custom Themes

For interactive creation, use `/theme-maker` which provides:
- **AI-Driven Mode**: Describe a concept, AI generates all personas
- **Guided Mode**: Pick from AI-suggested characters
- **Manual Mode**: Specify every detail yourself

See the `theme-creation` skill for full documentation.

## Common Theme Categories

Themes are available across many categories:
- **TV/Film**: star-trek-tos, star-trek-tng, breaking-bad, the-wire, firefly, etc.
- **Literature**: shakespeare, jane-austen, dickens, discworld, dune, etc.
- **Historical**: ancient-philosophers, military-commanders, renaissance-masters, etc.
- **Mythology**: greek-mythology, norse-mythology, arthurian-mythos, etc.
- **Animated**: futurama, the-simpsons, avatar-the-last-airbender, etc.

Run `pf theme list` to see all available themes.
