# Story 38-2: Add Status Tags to Agent Files - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 38 - Agent File Modernization |
| Points | 1 |
| Priority | P2 |
| Workflow | trivial |
| Repos | pennyfarthing |

## Problem Statement

Users cannot easily distinguish battle-tested agents from experimental ones. This causes confusion about which agents are ready for production use vs which are still being refined.

## Technical Approach

Add `<status>` tags to all 10 main agent files to clearly signal maturity:

### Production Agents (TDD core - battle-tested)
- `sm.md` - Scrum Master
- `tea.md` - Test Engineer/Architect
- `dev.md` - Developer
- `reviewer.md` - Code Reviewer

### Experimental Agents (not yet modernized)
- `orchestrator.md` - Meta Operations
- `pm.md` - Product Manager
- `architect.md` - System Architect
- `devops.md` - DevOps Engineer
- `tech-writer.md` - Technical Writer
- `ux-designer.md` - UX Designer

## Files to Modify

| File | Change |
|------|--------|
| `pennyfarthing-dist/agents/sm.md` | Add `<status>production</status>` |
| `pennyfarthing-dist/agents/tea.md` | Add `<status>production</status>` |
| `pennyfarthing-dist/agents/dev.md` | Add `<status>production</status>` |
| `pennyfarthing-dist/agents/reviewer.md` | Add `<status>production</status>` |
| `pennyfarthing-dist/agents/orchestrator.md` | Add `<status>experimental</status>` |
| `pennyfarthing-dist/agents/pm.md` | Add `<status>experimental</status>` |
| `pennyfarthing-dist/agents/architect.md` | Add `<status>experimental</status>` |
| `pennyfarthing-dist/agents/devops.md` | Add `<status>experimental</status>` |
| `pennyfarthing-dist/agents/tech-writer.md` | Add `<status>experimental</status>` |
| `pennyfarthing-dist/agents/ux-designer.md` | Add `<status>experimental</status>` |
| `pennyfarthing-dist/agents/README.md` | Add Production vs Experimental section |

## Tag Placement

Add status tag after the `<persona>` section in each agent file:

```markdown
<persona>
...
</persona>

<status>production</status>
```

## README Update

Add a section to `pennyfarthing-dist/agents/README.md`:

```markdown
## Agent Maturity

### Production Agents
These agents follow the TDD workflow and are battle-tested:
- **SM** - Scrum Master (story coordination)
- **TEA** - Test Engineer/Architect (test writing)
- **Dev** - Developer (implementation)
- **Reviewer** - Code Reviewer (quality gates)

### Experimental Agents
These agents are available but not yet modernized:
- **Orchestrator** - Meta operations
- **PM** - Product Manager
- **Architect** - System Architect
- **DevOps** - Infrastructure
- **Tech Writer** - Documentation
- **UX Designer** - UI design
```

## Acceptance Criteria

- [ ] All 10 main agents have `<status>` tag
- [ ] README documents production vs experimental
- [ ] Users know which agents are battle-tested

## Testing Strategy

Manual verification:
- Grep for `<status>` in all agent files
- Verify README has maturity section
- Count: 4 production, 6 experimental
