# Workflows Guide

Comprehensive guide to BikeLane workflows in Pennyfarthing.

## Table of Contents

- [BikeLane Overview](#bikelane-overview)
- [Workflow Types](#workflow-types)
  - [Phased Workflows](#phased-workflows)
  - [Stepped Workflows](#stepped-workflows)
  - [Procedural Workflows](#procedural-workflows)
- [Workflow Commands](#workflow-commands)
- [Common Workflows](#common-workflows)
  - [TDD Workflow](#tdd-workflow)
  - [Sprint Planning](#sprint-planning)
  - [Starting New Work](#starting-new-work)
  - [Finishing Work](#finishing-work)
  - [Code Review](#code-review)
- [Advanced Topics](#advanced-topics)
  - [Parallel Work with Worktrees](#parallel-work-with-worktrees)
  - [Jira Integration](#jira-integration)
- [Best Practices](#best-practices)

---

## BikeLane Overview

BikeLane is Pennyfarthing's unified workflow orchestration system. All workflows in Pennyfarthing are BikeLane workflows, providing consistent execution patterns across different development activities.

### What BikeLane Provides

1. **Workflow Discovery** - List and explore available workflows
2. **State Management** - Track progress through workflow phases
3. **Agent Coordination** - Automatic handoffs between agents
4. **Progressive Disclosure** - Reveal information as needed (stepped workflows)
5. **Resumability** - Continue interrupted workflows

### Core Concepts

**Workflow** - A structured process for accomplishing a task (e.g., TDD, sprint planning, research)

**Phase** - A discrete step in a workflow with specific entry/exit criteria

**Agent** - An AI agent specialized for a particular role (SM, TEA, Dev, Reviewer, etc.)

**Handoff** - Transition between agents or phases, managed by the workflow system

---

## Workflow Types

BikeLane supports three types of workflows, each optimized for different use cases.

### Phased Workflows

Agent-driven workflows with automatic handoffs between agents. These workflows progress automatically based on agent completion signals.

**Available Phased Workflows:**

| Workflow | Description | Agent Flow |
|----------|-------------|------------|
| `tdd` | Test-Driven Development | SM → TEA → Dev → Reviewer → SM |
| `bdd` | Behavior-Driven Development | SM → TEA → Dev → Reviewer → SM |
| `trivial` | Quick changes without full TDD ceremony | SM → Dev → Reviewer → SM |
| `agent-docs` | Documentation-focused workflow | SM → Tech Writer → Reviewer → SM |

**Characteristics:**
- Automatic agent handoffs
- Session file coordination
- Progress tracked in `.session/{story-id}-session.md`
- Agents detect state and continue work

### Stepped Workflows

Progressive disclosure workflows with user gates between steps. These workflows reveal information incrementally and wait for user approval before proceeding.

**Available Stepped Workflows:**

| Workflow | Description | Use Case |
|----------|-------------|----------|
| `prd` | Product Requirements Document | Define product features and requirements |
| `architecture` | System architecture planning | Design system architecture |
| `research` | Multi-modal research | Market/domain/technical research |
| `sprint-planning` | Sprint planning sessions | Plan sprint work and goals |
| `epics-and-stories` | Epic and story creation | Create and structure epics/stories |
| `product-brief` | Product brief creation | Define product vision and goals |
| `project-context` | Generate project context for AI | Create AI-readable project documentation |
| `implementation-readiness` | Verify implementation readiness | Check if work is ready to begin |
| `ux-design` | UX design workflow | Design user experiences |
| `quick-dev` | Quick development workflow | Fast implementation path |
| `quick-spec` | Quick specification workflow | Rapid spec creation |

**Characteristics:**
- User gates between steps
- Progressive information disclosure
- BMAD 6.0 compatible format
- Ideal for planning and design activities
- Can be paused and resumed

**BMAD 6.0 Compatibility:**
Stepped workflows are fully compatible with BMAD 6.0 format. See `docs/bmad-compatibility-matrix.md` for detailed compatibility information.

### Procedural Workflows

Flexible agent-guided processes that adapt to user input and context. These workflows provide structure but allow for dynamic paths.

**Available Procedural Workflows:**

| Workflow | Description | Primary Agent |
|----------|-------------|---------------|
| `brainstorming` | Structured brainstorming sessions | PM + Team |
| `code-review` | Code review process | Reviewer |
| `dev-story` | Development story workflow | SM + Dev |
| `retrospective` | Sprint retrospective | SM |

**Characteristics:**
- Flexible execution path
- Agent-guided with user collaboration
- Adapts to context and feedback
- Less rigid structure than phased workflows

---

## Workflow Commands

Manage workflows using the `/workflow` skill:

```bash
# List all available workflows
/workflow list

# Start a specific workflow
/workflow start tdd
/workflow start sprint-planning
/workflow start research

# Check current workflow status
/workflow status

# Resume an interrupted workflow
/workflow resume

# Switch to a different workflow
/workflow start <new-workflow>
```

**Note:** Starting work with `/new-work` automatically selects the appropriate workflow based on story type and context.

---

## Common Workflows

### TDD Workflow

Test-Driven Development is one of several phased workflows available in BikeLane.

**When to use:**
- Building new features
- Fixing bugs with test coverage
- Working on testable components
- Following strict TDD discipline

**Agent flow:**
```
/new-work → SM → TEA → Dev → Reviewer → SM (finish)
             |     |      |        |
          setup  tests  impl    review
```

#### Phase 1: Story Setup (SM)

**Trigger:** `/new-work` with TDD workflow

1. SM activates and checks for existing work
2. If no work in progress:
   - Reviews sprint backlog
   - Helps select or create a story
   - Writes story context to `.session/{story-id}-session.md`
   - Creates feature branches in repos
3. Hands off to TEA

**Session file created:**
```markdown
# Current Work Session

## Story
- **ID:** PROJ-123
- **Title:** User authentication API
- **Repos:** API

## Acceptance Criteria
1. Users can log in with email/password
2. JWT token returned on success
3. Invalid credentials return 401

## Progress
- [x] SM: Story setup complete
- [ ] TEA: Tests written
- [ ] Dev: Implementation complete
- [ ] Reviewer: Code reviewed
```

#### Phase 2: Write Tests (TEA)

**Trigger:** Automatic handoff from SM

1. TEA reads story context from session file
2. Designs test strategy
3. Writes failing tests (RED phase)
4. Runs tests to confirm they fail appropriately
5. Updates session file
6. Hands off to Dev

**Test principles:**
- Write tests for each acceptance criterion
- Include edge cases and error conditions
- Tests should fail for the right reasons
- Document test strategy in session notes

#### Phase 3: Implementation (Dev)

**Trigger:** Automatic handoff from TEA

1. Dev reads session file and tests
2. Implements code to pass tests (GREEN phase)
3. Runs tests to confirm they pass
4. May refactor (REFACTOR phase)
5. Creates pull request
6. Updates session file
7. Hands off to Reviewer

**Implementation principles:**
- Write minimal code to pass tests
- Follow project patterns
- Keep changes focused on story scope
- Create clean, reviewable PR

#### Phase 4: Code Review (Reviewer)

**Trigger:** Automatic handoff from Dev

1. Reviewer reads session file and PR
2. Runs preflight checks (tests, lint)
3. Reviews code quality, security, patterns
4. Either approves or rejects

**If approved:**
- Updates session status to `approved`
- Hands off to SM for finish

**If rejected:**
- Documents issues in session file
- Hands off back to Dev for fixes

#### Phase 5: Finish (SM)

**Trigger:** Status = `approved`

1. SM detects approved status
2. Archives session file to `sprint/archive/`
3. Updates sprint tracking YAML
4. Syncs to Jira (if configured)
5. Confirms story complete

---

### Sprint Planning

Plan upcoming sprint work using the `sprint-planning` stepped workflow.

**Workflow type:** Stepped (progressive disclosure with user gates)

#### Starting Sprint Planning

```bash
/workflow start sprint-planning
```

Or use the shortcut:
```bash
/sprint-planning
```

#### Workflow Steps

1. **Review current state:**
   - Completed work from previous sprint
   - Carryover items
   - Velocity metrics

2. **Analyze backlog:**
   - Review prioritized epics/stories
   - Check dependencies
   - Consider team capacity

3. **Select sprint work:**
   - Choose stories for sprint
   - Verify story readiness
   - Set sprint goal

4. **Update tracking:**
   - Update `sprint/current-sprint.yaml`
   - Move selected stories to sprint
   - Set story priorities

#### Sprint YAML Structure

```yaml
sprint:
  name: Sprint 24
  start: 2025-01-06
  end: 2025-01-20
  goal: Complete authentication epic

backlog:
  - id: AUTH-1
    title: User login API
    status: ready
    points: 3
    repos: [API]

  - id: AUTH-2
    title: Login UI
    status: ready
    points: 5
    repos: [UI]

in_progress: []

completed: []
```

---

### Starting New Work

Begin working on a story using the `/new-work` command.

#### Simple Start

```bash
/new-work
```

The SM agent will:
1. Check for existing work in progress
2. Show the sprint backlog
3. Help you select a story
4. Determine appropriate workflow (TDD, trivial, etc.)
5. Set up the work session

#### Resuming Work

If work is already in progress, `/new-work` will:
1. Detect the existing session
2. Show current status
3. Route to appropriate agent (TEA, Dev, or Reviewer)
4. Continue with the active workflow

#### Creating a New Story

If no suitable story exists:
1. SM can create a new story
2. Define acceptance criteria
3. Estimate points
4. Add to sprint
5. Choose workflow type

---

### Finishing Work

Complete a story after code review approval.

#### Automatic Finish

When the Reviewer approves:
1. Session status set to `approved`
2. SM automatically detects this
3. Runs finish workflow

#### Manual Finish

If needed manually:
```bash
/sm
```

SM will detect `approved` status and run finish.

#### Finish Workflow

1. **Archive session:**
   ```
   .session/{story-id}-session.md → sprint/archive/PROJ-123.md
   ```

2. **Update sprint tracking:**
   - Move story to `completed`
   - Update timestamps
   - Calculate velocity

3. **Sync external tools:**
   - Update Jira status (if configured)
   - Post PR merge notification

4. **Cleanup:**
   - Remove session file
   - Confirm completion

---

### Code Review

Detailed code review process using the `code-review` procedural workflow.

#### Review Initiation

Reviewer activates after Dev creates PR:
```bash
/reviewer
```

Or start the code-review workflow explicitly:
```bash
/workflow start code-review
```

#### Preflight Checks

Before reviewing, Reviewer runs:
1. All tests pass
2. Lint checks pass
3. Build succeeds
4. No merge conflicts

#### Review Focus

1. **Correctness:**
   - Does the code do what it claims?
   - Does it match acceptance criteria?
   - Are edge cases handled?

2. **Security:**
   - Any vulnerabilities?
   - Input validation?
   - Authentication/authorization?

3. **Patterns:**
   - Following project conventions?
   - Consistent with existing code?
   - Appropriate abstractions?

4. **Performance:**
   - Any obvious issues?
   - N+1 queries?
   - Memory concerns?

5. **Tests:**
   - Adequate coverage?
   - Testing right things?
   - Maintainable tests?

#### Review Outcomes

**Approved:**
```
Story PROJ-123 approved. Run finish-story.
```

**Rejected:**
```
2 issues found:
1. Missing input validation in /api/auth/login
2. Test coverage insufficient for error paths

Routing back to Dev.
```

---

## Advanced Topics

### Parallel Work with Worktrees

Work on multiple stories simultaneously using git worktrees.

#### Setup

1. **Create worktree:**
   ```bash
   /setup-worktree feature/auth-ui
   ```

2. **This creates:**
   - New git worktree at `../project-feature-auth-ui/`
   - Separate working directory
   - Independent session file

3. **Work independently:**
   - Main worktree: one story
   - New worktree: different story
   - No conflict between sessions

#### Managing Worktrees

**List worktrees:**
```bash
git worktree list
```

**Remove worktree (after finishing):**
```bash
git worktree remove ../project-feature-auth-ui
```

#### Session Isolation

Each worktree has its own:
- `.session/{story-id}-session.md`
- Branch context
- Active agent state

---

### Jira Integration

Sync work with Jira for external tracking.

#### Sync Epic to Jira

Push local epic definition to Jira:
```bash
/sync-epic-to-jira AUTH-EPIC
```

**What happens:**
1. Reads local epic definition
2. Creates/updates Jira epic
3. Creates/updates child stories
4. Syncs status

#### Story Status Sync

When SM finishes a story:
1. Jira ticket transitioned to Done
2. Resolution set
3. Comments added if configured

#### Configuration

Set up in `.env`:
```bash
JIRA_PROJECT=PROJ
JIRA_USER=your-email@example.com
JIRA_API_TOKEN=your-token
```

---

## Best Practices

### Workflow Selection

**Choose TDD workflow when:**
- Building testable features
- Bug fixes requiring test coverage
- Following strict TDD discipline
- Team values test-first approach

**Choose trivial workflow when:**
- Quick fixes
- Documentation updates
- Configuration changes
- Changes too simple for full TDD

**Choose stepped workflow when:**
- Planning activities
- Research phases
- Design work
- Need progressive disclosure

**Choose procedural workflow when:**
- Collaborative activities
- Flexible processes
- Context-dependent paths

### General Guidelines

1. **Use `/workflow list`** to discover available workflows
2. **Trust the handoffs** - Subagents update session correctly
3. **Keep session file accurate** - Notes help future work
4. **Complete one story** before starting another (unless using worktrees)
5. **Use appropriate workflow** - Not everything needs TDD
6. **Check workflow status** - Use `/workflow status` to see progress

### Troubleshooting

**"No work in progress" but I was working:**
- Check `.session/{story-id}-session.md` exists
- May have been archived accidentally
- Check `sprint/archive/` for recent files
- Use `/workflow status` to check current state

**Stuck in wrong agent:**
- Use direct command (e.g., `/dev`)
- Or restart with `/new-work`
- Check workflow status with `/workflow status`

**PR not created:**
- Verify tests pass
- Check for uncommitted changes
- Ensure feature branch pushed

**Review rejected repeatedly:**
- Review all issues carefully
- Ask Reviewer for clarification
- Consider Architect input for design issues

**Workflow won't resume:**
- Check session file is properly formatted
- Verify workflow type matches current task
- Use `/workflow start <name>` to restart

---

## See Also

- [BMAD Compatibility Matrix](bmad-compatibility-matrix.md) - Stepped workflow compatibility details
- [AGENTS.md](AGENTS.md) - Agent roles and responsibilities
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture overview
- [ADR 0006](adr/0006-state-detection-pattern.md) - State detection pattern documentation
