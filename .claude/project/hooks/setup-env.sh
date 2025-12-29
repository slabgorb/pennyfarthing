#!/usr/bin/env zsh
# Project-specific environment setup
# Called during Claude Code session start

# Export to CLAUDE_ENV_FILE for session persistence
if [ -n "$CLAUDE_ENV_FILE" ]; then
    {
        echo "export PROJECT_NAME=\"pennyfarthing\""
        echo "export PROJECT_LABEL=\"pennyfarthing\""
        # Add project-specific env vars here
        # echo "export API_REPO=\"api\""
        # echo "export UI_REPO=\"ui\""
    } >> "$CLAUDE_ENV_FILE"
fi

# Display project info
echo "Project: pennyfarthing"
echo "Pennyfarthing: npm package"
