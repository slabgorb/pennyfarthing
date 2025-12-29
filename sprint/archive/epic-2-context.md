# Epic 2: Sprint Operations Polish - Technical Context

**Generated:** 2025-12-24
**Epic Points:** 8 (3 done, 5 remaining)
**Stories:** 4 (1 done, 3 remaining)
**Source:** Sprint 1 Retrospective

---

## Epic Overview

Housekeeping improvements from Sprint 1 retrospective. Automates manual workflows and improves developer experience. Focus on tooling and maintenance rather than new features.

---

## Completed Work

### Story 2-1: Automate Jira sync in SM finish workflow (3 pts) - DONE
- Integrated `jira-sync-story.sh` into SM finish execution
- Non-blocking: Jira errors don't prevent story completion
- PR: https://github.com/1898andCo/pennyfarthing/pull/9

---

## Remaining Stories

| ID | Title | Points | Priority |
|----|-------|--------|----------|
| 2-2 | Create sprint metrics script | 2 | P2 |
| 2-3 | Add --auto-pr flag to finish-story flow | 2 | P2 |
| 2-4 | Prune stale sidecar entries | 1 | P2 |

---

## Story 2-2: Create Sprint Metrics Script

### Current State
- No sprint metrics script exists
- Sprint data lives in `sprint/current-sprint.yaml`
- 14 utility scripts already exist in `scripts/utils/`
- Similar pattern: `check-status.sh` reads sprint state

### Technical Approach
1. Create `scripts/utils/sprint-metrics.sh`
2. Parse `sprint/current-sprint.yaml` using yq or grep
3. Calculate:
   - Points burned vs remaining
   - Story completion count
   - Days remaining in sprint
   - Percentage complete
4. Output human-readable summary

### Files to Create/Modify
- `scripts/utils/sprint-metrics.sh` (new, ~80 lines)

### Acceptance Criteria
- [ ] `scripts/utils/sprint-metrics.sh` displays current sprint stats
- [ ] Shows points completed/remaining/percentage
- [ ] Readable output suitable for status reports

### Testing Strategy
- Run script and verify output against manual count
- Test with various sprint states (empty, partial, complete)

---

## Story 2-3: Add --auto-pr Flag to Finish-Story Flow

### Current State
- SM finish flow in `assets/core/subagents/sm-finish-execution.md` (143 lines)
- Currently commits archive changes but doesn't create PR
- `gh pr create` patterns exist in project (used in other workflows)
- PR creation is manual step after story completion

### Technical Approach
1. Add optional `--auto-pr` flag handling to sm-finish-execution.md
2. After Step 8 (commit), check for flag
3. If set, run `gh pr create` with standard template
4. Handle multi-repo scenarios (create PR in each repo with changes)
5. Default: manual (opt-in automation)

### Files to Modify
- `assets/core/subagents/sm-finish-execution.md` - add Step 9 for PR creation

### Acceptance Criteria
- [ ] --auto-pr flag triggers automatic PR creation
- [ ] PR uses standard template with story context
- [ ] Works for both single-repo and multi-repo stories

### Testing Strategy
- Test without flag (no PR created)
- Test with flag (PR created)
- Test multi-repo scenario

---

## Story 2-4: Prune Stale Sidecar Entries

### Current State
Sidecar files across 10 agents have grown significantly:

| Sidecar | Total Lines | Files |
|---------|-------------|-------|
| architect-sidecar | 412 | decisions, gotchas, patterns |
| dev-sidecar | 361 | decisions, gotchas, patterns |
| devops-sidecar | 459 | decisions, gotchas, patterns |
| orchestrator-sidecar | 227 | process-patterns |
| pm-sidecar | 1131 | 5 files (largest) |
| reviewer-sidecar | 385 | decisions, gotchas, patterns |
| sm-sidecar | 372 | decisions, gotchas, patterns |
| tea-sidecar | 368 | decisions, gotchas, patterns |
| ux-designer-sidecar | 442 | decisions, gotchas, patterns |
| **Total** | **4157 lines** | |

Target: 5-15 entries per file (roughly 50-150 lines per file)

### Technical Approach
1. Review each sidecar directory
2. For each file:
   - Identify outdated/redundant entries
   - Keep most valuable 5-15 entries
   - Move pruned entries to `sprint/archive/sidecar-archive/`
3. Prioritize keeping:
   - Recent entries (last 2 sprints)
   - Entries referenced in current workflows
   - Unique insights not documented elsewhere

### Files to Modify
- All files in `.claude/project/agents/*-sidecar/`
- Create `sprint/archive/sidecar-archive/` for archived entries

### Acceptance Criteria
- [ ] Each sidecar has 5-15 relevant entries
- [ ] Outdated entries archived to sprint/archive/
- [ ] All remaining entries verified as current

### Testing Strategy
- Manual review of each file
- Verify no broken references to archived content

---

## Dependencies & Risks

**Dependencies:**
- None between remaining stories - can be done in any order

**Risks:**
- 2-4 (sidecar pruning) is subjective - may need user input on what to keep
- 2-3 (auto-pr) needs testing in actual PR creation scenarios

**Mitigations:**
- For 2-4: Start with obviously outdated entries, confirm approach with user
- For 2-3: Test on feature branch before merging

---

## Recommended Story Order

1. **Story 2-2** (2 pts) - Sprint metrics script - standalone utility, no dependencies
2. **Story 2-4** (1 pts) - Prune sidecars - housekeeping, reduces context load
3. **Story 2-3** (2 pts) - Auto-PR flag - enhances existing workflow

---

*Context generated by SM (Prospero)*
