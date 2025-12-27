---
description: Create a new custom persona theme
---

# Create Theme

Create a new custom theme, optionally based on an existing theme.

## Arguments

- `<name>` - Name for the new theme (lowercase, hyphens allowed)

## Options

- `--base <theme>` - Base theme to copy from (default: minimalist)
- `--user` - Create as user-level theme (available across all projects)

## Instructions

1. If no theme name provided, ask the user what they want to call their theme.

2. Create the theme:
   ```bash
   pennyfarthing theme create <name> [--base <theme>] [--user]
   ```

3. Guide the user on next steps:
   - Edit the theme file to customize agents
   - Run `/set-theme <name>` to activate
