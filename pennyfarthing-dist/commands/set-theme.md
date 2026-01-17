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

3. Read the current config file to prepare for editing:
   ```bash
   cat .pennyfarthing/config.local.yaml 2>/dev/null || echo "FILE_NOT_FOUND"
   ```

4. Set the theme in `.pennyfarthing/config.local.yaml`:

   **If the file exists and has a `theme:` line:**
   - Use the Edit tool to replace `theme: <old>` with `theme: <new>`

   **If the file doesn't exist or lacks the theme line:**
   - Use the Write tool to create/overwrite the file:
   ```yaml
   # Pennyfarthing Local Configuration
   # This file is gitignored - your personal preferences

   theme: <name>
   ```

5. Verify the change was written:
   ```bash
   cat .pennyfarthing/config.local.yaml
   ```
   Confirm the theme line shows the new value.

6. Inform the user they need to start a new agent session to use the new theme.
