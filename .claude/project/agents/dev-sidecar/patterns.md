# Dev Agent Patterns

> Pennyfarthing-specific implementation patterns

## Absolute Paths

Always use `$PROJECT_ROOT` as base for all file operations:
```bash
# Correct
cd $PROJECT_ROOT/$API_REPO && just test

# Wrong - assumes current directory
cd API && just test
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

---

*Add implementation patterns discovered during development below*
