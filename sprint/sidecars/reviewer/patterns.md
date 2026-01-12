# Reviewer Agent Patterns

> Pennyfarthing-specific code review patterns

## Preflight Checks

### Run Before Review
```bash
# Single-repo: tests and lint
cd $CLAUDE_PROJECT_DIR && just test
cd $CLAUDE_PROJECT_DIR && just lint

# Multi-repo: use repo-utils.sh
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
for repo in $(get_repo_names); do
    cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")
    $(get_test_command "$repo")
    $(get_lint_command "$repo")
done
```

## Forbidden Patterns

### Auto-Block If Found
- `t.Skip()` without explanation
- `console.log` in production code
- `dangerouslySetInnerHTML` without sanitization
- Hardcoded credentials or secrets
- `// TODO` without issue reference

## Handoff Format

### Approval
```markdown
## Reviewer Assessment
**Decision:** APPROVED
**Tests:** All passing
**Security:** No issues found

Ready for SM to finish story.
```

### Rejection
```markdown
## Reviewer Assessment
**Decision:** CHANGES REQUESTED
**Issues:**
1. [Issue] - [file:line]

Returning to Dev for fixes.
```

---

*Add review patterns discovered during code review below*
