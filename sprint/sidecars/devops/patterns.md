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

## npm Git-Based Install

### Installing Pennyfarthing from GitHub
Projects can install pennyfarthing directly from GitHub instead of npm registry:

```json
{
  "devDependencies": {
    "pennyfarthing": "github:1898andCo/pennyfarthing#develop"
  }
}
```

**Key learnings:**
1. `dist/` must be committed to git - devDependencies (typescript) aren't installed when package is a dependency
2. The `prepare` script runs after git clone but typescript won't be available
3. Use `#branch` or `#commit` suffix to pin versions
4. Delete `package-lock.json` and `node_modules/pennyfarthing` to force fresh install when debugging

### Root package.json for Monorepos
For projects with sub-packages (e.g., siemulator with siemulator-ui):

```json
{
  "name": "project-name",
  "private": true,
  "workspaces": ["sub-package"],
  "scripts": {
    "dev": "npm run dev --workspace=sub-package"
  },
  "devDependencies": {
    "pennyfarthing": "github:1898andCo/pennyfarthing#develop"
  }
}
```

---

*Add infrastructure patterns discovered during DevOps work below*
