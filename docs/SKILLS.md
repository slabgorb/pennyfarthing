# Skills Reference

Skills are project-agnostic knowledge domains that agents can load on demand.

## Overview

Skills provide reusable knowledge that isn't tied to any specific project. They're loaded by agents when relevant tasks arise.

**Location:** `pennyfarthing/skills/`

## Available Skills

### agentic-patterns

**Purpose:** Core reasoning patterns for building effective LLM agents.

**Use when:** Designing agent behavior, debugging failures, improving reliability.

**Key concepts:**
- **ReAct** - Reasoning and Acting loop (Thought -> Action -> Observation)
- **Plan-and-Execute** - Decompose complex goals into sub-tasks
- **Self-Reflection** - Evaluate outputs before presenting
- **Confidence calibration** - Know when to ask vs act
- **Error recovery** - Retry patterns and graceful degradation
- **Multi-agent coordination** - Handoff patterns and state sync

**Example patterns:**
```
THOUGHT: What am I trying to accomplish?
ACTION: Execute tool based on reasoning
OBSERVATION: What was the result?
THOUGHT: Based on observation, what next?
```

---

### context-engineering

**Purpose:** Strategies for managing context windows efficiently.

**Use when:** Working on complex tasks, approaching context limits, designing subagent prompts.

**Key concepts:**
- **Just-in-time loading** - Don't pre-load everything, store references
- **Context editing** - Clear stale results, summarize findings
- **Subagent patterns** - Spawn for data-heavy tasks, receive summaries
- **Memory tools** - Session files, sidecars, progress logs
- **Context budgets** - Stay under 500-800 lines per activation

**Core principle:**
> Find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome.

---

### code-review

**Purpose:** Code review checklists and patterns.

**Use when:** Reviewing PRs, self-reviewing before commit, checking for common issues.

**Key checklists:**
- **API Handler Review** - Authorization, validation, error handling, tests
- **UI Component Review** - Props, loading states, errors, accessibility
- **Database Changes** - Migrations, indexes, constraints
- **Security** - SQL injection, XSS, auth, secrets
- **Performance** - N+1 queries, pagination, indexes, memoization

**Comment format:**
```
**[MUST FIX]** This leaks internal error details.
**[SUGGESTION]** Consider using useMemo here.
**[QUESTION]** What happens if clientId is undefined?
**[NICE]** Good use of the centralized utility!
```

---

### testing

**Purpose:** Test commands and TDD workflow patterns.

**Use when:** Writing tests, running test suites, debugging test failures.

**Key concepts:**
- Test command reference for API and UI
- TDD workflow (RED -> GREEN -> REFACTOR)
- Test patterns for each project type
- Coverage requirements and strategies
- Test isolation and setup patterns

**References:** `skills/testing/references/`

---

### story-management

**Purpose:** Story creation, sizing, and templates.

**Use when:** Creating stories, estimating points, writing acceptance criteria.

**Key concepts:**
- Story templates (feature, bug, tech debt)
- Sizing guidelines (1, 2, 3, 5, 8 points)
- Acceptance criteria patterns
- Definition of ready
- Definition of done

---

### sprint-context

**Purpose:** Sprint tracking and story management.

**Use when:** Managing sprint work, tracking progress, updating status.

**Key concepts:**
- Sprint YAML structure
- Story lifecycle (draft -> ready -> in_progress -> review -> done)
- Status updates and transitions
- Velocity tracking
- Backlog management

---

### jira-cli

**Purpose:** Jira integration using the CLI.

**Use when:** Syncing with Jira, creating issues, updating status.

**Key commands:**
- `jira issue create` - Create new issues
- `jira issue move` - Transition status
- `jira sprint add` - Add to sprint
- `jira issue view` - View issue details
- `jira issue list` - Query issues

---

### just

**Purpose:** Just command runner reference.

**Use when:** Running project commands via `just`.

**Key concepts:**
- Justfile patterns
- Common recipes (build, test, dev, lint)
- Variable substitution
- Recipe dependencies

**References:** `skills/just/references/`

---

### dev-patterns

**Purpose:** Implementation patterns and common gotchas.

**Use when:** Implementing features, debugging issues, following project conventions.

**Key concepts:**
- Project-specific coding patterns
- Common mistakes and fixes
- Error handling patterns
- Database patterns
- API patterns

---

### persona-benchmark

**Purpose:** Agent performance evaluation.

**Use when:** Evaluating agent behavior, tuning persona settings, benchmarking.

**Key concepts:**
- Benchmark test cases by agent type
- Scoring rubrics
- Performance metrics
- Persona effectiveness evaluation

---

### judge

**Purpose:** Evaluation rubrics for scoring agent responses.

**Use when:** Scoring responses from `/solo` or `/benchmark` runs.

**Key concepts:**
- **Generic Rubric** (25% each dimension):
  - Correctness - Technical accuracy
  - Depth - Thoroughness of analysis
  - Quality - Clarity and actionability
  - Persona - Character embodiment
- **Checklist Rubric** (for scenarios with baseline_issues):
  - Detection (50%) - Finding expected issues
  - Quality (25%) - Explanation quality
  - Persona (25%) - In-character delivery
- **Error-Detection Mode** (`--mode error-detection`):
  - TRAIL-aware scoring by error type
  - Per-type detection rates (reasoning, planning, execution)

**References:** `skills/judge/SKILL.md`

---

### finalize-run

**Purpose:** Result validation and persistence for benchmarking.

**Use when:** Saving benchmark results with proof-of-work.

**Key concepts:**
- Validates data integrity before saving
- Adds proof-of-work fields:
  - Timestamps
  - Token counts
  - Full responses
- Supports solo, benchmark result types
- Creates proper directory structure

**References:** `skills/finalize-run/SKILL.md`

---

## Skill Structure

Each skill follows this structure:

```
skills/
└── skill-name/
    ├── SKILL.md           # Main skill definition
    └── references/        # Supporting documentation (optional)
        ├── patterns.md
        ├── examples.md
        └── ...
```

### SKILL.md Format

```markdown
---
name: skill-name
description: Brief description of skill purpose
---

# Skill Name

## Overview
What this skill provides.

## Key Concepts
Main topics covered.

## Patterns
Reusable patterns and templates.

## Reference
Quick reference information.

## Examples
Usage examples.
```

---

## Loading Skills

Skills are loaded automatically by agents when needed:

1. Agent encounters relevant task
2. Agent reads skill file from `skills/skill-name/SKILL.md`
3. Agent applies skill knowledge
4. References loaded on demand from `references/`

### Manual Loading

Agents can explicitly reference skills:
```
"Let me load the code-review skill for this PR review..."
[reads skills/code-review/SKILL.md]
```

---

## Creating Project Skills

Project-specific skills live in `.claude/project/skills/`.

### Structure

```
.claude/project/skills/
└── my-skill/
    ├── SKILL.md
    └── references/
```

### When to Create

Create a project skill when:
- Knowledge is project-specific but reusable
- Multiple agents need the same patterns
- Information doesn't fit in agent sidecars

### Skill Template

```markdown
---
name: my-project-skill
description: Project-specific skill for [purpose]
---

# [Skill Name]

## Overview
[What this skill provides for this project]

## Key Patterns
[Project-specific patterns]

## Reference
[Quick reference information]

## Examples
[Project-specific examples]
```

---

## Skill vs Sidecar

| Use Case | Location |
|----------|----------|
| Agent-specific project knowledge | Agent sidecar (`.claude/project/agents/{agent}-sidecar/`) |
| Cross-agent project knowledge | Project skill (`.claude/project/skills/`) |
| Framework-level knowledge | Core skill (`pennyfarthing/skills/`) |

**Examples:**
- "How Dev handles errors in this project" -> Dev sidecar
- "Project-wide API patterns" -> Project skill
- "General TDD patterns" -> Core testing skill

---

## Skill Best Practices

1. **Keep skills focused** - One domain per skill
2. **Include examples** - Show, don't just tell
3. **Update when learning** - Add new patterns as discovered
4. **Reference, don't duplicate** - Point to authoritative sources
5. **Use checklists** - Easy to follow and verify
6. **Keep it scannable** - Tables, bullet points, clear headers
