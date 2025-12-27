# Story 2-4 Handoff: Prune Stale Sidecar Entries

## Status
**Phase:** dev | **Status:** in-progress | **Branch:** feat/2-4-prune-stale-sidecars

## Acceptance Criteria
- [ ] Each sidecar has 5-15 relevant entries per file
- [ ] Outdated entries archived to sprint/archive/sidecar-archive/
- [ ] All remaining entries verified as current

## Work Completed
1. Created archive directory: `sprint/archive/sidecar-archive/`
2. Archived pm-sidecar originals to `sprint/archive/sidecar-archive/pm-sidecar/`
3. Analyzed all 11 skills to identify redundancy

## Key Finding: PM Sidecar Redundancy

The pm-sidecar files (1,131 lines total) are almost entirely redundant:

| PM Sidecar File | Lines | Redundant With |
|-----------------|-------|----------------|
| `agentic-architecture.md` | 169 | `skills/agentic-patterns/SKILL.md` |
| `best-practices.md` | 227 | `skills/agentic-patterns/SKILL.md` |
| `claude-code-patterns.md` | 230 | Generic Claude Code docs (not PM-specific) |
| `mcp-protocol.md` | 232 | Generic MCP docs (not PM-specific) |
| `pennyfarthing-architecture-analysis.md` | 273 | Historical analysis, now outdated |

**Action:** DELETE all 5 pm-sidecar files. They duplicate skills or contain outdated/generic content.

## Sidecars to Process

| Sidecar | Files | Lines | Action Needed |
|---------|-------|-------|---------------|
| pm-sidecar | 5 | 1,131 | DELETE all (redundant) |
| orchestrator-sidecar | 1 | 227 | Compare with skills, prune |
| devops-sidecar | 3 | ~400 | Compare with skills, prune |
| ux-designer-sidecar | 3 | ~400 | Compare with skills, prune |
| architect-sidecar | 3 | ~300 | Compare with skills, prune |
| dev-sidecar | 3 | ~250 | Compare with skills, prune |
| tea-sidecar | 3 | ~250 | Compare with skills, prune |
| reviewer-sidecar | 3 | ~250 | Compare with skills, prune |
| sm-sidecar | 3 | ~200 | Compare with skills, prune |

**Total:** 4,157 lines → Target: ~300-500 lines (5-15 entries × 3 files × 9 agents)

## Skills Available (for redundancy check)

1. `agentic-patterns` - ReAct, multi-agent coordination
2. `code-review` - Review checklists
3. `context-engineering` - Context window management
4. `dev-patterns` - Development gotchas
5. `jira-cli` - Jira commands
6. `just` - Just recipes
7. `sprint-context` - Sprint status
8. `story-management` - Story sizing
9. `testing` - TDD patterns
10. `yq` - YAML processing
11. `persona-benchmark` - Benchmarking

## Pruning Strategy

For each sidecar:
1. Read all files in the sidecar
2. Compare against relevant skills
3. DELETE if content duplicates a skill
4. KEEP only agent-specific learnings:
   - Decisions made for THIS project
   - Gotchas specific to THIS agent's role
   - Patterns that aren't in skills

## Standard Sidecar Structure (Target)

Each agent should have max 3 files with 5-15 entries each:
```
{agent}-sidecar/
├── patterns.md    # How to do things well (5-15 entries)
├── gotchas.md     # Mistakes to avoid (5-15 entries)
└── decisions.md   # Why we chose X (5-15 entries)
```

## Next Steps

1. Delete all pm-sidecar files (confirmed redundant)
2. Process orchestrator-sidecar
3. Process remaining 7 sidecars
4. Verify line counts
5. Commit, push, create PR

## Git State
- Branch: `feat/2-4-prune-stale-sidecars` (clean, checked out)
- Archive created but not committed yet
