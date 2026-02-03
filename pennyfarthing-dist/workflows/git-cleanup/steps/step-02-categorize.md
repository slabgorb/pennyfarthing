# Step 2: Categorize Changes

Group uncommitted changes by initiative type, accounting for multi-repo structure.

## Objective

Organize scattered changes into logical groups that can be committed separately. Each group becomes one branch + commit.

## Multi-Repo Awareness

Changes may span multiple repos. Group by **initiative**, not by repo:

```
Group: "Todos WebSocket feature"
  - pennyfarthing/packages/cyclist/src/main.ts
  - pennyfarthing/packages/cyclist/src/websocket.ts
  - pennyfarthing/packages/cyclist/src/public/hooks/useTodos.ts
```

All files in a group get committed together in their respective repos.

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
2. **By Feature** - Related functionality across files/repos
3. **By Directory** - Files in same directory often belong together
4. **By File Type** - Docs together, configs together, source together

## Execution

### 2.1 Analyze Change Patterns

For each changed file across all repos, determine:
- Which initiative type it belongs to
- If it relates to an active story
- If it should group with other files
- Which repo it's in

### 2.2 Propose Groupings

Present proposed groups in this format:

```
## Proposed Change Groups

### Group 1: {descriptive_name}
**Type:** {feat|fix|chore|docs|refactor|test}
**Branch:** `{type}/{description}`
**Commit:** `{type}({scope}): {message}`

**Repo: pennyfarthing**
- `packages/cyclist/src/main.ts` (M)
- `packages/cyclist/src/websocket.ts` (M)

**Repo: pennyfarthing-orchestrator**
- `sprint/current-sprint.yaml` (M)

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

## Approval Gate

**This step requires user approval before execution.**

Present summary:

```
## Summary

Total groups: {n}
- Quick commits: {count}
- Tracked stories: {count}
- Skipped: {count}

Repos affected: {list}
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
