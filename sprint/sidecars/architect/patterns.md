# Architect Agent Patterns

> Pennyfarthing-specific architecture patterns

## ADR Format

### Architecture Decision Record Template
```markdown
# ADR-NNN: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[What is the issue we're addressing?]

## Decision
[What is the change we're making?]

## Consequences
[What are the positive and negative results?]
```

---

## Pattern: Commands Reference Skills for CLI Documentation

**Problem:** Commands that use external CLIs (like `jira`) duplicate examples inline. These examples drift out of sync with the authoritative skill documentation.

**Solution:** Commands should reference skills rather than duplicate CLI examples.

```markdown
## Prerequisites
- `jira` CLI installed
- See `jira` skill for complete CLI reference
```

**Separation of Concerns:**
| Type | Purpose | Contains |
|------|---------|----------|
| Command | Workflow steps | "Do X, then Y, then Z" |
| Skill | Reference documentation | "Here's how tool X works" |

**When to Apply:**
- Command uses external CLI (jira, gh, kubectl, etc.)
- Command has inline examples that could go stale
- Skill already exists with authoritative documentation

**Example Fix:**
```markdown
# Before (in command file)
## Create Epic
jira issue create -tEpic -s"Title"  # Missing -p flag!

# After (in command file)
**See `jira` skill for complete CLI reference.**
```

---

*Add architecture patterns discovered during design work below*
