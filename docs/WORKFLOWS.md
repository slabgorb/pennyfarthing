# Workflows Guide

Step-by-step guides for common Pennyfarthing workflows.

## Table of Contents

- [The TDD Workflow](#the-tdd-workflow)
- [Sprint Planning](#sprint-planning)
- [Starting New Work](#starting-new-work)
- [Finishing Work](#finishing-work)
- [Code Review](#code-review)
- [Parallel Work with Worktrees](#parallel-work-with-worktrees)
- [Jira Integration](#jira-integration)

---

## The TDD Workflow

The core development workflow follows Test-Driven Development principles.

### Overview

```
/new-work --> SM --> TEA --> Dev --> Reviewer --> SM (finish)
              |       |       |         |
           setup   tests    impl     review
```

### Phase 1: Story Setup (SM)

**Trigger:** `/new-work`

1. SM activates and checks for existing work
2. If no work in progress:
   - Reviews sprint backlog
   - Helps select or create a story
   - Writes story context to `.session/current_work.md`
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

### Phase 2: Write Tests (TEA)

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

### Phase 3: Implementation (Dev)

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

### Phase 4: Code Review (Reviewer)

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

### Phase 5: Finish (SM)

**Trigger:** Status = `approved`

1. SM detects approved status
2. Archives session file to `sprint/archive/`
3. Updates sprint tracking YAML
4. Syncs to Jira (if configured)
5. Confirms story complete

---

## Sprint Planning

Plan upcoming sprint work with the PM agent.

### Workflow

1. **Invoke:** `/sprint-planning`

2. **Review current state:**
   - Completed work from previous sprint
   - Carryover items
   - Velocity metrics

3. **Analyze backlog:**
   - Review prioritized epics/stories
   - Check dependencies
   - Consider team capacity

4. **Select sprint work:**
   - Choose stories for sprint
   - Verify story readiness
   - Set sprint goal

5. **Update tracking:**
   - Update `sprint/current-sprint.yaml`
   - Move selected stories to sprint
   - Set story priorities

### Sprint YAML Structure

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

## Starting New Work

Begin working on a story.

### Simple Start

```
/new-work
```

The SM agent will:
1. Check for existing work in progress
2. Show the sprint backlog
3. Help you select a story
4. Set up the work session

### Resuming Work

If work is already in progress, `/new-work` will:
1. Detect the existing session
2. Show current status
3. Route to appropriate agent (TEA, Dev, or Reviewer)

### Creating a New Story

If no suitable story exists:
1. SM can create a new story
2. Define acceptance criteria
3. Estimate points
4. Add to sprint

---

## Finishing Work

Complete a story after code review approval.

### Automatic Finish

When the Reviewer approves:
1. Session status set to `approved`
2. SM automatically detects this
3. Runs finish workflow

### Manual Finish

If needed manually:
```
/sm
```

SM will detect `approved` status and run finish.

### Finish Workflow

1. **Archive session:**
   ```
   .session/current_work.md --> sprint/archive/PROJ-123.md
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

## Code Review

Detailed code review process.

### Review Initiation

Reviewer activates after Dev creates PR:
```
/reviewer
```

### Preflight Checks

Before reviewing, Reviewer runs:
1. All tests pass
2. Lint checks pass
3. Build succeeds
4. No merge conflicts

### Review Focus

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

### Review Outcomes

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

## Parallel Work with Worktrees

Work on multiple stories simultaneously.

### Setup

1. **Create worktree:**
   ```
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

### Managing Worktrees

**List worktrees:**
```bash
git worktree list
```

**Remove worktree (after finishing):**
```bash
git worktree remove ../project-feature-auth-ui
```

### Session Isolation

Each worktree has its own:
- `.session/current_work.md`
- Branch context
- Active agent state

---

## Jira Integration

Sync work with Jira.

### Sync Epic to Jira

Push local epic definition to Jira:
```
/sync-epic-to-jira AUTH-EPIC
```

**What happens:**
1. Reads local epic definition
2. Creates/updates Jira epic
3. Creates/updates child stories
4. Syncs status

### Story Status Sync

When SM finishes a story:
1. Jira ticket transitioned to Done
2. Resolution set
3. Comments added if configured

### Configuration

Set up in `.env`:
```bash
JIRA_PROJECT=PROJ
JIRA_USER=your-email@example.com
JIRA_API_TOKEN=your-token
```

---

## Workflow Tips

### Best Practices

1. **Always use `/new-work`** - Let the system detect state
2. **Trust the handoffs** - Subagents update session correctly
3. **Keep session file accurate** - Notes help future work
4. **Complete one story** before starting another (unless using worktrees)

### Troubleshooting

**"No work in progress" but I was working:**
- Check `.session/current_work.md` exists
- May have been archived accidentally
- Check `sprint/archive/` for recent files

**Stuck in wrong agent:**
- Use direct command (e.g., `/dev`)
- Or restart with `/new-work`

**PR not created:**
- Verify tests pass
- Check for uncommitted changes
- Ensure feature branch pushed

**Review rejected repeatedly:**
- Review all issues carefully
- Ask Reviewer for clarification
- Consider Architect input for design issues
