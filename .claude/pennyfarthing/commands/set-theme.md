---
description: Set the active persona theme
---

# Set Theme

Change the active persona theme for all agents.

## Arguments

- `<name>` - Theme name to activate (required)

## Instructions

1. If no theme name provided, first list available themes:
   ```bash
   pennyfarthing theme list
   ```
   Then ask the user which theme they want to use.

2. Set the theme:
   ```bash
   pennyfarthing theme set <name>
   ```

3. Inform the user they need to start a new agent session to use the new theme.
