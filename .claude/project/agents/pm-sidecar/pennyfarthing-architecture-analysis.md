# Pennyfarthing Architecture Analysis

> PM sidecar: Comprehensive codebase analysis from December 2024 exploration

## Overview

This document captures the findings from a thorough exploration of the Pennyfarthing codebase, comparing current implementation against agentic programming best practices.

**Overall Assessment:** A/A+ on most patterns, with specific gaps in persistence, configuration, and resilience.

---

## Agent Architecture

### Hierarchy (10 Agents Total)

**Strategic Agents (4)** - Full project scope, orchestrate decisions:
- `/orchestrator` - Master coordinator (DEATH persona, process improvement)
- `/pm` - Product Manager (strategic planning, prioritization)
- `/architect` - System Architect (design decisions, patterns)
- `/sm` - Scrum Master (story setup, TDD flow orchestration)

**Tactical Agents (5)** - Story-scoped execution in TDD flow:
- `/tea` - Test Engineer/Architect (RED state, test writing)
- `/dev` - Developer (GREEN state, implementation)
- `/reviewer` - Code Reviewer (quality enforcement, critical analysis)
- `/tech-writer` - Technical Writer (documentation)
- `/ux-designer` - UX Designer (design specs, wireframes)

**Support Agents (1)**:
- `/devops` - DevOps Engineer (infrastructure, CI/CD)

### The Blessed TDD Path

```
/new-work → SM (research, select, setup)
         → TEA (write failing tests, RED)
         → Dev (implement to GREEN, create PR)
         → Reviewer (adversarial review)
         → SM (finish: archive, merge, close)
```

### Subagent Architecture (13 Prompts)

**Pattern:** Main agent (Opus) thinks/decides → Helper (Haiku) executes mechanics.

Key subagents:
- `workflow-status-check.md` - Detect current phase
- `sm-work-research.md` - Scan backlog, present stories
- `sm-story-setup.md` - Create branches, session, Jira setup
- `tea-handoff.md` / `dev-handoff.md` / `reviewer-handoff-*.md` - Phase transitions
- `testing-runner.md` - Central test execution

---

## What's Working Well

### 1. Session File as State Machine
- `.session/{story-id}-session.md` tracks phase (sm/tea/dev/review/approved)
- Assessment sections create clear handoff points
- Subagents verify state before proceeding

### 2. Artifact-Based Communication
- Zero use of stdout for state passing between agents
- All state persisted to files before next agent invoked
- Session file IS the artifact

### 3. Context Budgeting
- Strategic agents: 500-800 lines
- Tactical agents: 450-600 lines
- Lazy loading for detailed docs
- Hybrid just-in-time with base upfront

### 4. Absolute Path Usage
All commands use `$PROJECT_ROOT` as base - prevents the #1 source of failures.

### 5. Persona System
- Themeable characters (discworld, star-trek, minimalist)
- Dynamic loading via `agent-session.sh`
- Consistent across all agents

### 6. Automatic Behavior via Scripts
- Persona loading via `agent-session.sh` (not manual steps)
- Reduces failure modes during handoffs

### 7. Multi-Repo Support
- `repo-utils.sh` for dynamic iteration
- Supports both legacy env vars and `repos.yaml`
- Repo-aware commands

### 8. Worktree Support
- Isolated parallel work sessions
- Per-worktree session files
- Port management in session files

---

## Gap Analysis

### Critical Gaps

| Gap | Impact | Best Practice Violated |
|-----|--------|----------------------|
| 7 missing agent sidecars | No persistent learning | "Sidecar memory captures patterns" |
| No permissions in settings | Three-tier model undefined | "Permission rules for tool access" |
| No hooks in settings | Critical behavior not automated | "Hooks ensure deterministic control" |
| 10 thin command files | Poor discoverability | "Skills need clear descriptions" |

### Resilience Gaps

| Gap | Impact | Best Practice Violated |
|-----|--------|----------------------|
| No retry logic | Transient failures fatal | "Implement retry with backoff" |
| No checkpointing | Long ops not resumable | "Regular checkpoints for long tasks" |
| Manual context checks | 70% threshold not enforced | "Automatic context monitoring" |
| No structured logging | Hard to debug failures | "JSON-formatted logs with timestamps" |

### Documentation Gaps

| Gap | Files Affected |
|-----|---------------|
| Thin command files | 10 agent commands (3 lines each) |
| Incomplete strategic guide | `strategic-agent-behavior.md` |
| Vague skill descriptions | `settings.local.json` descriptions |

---

## Error Handling Patterns

### Strengths

- Scripts use strict mode: `set -e` or `set -euo pipefail`
- Clear exit codes for failure conditions
- Descriptive error messages with recovery instructions
- Pre-handoff verification blocks invalid transitions

### Weaknesses

- No automatic retry logic
- No checkpointing for long operations
- Errors logged to stderr only (no structured logging)
- No "resume from failure" workflow

### Handoff Safeguards

```
1. Agent completes work
2. Agent WRITES assessment to session file
3. Agent VERIFIES assessment written
4. Agent spawns handoff subagent
5. Subagent verifies state (tests, git status)
6. Subagent updates workflow checkboxes
7. THEN offer next handoff
```

---

## Context Management

### Loading Strategy

**Upfront (Base Context):**
- Sprint status (100-200 lines)
- Active work session file (50-100 lines)
- Agent persona (auto-loaded via script)

**Just-in-Time (Lazy Loading):**
- Repo-specific context (30-50 lines)
- Skill documentation (on demand)
- Epic definitions (PM only)
- File summaries (SM story selection)

### Actual File Sizes

- Agent files: 104-395 lines (most 150-350)
- Subagent files: 43-361 lines (most 100-200)
- Context files: 30-50 lines
- Total system: ~4,500 lines across all agents

### Optimization Opportunities

1. `testing-runner.md` (361 lines) - could split
2. `workflow-status-check.md` (255 lines) - could modularize
3. Sprint status - could load only story section for tactical agents
4. Documentation references - could use transclusion

---

## Sidecar Memory System

### Current State

Only 2 sidecars implemented:
- `orchestrator-sidecar/process-patterns.md`
- `pm-sidecar/` (4 files from recent research)

### Missing Sidecars

7 agents without persistent memory:
- dev, tea, reviewer, sm, architect, tech-writer, ux-designer, devops

### Sidecar Structure

```
.claude/project/agents/{agent}-sidecar/
├── patterns.md      # How to do things well
├── gotchas.md       # Mistakes to avoid
└── decisions.md     # Why we chose X
```

---

## Configuration State

### settings.local.json

**Present:**
- 23 skill mappings to command files
- Skill descriptions for discoverability

**Missing:**
- `permissions` section (three-tier model)
- `hooks` section (critical behavior automation)
- `context_budget` section (per-agent limits)
- Model selection per agent

---

## Recommendations Summary

### High Priority

1. Create 7 missing agent sidecars with patterns/gotchas/decisions
2. Add permissions section implementing three-tier model
3. Add hooks section for critical behavior automation
4. Expand 10 thin command files with workflow context

### Medium Priority

5. Add retry utility with exponential backoff
6. Add checkpointing for long operations
7. Complete strategic-agent-behavior guide
8. Add automatic context checking

### Lower Priority

9. Split large subagents (testing-runner, workflow-status-check)
10. Add structured logging
11. Add session file locking
12. Optimize sprint status loading

---

## Comparison to Best Practices

| Best Practice | Pennyfarthing | Grade |
|---------------|---------------|-------|
| Context loaded just-in-time | Hybrid: base upfront, rest lazy | A- |
| Agents stay within 500-800 lines | Yes, explicitly budgeted | A |
| Automatic for critical behavior | Yes, persona loading, handoffs | A |
| Instructional for optional behavior | Yes, reasoning modes, workflows | A |
| Artifacts over pipes | Yes, session files are artifacts | A+ |
| Sidecar memory system | Partial (2 of 9 agents) | B- |
| Permission configuration | Missing | D |
| Hook configuration | Missing | D |
| Retry/checkpoint resilience | Missing | D |
| Context optimization hooks | Manual checks at 70% | B+ |
| Helper agents for mechanical work | Yes, Haiku subagents | A |

---

*Analysis conducted: December 2024*
*Next review: After implementing recommended improvements*
