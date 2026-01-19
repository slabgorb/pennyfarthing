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

---

*Add implementation patterns discovered during development below*
