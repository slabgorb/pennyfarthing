# MSSCI-11796: Jira-Pennyfarthing Sync Improvements - Technical Context

## Overview

Epic 47 improves the bidirectional sync between Pennyfarthing's sprint YAML files and Jira. Currently, Jira keys are manually added to epics/stories, and sync is one-way (Pennyfarthing → Jira). This epic automates epic creation, sprint sync, and bidirectional status management.

## Technical Landscape

### Current State

**jira-lib.mjs** (`pennyfarthing-dist/scripts/utils/jira/jira-lib.mjs`)
- Shared Jira functions: `getIssueJson()`, `moveIssue()`, `syncStoryPoints()`
- Status mapping: `mapStatusToJira()`, `mapJiraToStatus()`
- Sprint YAML loading: `loadSprintFile()`, `findEpic()`, `findStory()`
- **Gap:** No `createEpic()` or `createStory()` functions

**jira-sync.mjs** (`pennyfarthing-dist/scripts/utils/jira/jira-sync.mjs`)
- Syncs existing epic stories to Jira (status, points)
- Skips stories without `jira:` field
- One-way: Pennyfarthing → Jira only
- **Gap:** Cannot detect stories in Jira but not in YAML

**generic-sm-setup.md** (`.pennyfarthing/agents/generic-sm-setup.md`)
- MODE=research: Scans backlog, checks Jira status
- MODE=setup: Claims Jira, creates branch, writes session file
- Uses `jira-claim-story.sh` for claiming
- **Gap:** No epic context verification step

### Jira CLI Commands

```bash
# Create epic
jira issue create --project MSSCI --type Epic \
  -s "Epic {N}: {title}" \
  -b "{description}" \
  -y Medium \
  -l pennyfarthing \
  --no-input

# Get current user
jira me

# Query sprint
jira sprint list --current
jira issue list --jql "sprint = {sprint_id} AND labels = pennyfarthing"

# Get issue details
jira issue view MSSCI-123 --raw
```

### Key Configuration

- **Project:** MSSCI
- **Jira URL:** https://1898andco.atlassian.net
- **Label:** pennyfarthing (for filtering)
- **Custom Field:** customfield_10031 (Story Points)

## Stories

| ID | Title | Points | Workflow |
|----|-------|--------|----------|
| 47-1 | Auto-create Jira epic on local epic creation | 3 | tdd |
| 47-2 | Sync sprint numbers with Jira sprint IDs | 3 | tdd |
| 47-3 | Detect Jira-only stories missing from sprint YAML | 3 | tdd |
| 47-4 | Bidirectional sync script for sprint YAML and Jira | 4 | tdd |
| 47-5 | Retrofit historical epics with Jira links | 2 | trivial |

## Implementation Patterns

### Adding New Jira Functions

1. Add to `jira-lib.mjs` as exported function
2. Use `jiraExec()` helper for CLI commands
3. Return `{ success: boolean, ...data }` pattern
4. Support `options.dryRun` for testing

### Modifying SM Setup Flow

1. Edit `generic-sm-setup.md` for new checks
2. Use shell scripts in `pennyfarthing-dist/scripts/utils/jira/`
3. Add new MODE or extend existing MODE with conditionals

### Sprint YAML Updates

1. Use `yq` for YAML manipulation
2. Preserve comments and formatting where possible
3. Validate with `yq '.' file.yaml` after changes

## Files to Watch

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/scripts/utils/jira/jira-lib.mjs` | Core Jira functions |
| `pennyfarthing-dist/scripts/utils/jira/jira-sync.mjs` | Epic sync script |
| `pennyfarthing-dist/scripts/utils/jira/jira-claim-story.sh` | Story claiming |
| `.pennyfarthing/agents/generic-sm-setup.md` | SM setup subagent |
| `sprint/current-sprint.yaml` | Sprint data source |

## Dependencies

- `jira-cli` (brew install ankitpokhrel/jira-cli/jira-cli)
- `yq` for YAML processing
- `JIRA_API_TOKEN` environment variable

## Risks

- Jira API rate limits on bulk operations
- Sprint ID mismatches if Jira sprints renamed
- Orphaned stories if epic deleted in one system but not other

## Technical Insights Discovered

### Background Task Pattern for Agent Workflows (from Story 47-2)

During the 47-2 session, we identified a critical anti-pattern in background task usage that was documented across all agent files.

#### The Anti-Pattern (DO NOT DO THIS)

```yaml
# WRONG - Spawns background then immediately blocks
Task tool:
  run_in_background: true
  prompt: "Check workflow status..."
# Then immediately:
TaskOutput tool:
  task_id: {id}
  block: true    # ← Defeats the purpose of background execution!
```

**Why it's wrong:** If you spawn a background task then immediately block waiting for it, you've prevented the user from interacting with the conversation. The whole point of background execution is to enable concurrent work.

#### The Correct Pattern

**For sequential workflows (status checks, handoffs, phase transitions):**
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  # NO run_in_background - workflow is sequential
  prompt: |
    Read and follow: .pennyfarthing/agents/workflow-status-check.md
    ...
```

**For truly independent work (tests while coding, parallel searches):**
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  run_in_background: true
  prompt: |
    Read and follow: .pennyfarthing/agents/testing-runner.md
    ...
# Continue working - Cyclist will notify when complete via OTEL
```

#### When to Use Each Pattern

| Situation | Pattern | Rationale |
|-----------|---------|-----------|
| Status check before deciding what to do | **Foreground** | Need result to proceed |
| Handoff between agents | **Foreground** | Sequential workflow step |
| Finish-story preflight checks | **Foreground** | Must complete before execution |
| Tests while writing more code | **Background + continue** | Independent work |
| Multiple file explorations | **Background + continue** | Parallel independent searches |

#### Cyclist's Background Task Notification System

Cyclist has built-in support for background task completion notifications:

1. **OTEL span detection** - The OTEL receiver intercepts Task tool spans and detects `run_in_background: true`
2. **IPC channel** - Fires `backgroundTask:completed` when the task finishes
3. **MessageView notification** - Cyclist UI shows expandable completion notification

**This means:** Fire the background task, tell the user it's running, and keep working. Cyclist handles the notification automatically when it finishes.

#### Documentation Updates

All agent files were updated to clarify this pattern:
- `shared-agent-behavior.md` - Added "Interactive Background Task Protocol" section
- `README.md` (agents) - Updated background execution guidance
- All 10 main agents (SM, TEA, Dev, Reviewer, Orchestrator, Architect, PM, DevOps, Tech Writer, UX Designer)
- `generic-handoff.md` subagent

**Commit:** `406d8ab0` - "docs: clarify background task pattern for interactive usage"
