# Story 31-9: Turn Optimization - Summary

## What Was Built

Added comprehensive turn optimization patterns across the Pennyfarthing agent framework to reduce API round-trips by an estimated 30-40%. This includes guidance in the dev-patterns skill (164 lines), Turn Efficiency sections in all 4 main agents, and batched command examples in 6 subagent prompts.

## Key Technical Decisions

1. **Batching Strategy**: Used `&&` for fail-safe chaining rather than `;` which continues on failure
2. **Scope**: Focused on agents/subagents with bash-heavy workflows, skipping edit-only handoffs (sm-handoff, reviewer-handoff-approve/reject)
3. **Documentation Over Code**: Chose documentation/guidance approach since turn efficiency is behavioral, not functional

## Implementation Patterns

- **Bash batching**: `git add . && git commit -m "msg" && git push` (3 turns → 1)
- **Parallel reads**: Multiple Read tool calls in single response
- **Glob brace expansion**: `**/*.{ts,tsx}` instead of two separate globs
- **Compound subagents**: Combining related steps (preflight + handoff) when human review not required

## Files Modified

| File | Changes |
|------|---------|
| `pennyfarthing-dist/skills/dev-patterns/SKILL.md` | +164 lines: Turn-Efficient Patterns section |
| `pennyfarthing-dist/agents/sm.md` | +24 lines: Turn Efficiency section |
| `pennyfarthing-dist/agents/tea.md` | +16 lines: Turn Efficiency section |
| `pennyfarthing-dist/agents/dev.md` | +24 lines: Turn Efficiency section |
| `pennyfarthing-dist/agents/reviewer.md` | +22 lines: Turn Efficiency section |
| `pennyfarthing-dist/agents/workflow-status-check.md` | +25 lines: Batched commands |
| `pennyfarthing-dist/agents/sm-finish-bookkeeping.md` | +22 lines: Batched commands |
| `pennyfarthing-dist/agents/sm-story-setup.md` | +18 lines: Batched commands |
| `pennyfarthing-dist/agents/dev-handoff.md` | +18 lines: Batched commands |
| `pennyfarthing-dist/agents/tea-handoff.md` | +11 lines: Batched commands |
| `pennyfarthing-dist/agents/reviewer-preflight.md` | +22 lines: Batched commands |

## Turn Budget Guidelines

| Story Size | Target Turns |
|------------|--------------|
| 1 point (trivial) | 10-15 |
| 2 points (small) | 15-25 |
| 3 points (medium) | 25-35 |
| 5 points (large) | 35-50 |

## Lessons for Future Work

1. **Documentation stories benefit from chore bypass** - TEA correctly identified no testable code
2. **Bash syntax validation** - Reviewer used `bash -n` to verify examples, good practice
3. **Scope discipline** - Not updating every subagent (kept scope to high-value targets)
4. **Measurable targets** - Including specific turn budgets makes guidance actionable

## PR & Merge

- **PR:** #233
- **Merged:** 2026-01-13
- **Branch:** feat/31-9-turn-optimization → develop (squash merge)
