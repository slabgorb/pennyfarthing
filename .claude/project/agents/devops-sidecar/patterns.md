# DevOps Agent Patterns

> Pennyfarthing-specific infrastructure patterns

## Claude Code Hook Paths

### Use $CLAUDE_PROJECT_DIR for Hooks
Always use `$CLAUDE_PROJECT_DIR` for hook commands in settings.local.json:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/session-start.sh"
      }]
    }]
  }
}
```

**Why:** `$CLAUDE_PROJECT_DIR` is set by Claude Code to the directory where it was started. Relative paths break when Claude runs from subdirectories.

**Anti-pattern:** Don't use `git rev-parse --show-toplevel` as fallback - returns wrong root in nested repos.

## Just Commands

### Standard Project Commands
```bash
just test       # Run all tests
just lint       # Run linters
just build      # Build application
just dev        # Start development server
```

---

*Add infrastructure patterns discovered during DevOps work below*
