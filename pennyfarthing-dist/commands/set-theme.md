---
description: Set the active persona theme
---

# Set Theme

Change the active persona theme for all agents.

## Arguments

- `<name>` - Theme name to activate (required)

## Instructions

1. If no theme name provided, list available themes:
   ```bash
   pf theme list
   ```
   Then ask the user which theme they want to use.

2. Set the theme:
   ```bash
   pf theme set <name>
   ```

3. Refresh the current agent's persona to apply the new theme:
   ```bash
   pf agent start "sm"
   ```
   This outputs the updated persona. **Adopt the new character immediately** - do not continue using the old persona.
