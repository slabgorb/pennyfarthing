# Jira-Pennyfarthing Story Link Audit Report

**Generated:** 2026-01-17
**Branch:** feat/47-5-retrofit-historical-epics-jira

## Executive Summary

| Metric | Count |
|--------|-------|
| Stories with MSSCI IDs (linked) | 104 |
| Stories with local IDs (unlinked) | **303** |
| **Total Stories** | **407** |
| **Link Coverage** | **25%** |

---

## Breakdown by File

| File | Local IDs | MSSCI IDs | Notes |
|------|-----------|-----------|-------|
| current-sprint.yaml | 44 | 22 | Active sprint work |
| completed.yaml | 74 | 35 | Sprints 2-7, 10 completed |
| sprint-9-final.yaml | 19 | 44 | Mixed linked/unlinked |
| sprint-10-final.yaml | 42 | 0 | Recently archived, no links |
| backlog.yaml | 38 | 0 | Future work, no links |
| Other archive files | 86 | 3 | Pre-Jira era |
| **TOTAL** | **303** | **104** | |

---

## Current Sprint (44 unlinked stories)

### Epic MSSCI-11599: Customizable Workflow Engine
| Story ID | Title | Status |
|----------|-------|--------|
| 31-15 | Background task completion notifications in Cyclist | done |
| 31-17 | Bug: Trivial workflow phase naming inconsistency | backlog |

### Epic MSSCI-11705: Runtime Permission Management
| Story ID | Title | Status |
|----------|-------|--------|
| 33-5 | Permission presets by workflow | backlog |
| 33-7 | Wire approval gate into tool execution pipeline | done |

### Epic MSSCI-11715: Cyclist UI/UX Improvements
| Story ID | Title | Status |
|----------|-------|--------|
| 35-13 | Window state persistence | done |
| 35-14 | Settings architecture cleanup and consolidation | done |
| 35-15 | Collapsible Bash tool output in message stream | backlog |

### Epic MSSCI-11794: Technical Debt & Bug Fixes (0 stories in Jira!)
| Story ID | Title | Status |
|----------|-------|--------|
| 37-1 | Clean up stale TODO comments | done |
| 37-2 | Fix flaky timestamp test | done |
| 37-3 | Remove deprecated WebSocket terminal mode | done |
| 37-4 | Remove or fix skipped test suites | done |
| 37-5 | Implement agent-evaluation.ts file reading | done |
| 37-6 | Fix pattern-based question detection | done |
| 37-7 | Clean up copy mode migration code | backlog |
| 37-8 | Fix persona IPC handlers returning incomplete data | done |
| 37-9 | Add test coverage tooling | backlog |
| 37-10 | Fix background task shell script arithmetic | done |
| 37-11 | Remove persona-config.local.yaml deprecation | backlog |
| 37-12 | Audit and fix context.js script inclusion | backlog |
| 37-13 | Fix 15-3 sidebar section styling tests | backlog |
| 37-14 | Bug: Handoff buttons show hardcoded theme characters | done |
| 37-15 | Bug: Workflow indicator shows hardcoded TDD phases | done |
| 37-16 | Bug: Agent high-context circuit breaker not triggering | done |
| 37-17 | Bug: pennyfarthing-dist missing commands and guides directories | done |
| 37-18 | Bug: cyclist-doctor reports false failures for workspace deps | backlog |
| 37-19 | Bug: workflows directory not included in installation symlinks | backlog |

### Epic MSSCI-11795: Agent File Modernization (0 stories in Jira!)
| Story ID | Title | Status |
|----------|-------|--------|
| 38-1 | Fix stale references in agent files | done |
| 38-2 | Add status tags to agent files | done |
| 38-3 | Modernize PM agent for custom workflows | done |
| 38-4 | Modernize Architect agent for custom workflows | done |
| 38-5 | Modernize DevOps agent for custom workflows | done |
| 38-6 | Modernize Tech Writer agent for custom workflows | backlog |
| 38-7 | Modernize UX Designer agent for custom workflows | backlog |
| 38-8 | Modernize Orchestrator agent | done |
| 38-9 | SM workflow routing from story tags | done |
| 38-10 | Centralize handoff logic and honor auto/manual mode | backlog |
| 38-11 | Bug: Workflow indicator missing finish step | backlog |
| 38-12 | Consolidate duplicated instructions to shared-agent-behavior.md | done |
| 38-13 | Auto-mode context clear and agent reload on handoff | backlog |

### Epic MSSCI-11796: Jira-Pennyfarthing Sync (1 story in Jira)
| Story ID | Title | Status |
|----------|-------|--------|
| 47-1 | Auto-create Jira epic on local epic creation | done |
| 47-2 | Sync sprint numbers with Jira sprint IDs | done |
| 47-4 | Bidirectional sync script for sprint YAML and Jira | backlog |
| 47-5 | Retrofit historical epics with Jira links | in_progress |
| 47-6 | Document Jira auto-creation for SM setup flow | backlog |

---

## Backlog (38 unlinked stories)

### Epic 27: Skill Frontmatter Enhancement
- 27-1 through 27-5 (5 stories)

### Epic 39: Quality Assurance Oversight Capabilities
- 39-1 through 39-7 (7 stories)

### Epic 40: Scale Adaptation and Brownfield Support
- 40-1 through 40-6 (6 stories)

### Epic 41: Precision/Recall Detection Scoring
- 41-1 through 41-3 (3 stories)

### Epic 42: Anchored Rubric Criteria
- 42-1 through 42-3 (3 stories)

### Epic 43: False Positive Traps (Red Herrings)
- 43-1 through 43-3 (3 stories)

### Epic 44: Multi-Judge Validation
- 44-1 through 44-4 (4 stories)

### Epic 45: Gold Standard References
- 45-1 through 45-4 (4 stories)

### Epic 46: Difficulty Profile Enhancement
- 46-1 through 46-3 (3 stories)

---

## Completed.yaml (74 unlinked stories)

Stories from Sprints 2-7 that predate Jira integration:

| Sprint | Epic | Story IDs | Count |
|--------|------|-----------|-------|
| Sprint 2 | Epic 2 (Sprint Operations) | 2-1 to 2-7 | 7 |
| Sprint 2 | Epic 4 (Config Framework) | 4-1 to 4-6 | 6 |
| Sprint 2 | Epic 5 (Theme CLI) | 5-1 to 5-4 | 4 |
| Sprint 3 | Epic 3 (Context Mgmt) | 3-2, 3-3, 3-4 | 3 |
| Sprint 3 | Epic 6 (Theme Wizard) | 6-1 to 6-5 | 5 |
| Sprint 4 | Epic 11 (OCEAN Viz) | 11-1 to 11-12 | 12 |
| Sprint 6 | Epic 10 (Choreography) | 10-1 to 10-4 | 4 |
| Sprint 7 | Epic 7 (Benchmarking) | 7-1 to 7-5 | 5 |
| Sprint 7 | Epic 18 (Monorepo) | 18-1 to 18-6 | 6 |
| Sprint 7 | Epic 19 (Telemetry) | 19-1 to 19-9 | 9 |
| Sprint 7 | Epic 22 (Verbose Mode) | 22-1 to 22-7 | 7 |
| Sprint 10 | Epic 32 (BMAD) | 32-2, 32-3 | 2 |
| Sprint 10 | Epic 34 (Cyclist DX) | 34-1 to 34-5 | 5 |

---

## Sprint Archives (61 unlinked stories)

### sprint-10-final.yaml (42 stories, 0 MSSCI)
| Epic | Story IDs | Count |
|------|-----------|-------|
| MSSCI-11599 (Workflow Engine) | 31-1 to 31-16 | 16 |
| MSSCI-11705 (Permissions) | 33-1 to 33-6 | 6 |
| MSSCI-11715 (Cyclist UI/UX) | 35-1 to 35-13 | 13 |
| MSSCI-11728 (OTEL Enrichment) | 36-1 to 36-9 | 7 |

### sprint-9-final.yaml (19 unlinked, 44 linked)
| Epic | Story IDs |
|------|-----------|
| Epic 22 | 22-6 |
| Epic 23 | 23-1 to 23-9 (9 stories) |
| Epic 24 | 24-3, 24-9 |
| Epic 25 | 25-6, 25-7 |
| Epic 26 | 26-1 |
| Epic 29 | 29-1 to 29-4 |

---

## Jira Epic Status

Queried Jira for stories under pennyfarthing-labeled epics:

| Epic | Jira Key | Stories in Jira | Unlinked in YAML |
|------|----------|-----------------|------------------|
| Workflow Engine | MSSCI-11599 | 13 | 2 |
| Permission Mgmt | MSSCI-11705 | 6 | 2 |
| Cyclist UI/UX | MSSCI-11715 | 12 | 3 |
| OTEL Enrichment | MSSCI-11728 | 6 | 0 |
| **Tech Debt** | MSSCI-11794 | **0** | **14** |
| **Agent Modern** | MSSCI-11795 | **0** | **13** |
| **Jira Sync** | MSSCI-11796 | **1** | **5** |

---

## Epics Without Jira Presence

These epics exist only in YAML with no corresponding Jira epic:

| Local Epic | Stories | Sprint | Description |
|------------|---------|--------|-------------|
| Epic 2 | 7 | Sprint 2 | Sprint Operations Polish |
| Epic 3 | 3 | Sprint 3 | Context Management |
| Epic 4 | 6 | Sprint 2 | Configuration Framework |
| Epic 5 | 4 | Sprint 2 | Theme Management CLI |
| Epic 6 | 5 | Sprint 3 | Interactive Theme Wizard |
| Epic 7 | 5 | Sprint 7 | Benchmarking |
| Epic 10 | 4 | Sprint 6 | Choreography Patterns |
| Epic 11 | 12 | Sprint 4 | OCEAN Visualization |
| Epic 18 | 6 | Sprint 7 | Monorepo Consolidation |
| Epic 19 | 9 | Sprint 7 | Rich Agent Telemetry |
| Epic 22 | 7 | Sprint 7 | Verbose Mode |
| Epic 23 | 9 | Sprint 9 | Cyclist Command Integration |
| Epic 26 | 1 | Sprint 9 | Dogfooding Audit |
| Epic 27 | 5 | Backlog | Skill Frontmatter Enhancement |
| Epic 29 | 4 | Sprint 9 | Wire Up Orphaned Code |
| Epic 34 | 5 | Sprint 10 | Cyclist DX |
| Epic 39 | 7 | Backlog | QA Oversight Capabilities |
| Epic 40 | 6 | Backlog | Scale Adaptation |
| Epic 41-46 | 20 | Backlog | Benchmark Reliability (new) |

---

## Recommendations

### Priority 1: Active Epics with 0 Jira Stories (32 stories)
Create Jira stories for these epics that have active work but no Jira presence:
- **MSSCI-11794** (Tech Debt): 14 stories
- **MSSCI-11795** (Agent Modernization): 13 stories
- **MSSCI-11796** (Jira Sync): 5 stories

### Priority 2: Partial Epics (7 stories)
Link existing Jira stories to YAML entries that exist in both:
- MSSCI-11599: 31-15, 31-17
- MSSCI-11705: 33-5, 33-7
- MSSCI-11715: 35-13, 35-14, 35-15

### Priority 3: Sprint 10 Archive (42 stories)
Recently completed work with no Jira links. Consider:
- Batch create as historical record
- Or document as "pre-Jira-integration work"

### Priority 4: Backlog Epics (38 stories)
Create Jira epics and stories when pulled into sprint, not before.

### Priority 5: Historical (Sprints 2-7) (74+ stories)
Pre-Jira era. Options:
- Leave as-is with documentation note
- Batch import if needed for reporting
- Low value to retroactively create

---

## Actions Taken This Session

1. ✅ Converted 71 story IDs from local format to Jira keys
2. ✅ Removed redundant `jira:` fields after ID conversion
3. ✅ Generated this audit report

## Next Steps

- [ ] Create stories in Jira for Epics 37, 38, 47
- [ ] Link partial epic stories (31-15, 31-17, 33-5, 33-7, 35-13, 35-14, 35-15)
- [ ] Decide on historical story handling
- [ ] Update Story 47-5 acceptance criteria with audit findings
