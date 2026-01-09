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
   ls pennyfarthing-dist/personas/themes/*.yaml | xargs -I{} basename {} .yaml | sort
   ```
   Then ask the user which theme they want to use.

2. Validate theme exists:
   ```bash
   ls pennyfarthing-dist/personas/themes/<name>.yaml
   ```
   If not found, show error and list available themes.

3. Set the theme by editing `.claude/persona-config.yaml`:
   - Change the `theme:` line to the new theme name
   - Use the Edit tool to replace `theme: <old>` with `theme: <new>`

4. Inform the user they need to start a new agent session to use the new theme.
