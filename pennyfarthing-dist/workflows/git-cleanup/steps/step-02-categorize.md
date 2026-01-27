# Step 2: Categorize Changes

Group uncommitted changes by initiative type using conventional commit categories.

## Objective

Organize scattered changes into logical groups that can be committed separately with proper branch names and commit messages.

## Categorization Rules

### Prefix Reference

| Prefix | Type | Branch Pattern | Files Typically |
|--------|------|----------------|-----------------|
| `docs:` | Documentation | `docs/description` | `docs/*.md`, `README.md` |
| `chore:` | Maintenance | `chore/description` | configs, dependencies |
| `chore(sprint):` | Sprint tracking | `chore/sprint-update` | `sprint/*.yaml` |
| `chore(pennyfarthing):` | PF config | `chore/pf-description` | `.claude/**`, `.pennyfarthing/**` |
| `feat:` | New feature | `feat/story-id-desc` | `src/**`, `internal/**` |
| `fix:` | Bug fix | `fix/issue-desc` | various |
| `refactor:` | Code improvement | `refactor/description` | `src/**` |
| `test:` | Test changes | `test/description` | `**/tests/**`, `*.test.*` |

### Grouping Heuristics

1. **By Story ID** - If changes relate to a known story (check session files)
2. **By Directory** - Files in same directory often belong together
3. **By File Type** - Docs together, configs together, source together
4. **By Semantic Coupling** - Migration + model + handler for same feature

## Execution

### 2.1 Analyze Change Patterns

For each changed file, determine:
- Which initiative type it belongs to
- If it relates to an active story
- If it should group with other files

### 2.2 Propose Groupings

Present proposed groups in this format:

```
## Proposed Change Groups

### Group 1: {descriptive_name}
**Type:** {feat|fix|chore|docs|refactor|test}
**Branch:** `{type}/{description}`
**Commit:** `{type}({scope}): {message}`

Files:
- `{file_path}` ({status})
- `{file_path}` ({status})

Rationale: {why these files belong together}

---

### Group 2: ...
```

### 2.3 Handle Ambiguous Changes

For files that could belong to multiple groups:
- Present options to user
- Default to the smaller/more focused group
- Allow "skip" to leave uncommitted

## Tracking Decision

For each group, decide tracking level:

| Level | Branch | Jira | PR | Use When |
|-------|--------|------|-----|----------|
| **Quick** | `chore/*` | No | No | Maintenance, configs |
| **Tracked** | `feat/MSSCI-*` | Yes | Yes | Features worth tracking |

### Promoting to Tracked Story

If a group deserves Jira tracking (retroactive story):

1. Mark group with **[T]** Track in Jira
2. Provide: title, description, points (default: 2)
3. Workflow will: create Jira → branch → commit → PR → merge

This is the `/standalone` pattern integrated into cleanup.

## Approval Gate

**This step requires user approval before execution.**

Present summary:

```
## Summary

Total groups: {n}
- Quick commits: {count}
- Tracked stories: {count}
- Skipped: {count}

Files to commit: {count}

Ready to proceed?
```

---

**[E]** Edit groupings (modify a group)
**[T]** Track a group in Jira (promote to standalone story)
**[S]** Skip a group (leave those files uncommitted)
**[C]** Continue to execution

<!-- GATE -->
<!-- CYCLIST:CHOICES:E,T,S,C -->
