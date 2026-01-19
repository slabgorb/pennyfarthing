# Dev Agent Patterns

> Pennyfarthing-specific implementation patterns

## Absolute Paths

Always use `$CLAUDE_PROJECT_DIR` as base for all file operations:
```bash
# Single-repo: correct
cd $CLAUDE_PROJECT_DIR && just test

# Multi-repo: use repo-utils.sh
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
cd $CLAUDE_PROJECT_DIR/$(get_repo_path "myrepo") && just test

# Wrong - assumes current directory
cd myrepo && just test
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

## Pennyfarthing Version Check

Quick one-liner to check installed version:
```bash
jq -r .version .claude/manifest.json
```

## Pennyfarthing Self-Development Symlinks

When developing Pennyfarthing itself, `.claude/` directories (commands, agents, skills, etc.) are symlinks to `pennyfarthing-dist/`. Creating or editing files in the source automatically makes them available - no copy step needed.

```bash
# .claude/commands -> ../pennyfarthing-dist/commands
# .claude/agents -> ../pennyfarthing-dist/agents
# etc.
```

---

## Rotated Vertical Text for Collapsed Panel Labels

For collapsible panels, use rotated text labels on the expand button:

```html
<button class="panel-expand-btn">
  <span class="expand-label">LABEL</span>
</button>
```

```css
.panel-expand-btn {
  width: 20px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
}

.panel-expand-btn .expand-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);  /* reads top-to-bottom */
}
```

Used in: File panel expand button (`packages/cyclist/src/public/`)

---

---

## Cyclist Notification Pattern

The message view in Cyclist serves as the notification system. Don't add toast notifications or separate notification UI - errors and status messages should go to console.error/console.log. The message stream IS the user's feedback channel.

```javascript
// Good: Log to console, update tooltip for context
catch (err) {
  console.error(`[Component] Failed to do thing: ${path}`, err);
  element.title = 'Operation failed - see console for details';
}

// Bad: Don't add toast/notification UI
showToast('Error: operation failed');  // Unnecessary layer
```

Used in: DiffViewer file path click handler (35-11)

---

*Add implementation patterns discovered during development below*
