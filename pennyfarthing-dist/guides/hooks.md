# Hooks Configuration Guide

Pennyfarthing uses Claude Code hooks to integrate with session lifecycle events and protect files from accidental modification.

## Overview

Hooks are shell scripts that Claude Code runs at specific events:

| Hook Type | When It Runs | Purpose |
|-----------|--------------|---------|
| `SessionStart` | When Claude Code session begins | Initialize environment, set variables |
| `PreToolUse` | Before a tool call executes | Validate/block operations |
| `PostToolUse` | After a tool call completes | Log, cleanup, notifications |

## Pennyfarthing Default Hooks

### SessionStart Hooks

#### session-start.sh

**Location:** `.pennyfarthing/scripts/hooks/session-start.sh`

Initializes the Pennyfarthing environment:
- Creates `.session/` directory structure
- Clears stale agent state from previous sessions
- Sets `PROJECT_ROOT` and `SESSION_ID` environment variables

#### session-stop.sh

**Location:** `.pennyfarthing/scripts/hooks/session-stop.sh`

Cleans up session state when Claude Code exits.

#### setup-env.sh

**Location:** `.pennyfarthing/project/hooks/setup-env.sh`

Project-specific environment setup. Edit this file to:
- Set custom environment variables
- Configure project-specific paths
- Initialize project dependencies

#### otel-auto-config.sh

**Location:** `.pennyfarthing/scripts/hooks/otel-auto-config.sh`

Auto-configures OTEL telemetry for Cyclist web mode. Checks for a `.wheelhub-port` file and sets `OTEL_EXPORTER_OTLP_PROTOCOL` and `OTEL_EXPORTER_OTLP_ENDPOINT` to route Claude Code telemetry to the running Cyclist/BikeRack server.

#### welcome-hook.sh

**Location:** `.pennyfarthing/scripts/hooks/welcome-hook.sh`

Displays a welcome message on session start. In CLI mode, shows ASCII art. In Cyclist mode, sends a WebSocket message to display the logo. Runs once per session (lock file guard).

### PreToolUse Hooks

#### pre-edit-check.sh

**Location:** `.pennyfarthing/scripts/hooks/pre-edit-check.sh`

Protects sensitive files from accidental edits:
- Blocks: `.env`, `.pem`, `.key`, credentials, secrets
- Blocks: `.git/`, `node_modules/`, `vendor/`
- Blocks: `.pennyfarthing/*` (managed files)

#### cyclist-pretooluse-hook.sh

**Location:** `.pennyfarthing/scripts/hooks/cyclist-pretooluse-hook.sh`

Cyclist-specific pre-tool validation. Runs additional safety checks when operating inside Cyclist.

#### context-warning.sh

**Location:** `.pennyfarthing/scripts/hooks/context-warning.sh`

Warns agents when context usage is high. Outputs a warning at 60% usage and a critical warning at 85%. Never blocks — warning only (always exits 0).

#### context-circuit-breaker.sh

**Location:** `.pennyfarthing/scripts/hooks/context-circuit-breaker.sh`

Hard stop when context reaches 80% (configurable via `CRITICAL_THRESHOLD`). Unlike `context-warning.sh`, this **blocks tool execution** (exit 2). Auto-saves the active agent to a checkpoint so `/pf-session continue` can restore it with FULL tier context.

#### schema-validation.sh

**Location:** `.pennyfarthing/scripts/hooks/schema-validation.sh`

Validates file writes against XML schema rules for agent definitions, workflow files, and other structured content.

#### sprint-yaml-validation.sh

**Location:** `.pennyfarthing/scripts/hooks/sprint-yaml-validation.sh`

Validates sprint YAML files on write to prevent structural corruption.

### PostToolUse Hooks

#### bell-mode-hook.sh

**Location:** `.pennyfarthing/scripts/hooks/bell-mode-hook.sh`

Bell mode message injection. Checks the bell mode queue and injects queued messages into the agent's context at the next tool execution. Also handles tandem observation injection.

#### question-reflector-check.sh / question_reflector_check.py

**Location:** `.pennyfarthing/scripts/hooks/question-reflector-check.sh`

Stop hook enforcing that every agent turn ends with a CYCLIST marker. Detects questions, handoff phrases, and validates marker presence. Blocks turns without valid markers in Cyclist mode. The `.sh` file wraps the Python implementation.

### Git Hooks

#### dispatcher-template.sh

**Location:** `.pennyfarthing/scripts/hooks/dispatcher-template.sh`

Template for git hook dispatchers. Installs as `.git/hooks/{hook-name}` and runs all executable scripts in `.git/hooks/{hook-name}.d/` in sorted order. This enables hook chaining — multiple tools can add hooks without overwriting each other.

#### pre-commit.sh / pre-push.sh / post-merge.sh

**Location:** `.pennyfarthing/scripts/hooks/`

Standard git hooks installed into the dispatcher `.d/` directories. Handle linting, validation, and post-merge cleanup.

## Configuration Schema

Hooks are configured in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/pennyfarthing/scripts/hooks/session-start.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/pennyfarthing/scripts/hooks/pre-edit-check.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Entry Structure

```json
{
  "matcher": "ToolNameRegex",  // Optional: regex to filter by tool name
  "hooks": [
    {
      "type": "command",
      "command": "path/to/script.sh"
    }
  ]
}
```

### Matcher Format

The `matcher` field is a regex string that matches tool names:
- `"Edit|Write"` - Match Edit or Write tools
- `"Bash"` - Match Bash tool only
- Omit matcher to run on all tool uses

## Hook Script Contract

### Input

Hooks receive JSON via stdin:

```json
{
  "session_id": "abc123",
  "source": "vscode",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "...",
    "new_string": "..."
  }
}
```

### Output

| Exit Code | Meaning |
|-----------|---------|
| `0` | Allow (continue execution) |
| `2` | Block (stderr shown to Claude as error) |

### Environment Variables

Available in hooks:
- `CLAUDE_PROJECT_DIR` - Project root directory
- `CLAUDE_ENV_FILE` - Path to write persistent env vars

## Adding Custom Hooks

### 1. Create Hook Script

```bash
#!/usr/bin/env zsh
# .claude/project/hooks/my-custom-hook.sh
set -euo pipefail

input=$(cat)
# Your logic here

exit 0  # Allow, or exit 2 to block
```

### 2. Make Executable

```bash
chmod +x .claude/project/hooks/my-custom-hook.sh
```

### 3. Configure in settings.local.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/project/hooks/my-custom-hook.sh"
          }
        ]
      }
    ]
  }
}
```

## Examples

### Block Specific File Patterns

```bash
#!/usr/bin/env zsh
# Block edits to migration files
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')

if [[ "$file_path" == *"/migrations/"* ]]; then
    echo "BLOCKED: Migration files are immutable" >&2
    exit 2
fi
exit 0
```

### Log All Bash Commands

```bash
#!/usr/bin/env zsh
# Log bash commands for audit
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

echo "$(date -Iseconds) | $command" >> "$CLAUDE_PROJECT_DIR/.session/bash-log.txt"
exit 0
```

### Environment Setup

```bash
#!/usr/bin/env zsh
# .claude/project/hooks/setup-env.sh
# Set project-specific environment

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    cat >> "$CLAUDE_ENV_FILE" << EOF
export API_URL="http://localhost:3000"
export DATABASE_URL="postgres://localhost/myapp"
EOF
fi
exit 0
```

## Debugging Hooks

If a hook fails or behaves unexpectedly:

1. **Check permissions:** `chmod +x your-hook.sh`
2. **Test manually:** `echo '{}' | ./your-hook.sh`
3. **Check stderr:** Hook errors appear in Claude Code output
4. **Validate JSON:** Use `jq` to parse input correctly

## File Locations

| Type | Location | Editable |
|------|----------|----------|
| Managed hooks | `.pennyfarthing/scripts/hooks/` | No (symlinked — edit in `pennyfarthing-dist/`) |
| Project hooks | `.claude/project/hooks/` | Yes |
| Settings | `.claude/settings.local.json` | Yes |
| Git hook dispatchers | `.git/hooks/{name}` | No (installed by `pennyfarthing init`) |
| Git hook scripts | `.git/hooks/{name}.d/` | Yes (add scripts to `.d/` directories) |
