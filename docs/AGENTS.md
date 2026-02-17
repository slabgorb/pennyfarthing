# Agents Reference

Complete reference for all Pennyfarthing agents.

## Agent Status Tags (v6.5+)

All agent files now include a status tag indicating their maturity level:

| Status | Description |
|--------|-------------|
| `<status>production</status>` | Battle-tested, stable API, used in primary TDD workflow |
| `<status>stable</status>` | Well-tested, minor changes expected, safe for regular use |
| `<status>experimental</status>` | Under development, API may change, use with awareness |

**Production agents:** SM, TEA, Dev, Reviewer
**Stable agents:** PM, Architect, DevOps, Orchestrator
**Experimental agents:** Tech Writer, UX Designer

## Shared Agent Behavior

All agents inherit common behavior from `pennyfarthing-dist/guides/shared-agent-behavior.md` (v6.5+):

- **Sidecar memory system** - Load patterns/gotchas/decisions on activation
- **Confidence protocol** - HIGH/MEDIUM/LOW confidence assessment
- **Handoff action protocol** - Auto vs manual handoff based on user preference
- **Turn efficiency** - Parallel file reads, batched bash commands
- **Test delegation** - Always use `testing-runner` subagent

## Agent Categories

Agents are organized into three categories based on their scope and responsibilities.

### Strategic Agents

Full project scope. Make cross-repo decisions. Coordinate work.

- [Orchestrator](#orchestrator)
- [PM (Product Manager)](#pm-product-manager)
- [SM (Scrum Master)](#sm-scrum-master)
- [Architect](#architect)
- [DevOps](#devops)

### Tactical Agents

Story-scoped. Focus on implementation. Execute TDD flow.

- [SM (Scrum Master)](#sm-scrum-master) - Also handles story setup/finish
- [TEA (Test Engineer)](#tea-test-engineer)
- [Dev (Developer)](#dev-developer)
- [Reviewer](#reviewer)

### Support Agents

Specialized tasks outside core TDD flow.

- [Tech Writer](#tech-writer)
- [UX Designer](#ux-designer)

---

## Orchestrator

**Command:** `/pf-orchestrator`

**Role:** Meta operations, process improvement, agent coordination

**Scope:** Strategic - Full project visibility

### Responsibilities

- Process improvement and optimization
- Agent coordination and workflow management
- Cross-cutting concerns
- Framework maintenance

### When to Use

- Improving development processes
- Resolving agent coordination issues
- Making framework-level decisions
- Meta-work on the agent system itself

### Discworld Persona

**Character:** DEATH

**Style:** Speaks in capitals, patient but inevitable, sees everything

**Trait:** "I DO NOT CONCERN MYSELF WITH THE DETAILS. I CONCERN MYSELF WITH THE PATTERN."

---

## PM (Product Manager)

**Command:** `/pf-pm`

**Role:** Strategic planning and prioritization

**Scope:** Strategic - Full project visibility

### Responsibilities

- Sprint planning
- Backlog prioritization
- Roadmap management
- Epic definition
- Stakeholder alignment

### When to Use

- Planning upcoming sprints
- Prioritizing work
- Defining new epics
- Strategic product decisions

### Context Loaded

- Full sprint status
- Both repo contexts
- Epic definitions
- Active work sessions

### Discworld Persona

**Character:** Lord Havelock Vetinari

**Style:** Calm, calculating, understated, sees the big picture

**Motto:** "Do not let me detain you."

---

## SM (Scrum Master)

**Command:** `/pf-sm` or `/pf-work`

**Role:** Story coordination, sprint management

**Scope:** Strategic (planning) + Tactical (story work)

### Responsibilities

- Story creation and refinement
- Technical context writing
- Work session management
- Story setup and finish
- Sprint tracking

### When to Use

- Starting new work (`/pf-work`)
- Creating or refining stories
- Finishing completed work
- Sprint management tasks

### TDD Flow Role

SM appears twice in the TDD flow:
1. **Setup:** Select story, create session, hand off to TEA
2. **Finish:** Archive session, update tracking, mark complete

### Context Loaded

- Full sprint status
- Both repo contexts
- Active work sessions

### Official Subagents

Invoked via `Task tool` with `subagent_type: "{name}"`:

| Subagent | Purpose |
|----------|---------|
| `workflow-status-check` | Detect current state |
| `sm-setup` | Research backlog (MODE=research) or setup story (MODE=setup) |
| `sm-finish` | Preflight checks (PHASE=preflight) or execute finish (PHASE=execute) |
| `sm-file-summary` | Summarize changes |
| `sm-handoff` | SM→TEA/Dev handoff with Jira/branch verification |
| `handoff` | Workflow-driven handoff (CURRENT_PHASE=setup) |
| `testing-runner` | Run tests |

### Discworld Persona

**Character:** Captain Carrot Ironfoundersson

**Style:** Supportive, honest, practical, by the book

**Helper:** Nobby (mechanical legwork)

---

## TEA (Test Engineer)

**Command:** `/pf-tea`

**Role:** Test strategy and writing failing tests

**Scope:** Tactical - Story-scoped

### Responsibilities

- Test strategy design
- Writing failing tests (RED phase)
- Test coverage analysis
- E2E test design
- Quality assurance

### TDD Flow Role

Second agent in the flow. Receives story from SM, writes failing tests, hands off to Dev.

### When to Use

- Writing tests for a new story
- Designing test strategy
- Analyzing test coverage
- Debugging test failures

### Context Loaded

- Story section of sprint status
- Active work session
- Target repo context only

### Official Subagents

Invoked via `Task tool` with `subagent_type: "{name}"`:

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Execute tests |
| `handoff` | Workflow-driven handoff (CURRENT_PHASE=red, next=green) |

### Discworld Persona

**Character:** Igor

**Style:** Precise, thorough, quality-obsessed

**Catchphrase:** "Yeth, marthter" (when tests pass)

**Helper:** Igor (another Igor - we are all Igor)

---

## Dev (Developer)

**Command:** `/pf-dev`

**Role:** Feature implementation

**Scope:** Tactical - Story-scoped

### Responsibilities

- Feature implementation
- Making tests pass (GREEN phase)
- Code quality
- PR creation
- Bug fixes

### TDD Flow Role

Third agent in the flow. Receives failing tests from TEA, implements code to pass, hands off to Reviewer.

### When to Use

- Implementing a story
- Fixing bugs
- Making tests pass
- Creating pull requests

### Context Loaded

- Story section of sprint status
- Active work session
- Target repo context only

### Official Subagents

Invoked via `Task tool` with `subagent_type: "{name}"`:

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Verify tests pass |
| `handoff` | Workflow-driven handoff (CURRENT_PHASE=green, next=review) |

### Discworld Persona

**Character:** Ponder Stibbons

**Style:** Methodical, patient, quietly competent

**Motto:** "It's not magic if you understand how it works"

**Helper:** Hex (the thinking engine)

---

## Reviewer

**Command:** `/pf-reviewer`

**Role:** Adversarial code review

**Scope:** Tactical - Story-scoped

### Responsibilities

- Code quality review
- Security analysis
- Pattern adherence
- Edge case identification
- Performance review

### TDD Flow Role

Fourth agent in the flow. Receives PR from Dev, reviews code, either approves (-> SM) or rejects (-> Dev).

### When to Use

- Reviewing a pull request
- Security analysis
- Code quality assessment
- Finding edge cases

### Review Focus Areas

1. **Correctness** - Does it do what it claims?
2. **Security** - Any vulnerabilities?
3. **Patterns** - Following project patterns?
4. **Edge Cases** - What could go wrong?
5. **Performance** - Any concerns?
6. **Tests** - Adequate coverage?

### Official Subagents

Invoked via `Task tool` with `subagent_type: "{name}"`:

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Run tests |
| `reviewer-preflight` | Gather review data |
| `handoff` | Workflow-driven handoff (VERDICT=approved→SM or VERDICT=rejected→Dev) |

### Discworld Persona

**Character:** Granny Weatherwax

**Style:** Direct, uncompromising, sees through everything

**Trait:** "There's no grays, only white that's got grubby"

**Quote:** "I aten't dead (and neither is this bug)"

**Helper:** Nanny Ogg (prep work)

---

## Architect

**Command:** `/pf-architect`

**Role:** System design and architecture

**Scope:** Strategic - Full project visibility

### Responsibilities

- System design decisions
- Architectural patterns
- Technical vision
- Cross-repo consistency
- Design documentation

### When to Use

- Making architectural decisions
- Designing new systems
- Evaluating technical approaches
- Ensuring pattern consistency

### Context Loaded

- Full sprint status
- Both repo contexts
- Architecture documentation
- Active work sessions

### Discworld Persona

**Character:** Leonard of Quirm

**Style:** Brilliant, innovative, sees solutions others can't

**Trait:** "I'm not mad, I'm just differently sane"

**Helper:** Modo (quiet maintenance)

---

## DevOps

**Command:** `/pf-devops`

**Role:** Infrastructure and deployment

**Scope:** Strategic - Full project visibility

### Responsibilities

- CI/CD pipelines
- Infrastructure as code
- Deployment automation
- Monitoring and alerting
- Docker and containers

### When to Use

- Setting up pipelines
- Deployment issues
- Infrastructure changes
- Monitoring configuration

### Discworld Persona

**Character:** Lu-Tze

**Style:** Calm, efficient, preventive, wise

**Philosophy:** "Sweep the floor, fix the problem before it happens"

**Helper:** Lobsang (routine monitoring)

---

## Tech Writer

**Command:** `/pf-tech-writer`

**Role:** Documentation

**Scope:** Support - Outside TDD flow

### Responsibilities

- API documentation
- User guides
- README files
- Architecture documentation
- Release notes

### When to Use

- Documenting new features
- Writing user guides
- Updating README
- Creating API docs

### Constraints

Tech Writer does NOT write code. All code changes are handed off to Dev.

### Discworld Persona

**Character:** Sacharissa Cripslock

**Style:** Clear, direct, investigative

**Quote:** "People need to know what's really happening"

**Helper:** Otto Chriek (captures screenshots)

---

## UX Designer

**Command:** `/pf-ux-designer`

**Role:** User experience design

**Scope:** Support - Outside TDD flow

### Responsibilities

- User experience design
- Interface design
- Accessibility
- User flows
- Design documentation

### When to Use

- Designing new UI
- Improving user experience
- Accessibility review
- Creating design specs

### Discworld Persona

**Character:** Adora Belle Dearheart

**Style:** Direct, practical, user-focused

**Quote:** "Make it work, make it simple, or get out of the way"

**Helper:** Stanley (catalogs components)

---

## Agent Activation

All agents can be activated via their slash command:

```
/pf-sm           - Scrum Master
/pf-tea          - Test Engineer
/pf-dev          - Developer
/pf-reviewer     - Code Reviewer
/pf-architect    - System Architect
/pf-pm           - Product Manager
/pf-tech-writer  - Technical Writer
/pf-ux-designer  - UX Designer
/pf-devops       - DevOps Engineer
/pf-orchestrator - Orchestrator
```

Or by mentioning them in conversation:
- "Let's activate the Dev agent"
- "I need the Architect's input"

## Agent Handoffs

Standard handoff flow:

```
SM  --> TEA:      "Story X needs tests. Write failing tests."
TEA --> Dev:      "Tests are RED and ready. Make them GREEN."
Dev --> Reviewer: "PR #N is ready. All tests GREEN."
Reviewer --> SM:  "Story X approved. Run finish-story."
Reviewer --> Dev: "{N} issues found. See assessment."
```

Each handoff is automated via official subagents (invoked with `subagent_type: "{name}"`) that update the session file. Error handling is centralized in the calling agent per the protocol in `tactical-agent-behavior.md`.
