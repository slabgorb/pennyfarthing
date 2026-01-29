---
name: theme
description: Manage persona themes - list available themes, show current/specific theme details, and set active theme. Use when switching persona themes, viewing available characters, or checking which theme is currently active.
---

# Theme Management Skill

## Overview

Pennyfarthing uses themed personas to give each agent a unique character. This skill provides commands to list, view, and change themes.

## Quick Reference

| Action | Command |
|--------|---------|
| List all themes | `/list-themes` or see below |
| Show current theme | `/show-theme` |
| Show specific theme | `/show-theme <name>` |
| Set active theme | `/set-theme <name>` |
| Create new theme | `/theme-maker` (interactive) |

## List Available Themes

To see all available themes:

```bash
ls pennyfarthing-dist/personas/themes/*.yaml | xargs -I{} basename {} .yaml | sort
```

To show the current theme:

```bash
cat .pennyfarthing/config.local.yaml 2>/dev/null || echo "No theme configured"
```

## Show Theme Details

To display a theme's agent mappings:

```bash
# Show current theme
THEME=$(cat .pennyfarthing/config.local.yaml 2>/dev/null | grep "^theme:" | cut -d'"' -f2)
cat pennyfarthing-dist/personas/themes/${THEME}.yaml
```

Or for a specific theme:

```bash
cat pennyfarthing-dist/personas/themes/<theme-name>.yaml
```

## Set Active Theme

To change the active theme:

1. Verify theme exists:
   ```bash
   ls pennyfarthing-dist/personas/themes/<name>.yaml
   ```

2. Read current config:
   ```bash
   cat .pennyfarthing/config.local.yaml 2>/dev/null || echo "FILE_NOT_FOUND"
   ```

3. Update `.pennyfarthing/config.local.yaml`:
   - If file exists with `theme:` line: Use Edit tool to replace `theme: <old>` with `theme: <new>`
   - If file missing or no theme line: Use Write tool to create:
     ```yaml
     # Pennyfarthing Local Configuration
     theme: <name>
     ```

4. Verify the write succeeded:
   ```bash
   cat .pennyfarthing/config.local.yaml
   ```

5. Start a new agent session to use the new theme

## Theme File Locations

| Location | Purpose |
|----------|---------|
| `pennyfarthing-dist/personas/themes/` | Built-in themes (96+) |
| `.claude/pennyfarthing/themes/` | User-created custom themes |
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
    quote: Signature quote
    trait: Key personality trait
    helper: Helper/assistant description
  tea:
    # ...same structure...
  dev:
    # ...
```

## Creating Custom Themes

For creating new themes, use `/theme-maker` which provides:
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

Run the list command to see all 96+ available themes.
