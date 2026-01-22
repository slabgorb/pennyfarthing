---
description: Sync Pennyfarthing work session with unified sprint status
---

# Sync Work Session with Sprint Status

This workflow helps you coordinate your Pennyfarthing work session with the unified sprint status tracking.

## Prerequisites

- [ ] Active work session exists (`.session/{STORY_ID}-session.md`)
- [ ] You know which story/epic you're working on

## Unified Sprint Status

**Location:** `sprint/sprint-status.yaml`

This single file tracks work across both API and UI repos, making coordination simple.

## Steps

### 1. View Current Sprint Status

Check the unified sprint status:

```bash
cat sprint/sprint-status.yaml
```

**Current Sprint 1 - Coordinated Development Setup:**
- Epic 1: Coordinated Development Setup - IN PROGRESS (2/5 done)
  - 1-1: Pennyfarthing Solo Dev Setup - done
  - 1-2: Cross-Repo Workflows - done
  - 1-3: Environment Configuration - backlog
  - 1-4: API Connection Verification - backlog
  - 1-5: Development Documentation - backlog

- Epic 2: Critical Bug Fixes - BACKLOG (plan as needed)
- Epic 3: Core Feature Development - BACKLOG (plan as needed)

### 2. Update Pennyfarthing Session with Story Info

Edit `.session/{STORY_ID}-session.md` to include story details:

```markdown
# Feature: [Story Title]

**Story ID:** [Epic-Story] (e.g., 1-3, 1-4)
**Repos:** [X] API  [X] UI  [X] Both
**Date:** [YYYY-MM-DD]
**Epic:** [Epic Number and Name]
**Priority:** [P0/P1/P2]
**Points:** [Story Points]

## Goal
[Copy from sprint status story description]

## Story Context
**Sprint Status:** sprint/sprint-status.yaml
**Story Line:** [Line number in sprint status]

## Scope
- [ ] [Task from story]
- [ ] [Task from story]
- [ ] [Task from story]

## API Changes
- Files: [from story prerequisites]
- Endpoints: [from story description]

## UI Changes
- Files: [from story prerequisites]
- Components: [from story description]

## Prerequisites
[Copy from sprint status]

## Acceptance Criteria
[Copy from story file if exists]

## Quick Notes
[Your implementation notes]

## Done
- [ ] Tests pass
- [ ] Works as expected
- [ ] Committed
- [ ] Sprint status updated

## Next
[Next story in epic or next epic]
```

### 3. Update Sprint Status to "in-progress"

When you start work, update the sprint status file:

**For API work:**
```bash
cd $CLAUDE_PROJECT_DIR/API

# Edit sprint status
# Change story status from 'backlog' to 'in-progress'
# Example: 2-2-okta-sso-integration: in-progress
```

**For UI work:**
```bash
cd $CLAUDE_PROJECT_DIR/UI

# Edit sprint status
# Change story status from 'backlog' to 'in-progress'
# Example: 5-2-environment-configuration-validation: in-progress
```

### 4. Work on the Story

Follow your Pennyfarthing session and check off tasks as you complete them.

### 5. Update Sprint Status to "done"

When work is complete:

**For API work:**
```bash
cd $CLAUDE_PROJECT_DIR/API

# Edit sprint status
# Change: 2-2-okta-sso-integration: done
# Add completion date if tracking
```

**For UI work:**
```bash
cd $CLAUDE_PROJECT_DIR/UI

# Edit sprint status
# Change: 5-2-environment-configuration-validation: done
# Add completion date and commit SHA if tracking
```

### 6. Commit Sprint Status Updates

```bash
# API
cd $CLAUDE_PROJECT_DIR/API
git add docs/sprint-artifacts/sprint-status.yaml
git commit -m "chore: update sprint status for story [ID]"

# UI
cd $CLAUDE_PROJECT_DIR/UI
git add docs/sprint-artifacts/sprint-status.yaml
git commit -m "chore: update sprint status for story [ID]"
```

### 7. Archive Pennyfarthing Session

```bash
cd $CLAUDE_PROJECT_DIR
# Invoke /sm and run finish-story task
# Archive with story ID: story-5-2-env-config-20241202.md
```

## Current Sprint Focus

### API - Next Stories to Work On

**Epic 2: Authentication (In Progress)**
- 2-2-okta-sso-integration: backlog → Ready to start
- 2-5-mfa-multi-factor-authentication: backlog → After 2-2

### UI - Next Stories to Work On

**Epic 1: Dev Tooling (In Progress - 1/8 done)**
- 1-3-environment-configuration-files: backlog → Priority P0
- 1-4-root-level-development-orchestration: backlog → Priority P1
- 1-5-cross-repo-scripts: backlog → Priority P1
- 1-6-api-contract-synchronization: backlog → Priority P1

**Epic 5: Bug Fixes (In Progress - 1/10 done)**
- 5-2-environment-configuration-validation: backlog → Priority P0
- 5-3-route-validation-and-navigation-testing: backlog → Priority P1
- 5-4-api-integration-testing: backlog → Priority P0

## Story Status Workflow

```
backlog → in-progress → review → done
```

**Status Definitions:**
- `backlog`: Story exists but not started
- `drafted`: Story file created (if applicable)
- `ready-for-dev`: Story approved and contexted
- `in-progress`: Actively working (update when you start)
- `review`: Under review (code review)
- `done`: Completed (update when finished)

## Example: Complete Story Workflow

### Story: UI 5-2 Environment Configuration Validation

```bash
# 1. Create session with story details
cd $CLAUDE_PROJECT_DIR
cat > .session/{STORY_ID}-session.md << 'EOF'
# Feature: Environment Configuration Validation

**Story ID:** 5-2
**Repos:** [ ] API  [X] UI  [ ] Both
**Date:** 2024-12-02
**Epic:** Epic 5 - Bug Fixes & Split Issues Resolution
**Priority:** P0
**Points:** 3

## Goal
Validate environment configuration files and ensure proper loading

## Story Context
**UI Story:** UI/docs/sprint-artifacts/sprint-status.yaml#L229
**Prerequisites:** Epic 1 (Dev Tooling)

## Scope
- [ ] Validate .env files exist
- [ ] Check required environment variables
- [ ] Add runtime validation
- [ ] Update documentation

## UI Changes
- Files: src/config/env.ts, src/utils/validation.ts
- Components: ErrorBoundary updates

## Quick Notes
- Check for missing API_BASE_URL
- Validate WebSocket URL format
- Add helpful error messages

## Done
- [ ] Tests pass
- [ ] Works as expected
- [ ] Committed
- [ ] Sprint status updated

## Next
Story 5-3: Route validation
EOF

# 3. Update sprint status to in-progress
cd UI
# Edit: 5-2-environment-configuration-validation: in-progress

# 4. Do the work
# ... implement validation ...

# 5. Commit work
git add .
git commit -m "feat: add environment configuration validation (story 5-2)"

# 6. Update sprint status to done
# Edit: 5-2-environment-configuration-validation: done

# 7. Commit sprint status
git add docs/sprint-artifacts/sprint-status.yaml
git commit -m "chore: mark story 5-2 as done"

# 8. Archive session
cd ..
# Invoke /sm and run finish-story task
# Archive as: story-5-2-env-validation-20241202.md
```

## Tips

### Link Story Files

If a story has a detailed `.md` file, reference it:

```markdown
## Story Context
**Story File:** UI/docs/sprint-artifacts/stories/5-2-environment-configuration-validation.md
**Sprint Status:** UI/docs/sprint-artifacts/sprint-status.yaml#L229
```

### Track Story Points

Include story points in your session for velocity tracking:

```markdown
**Points:** 3
**Estimated Hours:** 4-6
**Actual Hours:** [fill in when done]
```

### Cross-Repo Stories

For stories that span both repos:

```markdown
**Repos:** [X] API  [X] UI  [X] Both

## API Story
**ID:** 2-2-okta-sso-integration
**Status:** API/docs/sprint-artifacts/sprint-status.yaml#L50

## UI Story
**ID:** 3-2-client-context-propagation
**Status:** UI/docs/sprint-artifacts/sprint-status.yaml#L147
```

### Epic Progress Tracking

Track epic progress in your session:

```markdown
## Epic Progress
**Epic 5:** Bug Fixes (1/10 stories done, 5/47 points)
**This Story:** 5-2 (3 points)
**After This:** 2/10 stories, 8/47 points (17%)
```

## Integration with Workflows

### With /create-branches-from-story

```bash
# 1. Create branches with story ID
@/create-branches-from-story
# Branch: feature/5-2-env-config-validation

# 2. Session already created, add story details
# Edit .session/{STORY_ID}-session.md with sprint info

# 3. Update sprint status to in-progress

# 4. Work, commit, update to done
```

### With /new-work

```bash
# 1. Start session
@/new-work

# 2. Look up story in sprint status

# 3. Fill in session with story details

# 4. Update sprint status
```

## Quick Reference

```bash
# View API sprint status
cat API/docs/sprint-artifacts/sprint-status.yaml | grep -A 2 "epic-[0-9]:"

# View UI sprint status
cat UI/docs/sprint-artifacts/sprint-status.yaml | grep -A 2 "epic-[0-9]:"

# Find story by ID
grep "5-2-" UI/docs/sprint-artifacts/sprint-status.yaml

# Update story status
# Edit sprint-status.yaml: change 'backlog' to 'in-progress' or 'done'

# Commit sprint status
git add docs/sprint-artifacts/sprint-status.yaml
git commit -m "chore: update sprint status for story [ID]"
```

---

**Your Pennyfarthing session is now synced with sprint tracking!**
