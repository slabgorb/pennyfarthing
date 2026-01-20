# Dev Agent Patterns

> Pennyfarthing-specific implementation patterns

## Absolute Paths

Always use `$CLAUDE_PROJECT_DIR` as base for all file operations:
```bash
# Single-repo
cd $CLAUDE_PROJECT_DIR && just test

# Multi-repo: use repo-utils.sh
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
cd $CLAUDE_PROJECT_DIR/$(get_repo_path "myrepo") && just test
```

## Dev Assessment Format

```markdown
## Dev Assessment
**Implementation Complete:** Yes
**Files Changed:**
- `path/to/file.go` - {description}

**Tests:** {N}/{N} passing (GREEN)
**PR:** #{number} - {title}
**Branch:** {branch-name} (pushed)

**Handoff:** To Reviewer for code review
```

## Pennyfarthing Self-Development

When developing Pennyfarthing itself, `.claude/` directories are symlinks to `pennyfarthing-dist/`. Edit files in source, they're immediately available.

## Cyclist Notification Pattern

The message view IS the notification system. Errors go to console, not toast UI.

```javascript
// Good: Log to console
console.error(`[Component] Failed: ${path}`, err);

// Bad: Don't add toast UI
showToast('Error');  // Unnecessary layer
```

## YAML Config Read-Modify-Write

When updating a single field in YAML, preserve other settings:

```typescript
// Read existing
let existing = {};
if (fs.existsSync(path)) {
  const parsed = parseYaml(fs.readFileSync(path, 'utf-8'));
  if (parsed && typeof parsed === 'object') existing = parsed;
}
// Modify and write back
existing.field = newValue;
fs.writeFileSync(path, stringifyYaml(existing));
```

**Anti-pattern:** `fs.writeFileSync(path, \`field: "${value}"\n\`)` destroys other settings.

## Per-Project Electron Storage

Libraries like `electron-window-state` default to user-level storage. Use `path` option for per-project:

```typescript
windowStateKeeper({
  path: join(projectDir, '.pennyfarthing'),  // Per-project
});
```

---

*Add implementation patterns discovered during development below*
