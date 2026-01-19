# Jira Integration Setup

Guide for connecting Pennyfarthing to Jira for sprint management, including CLI setup, story-to-issue linking, status transitions, and sprint sync.

## Prerequisites

### Install Jira CLI

```bash
# macOS
brew install ankitpokhrel/jira/jira

# Verify installation
jira version
```

### Initial Configuration

```bash
# One-time setup
jira init

# Follow prompts:
# - Server: https://your-org.atlassian.net
# - Login: your.email@company.io
# - Project: YOUR_PROJECT_KEY
```

### API Token

Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens

```bash
# Set in environment
export JIRA_API_TOKEN='your-api-token-here'

# Add to shell config (~/.zshrc or ~/.bashrc)
echo 'export JIRA_API_TOKEN="your-token"' >> ~/.zshrc
```

## Environment Configuration

Add to your project's `.claude/project/hooks/setup-env.sh`:

```bash
export JIRA_PROJECT_KEY="MSSCI"           # Your project key
export PROJECT_LABEL="pennyfarthing"       # Label for issues
export JIRA_URL="https://your-org.atlassian.net"
```

## Jira CLI Commands

### Viewing Issues

```bash
# View issue details
jira issue view MSSCI-10988

# Get JSON for scripting
jira issue view MSSCI-10988 --raw
```

### Assigning Issues

```bash
# Assign to yourself
jira issue assign MSSCI-10988 "$(jira me)" --project MSSCI

# Assign to someone else (use email or display name)
jira issue assign MSSCI-10988 "jane.smith@company.io" --project MSSCI

# Unassign
jira issue assign MSSCI-10988 -u "" --project MSSCI
```

**Important:** Always include `--project` or `-p` flag.

### Status Transitions

```bash
# Move to In Progress
jira issue move MSSCI-10988 "In Progress" --project MSSCI

# Move to Done
jira issue move MSSCI-10988 "Done" --project MSSCI
```

### Creating Issues

```bash
# Create a story
jira issue create \
    --project MSSCI \
    --type Story \
    --summary "Implement user authentication" \
    --body "As a user, I want to log in securely" \
    --priority High \
    --label pennyfarthing \
    --parent MSSCI-10980 \
    --no-input
```

### Linking Issues

```bash
# Link story to epic (Parent-Child relationship)
# Order: Epic first (parent), Story second (child)
jira issue link MSSCI-11494 MSSCI-11390 "Parent-Child"
```

**Important:** Order matters - parent issue first, child second.

### Adding Comments

```bash
jira issue comment add MSSCI-10988 "Development started"
```

### Searching

```bash
# List epics
jira issue list --jql "project=MSSCI AND type=Epic"

# List in-progress stories
jira issue list --jql "project=MSSCI AND status='In Progress'"

# Search by label
jira issue list --jql "project=MSSCI AND labels=pennyfarthing"
```

## Story-to-Issue Linking

### Sprint YAML Format

Stories in `sprint/current-sprint.yaml` link to Jira:

```yaml
stories:
  - id: "35-7"
    title: "Feedback Rule Delete 404"
    description: "Fix 404 error when deleting feedback rules"
    jira: "https://jira.example.com/browse/MSSCI-10991"
    status: "in-progress"
    points: 5
    priority: "High"
    assigned_to: "Keith Avery"
    branch: "feat/35-7-feedback-rule-delete-404"
    pr: "https://github.com/org/repo/pull/42"
```

### Linking Functions

From `jira-lib.sh`:

```bash
# Search for existing epic
search_existing_epic "Epic Title"

# Search for story under epic
search_existing_story "MSSCI-10980" "Story Title"

# Create epic with label
create_epic "Epic Title" "Description"

# Create story under epic with points
create_story "MSSCI-10980" "Story Title" "Description" 5

# Update issue summary/description
update_issue "MSSCI-10988" "New Title" "New Description"
```

## Status Transition Automation

### Conductor-to-Jira Mapping

| Conductor Status | Jira Status |
|------------------|-------------|
| backlog | To Do |
| in-progress | In Progress |
| review | In Review |
| done | Done |

### Automatic Transitions

The `jira-sync-story.sh` script handles transitions:

```bash
# Sync status from sprint YAML to Jira
.pennyfarthing/scripts/run.sh jira-sync-story.sh 35-2-feature --transition

# Sync story points
.pennyfarthing/scripts/run.sh jira-sync-story.sh 35-2-feature --points

# Add comment
.pennyfarthing/scripts/run.sh jira-sync-story.sh 35-2-feature --comment "Started dev"

# Full sync
.pennyfarthing/scripts/run.sh jira-sync-story.sh 35-2-feature --transition --points
```

## Sprint Sync Process

### SM Story Setup

When SM claims a story:

```bash
# jira-claim-story.sh workflow
1. Check if story is unassigned
2. Assign to current user
3. Transition to "In Progress"
4. Return exit code:
   - 0: Claimed successfully
   - 1: Already assigned to someone else
   - 2: Not synced to Jira
```

### SM Finish Execution

When SM completes a story:

```bash
# jira-sync-story.sh workflow
1. Transition to "Done"
2. Sync story points
3. Add completion comment
```

### Epic Sync

Sync entire epic to Jira:

```bash
# Create/update epic and all stories
.pennyfarthing/scripts/run.sh sync-epic-to-jira.sh 35

# Dry run (preview without changes)
DRY_RUN=true .pennyfarthing/scripts/run.sh sync-epic-to-jira.sh 35
```

## Drift Detection

### Automatic Reconciliation

The `post-merge` git hook detects drift:

1. Branch merged (in last 7 days)
2. Sprint YAML status not "done"
3. Jira status not "Done/Closed"

Auto-reconciles by:
- Updating sprint YAML: `status: done`
- Transitioning Jira to "Done"
- Logging to `.session/reconciliation.log`

### Manual Drift Check

```bash
# From sprint-common.sh
detect_drift      # Find merged stories still in-progress
reconcile_drift   # Auto-update YAML and Jira
```

## Subagent Orchestration

SM delegates Jira operations to consolidated subagents:

| Subagent | Jira Operations |
|----------|-----------------|
| `sm-setup MODE=setup` | Claim issue, transition to In Progress |
| `sm-finish PHASE=preflight` | Check Jira status readiness |
| `sm-finish PHASE=execute` | Transition to Done, sync points |

### SM Workflow

```
SM → [Check Status] → [NEW_WORK]
  ↓
  → sm-setup MODE=setup:
    - jira-claim-story.sh --claim
    - Create branches
    - Write session file
  ↓
  → TEA → Dev → Reviewer → [APPROVED]
  ↓
  → sm-finish PHASE=preflight:
    - Check Jira readiness
    - Check PR/lint status
  ↓
  → sm-finish PHASE=execute:
    - jira-sync-story.sh --transition --points
    - Archive session
    - Update sprint YAML
```

## Common Issues

### "400 Bad Request" on Assign

**Cause:** Missing project flag.

```bash
# Wrong
jira issue assign MSSCI-10988 "user@email.com"

# Correct
jira issue assign MSSCI-10988 "user@email.com" --project MSSCI
```

### "User Not Found"

**Cause:** Use exact email or display name.

```bash
# Try email
jira issue assign -pMSSCI MSSCI-10988 "keith.avery@company.io"

# Or display name
jira issue assign -pMSSCI MSSCI-10988 "Keith Avery"
```

### Parent-Child Link Wrong Direction

**Cause:** Order matters - parent first, child second.

```bash
# Correct: Epic first, Story second
jira issue link MSSCI-11494 MSSCI-11390 "Parent-Child"

# Wrong: Creates inverse relationship
jira issue link MSSCI-11390 MSSCI-11494 "Parent-Child"
```

### Story Points Not Syncing

Story points use a custom field. Check your Jira instance's field ID:

```bash
# Get issue fields
jira issue view MSSCI-10988 --raw | jq '.fields'

# Common field ID: customfield_10031
```

## User Mapping

GitHub usernames to Jira emails (configure in `jira-lib.sh`):

```bash
case "$GITHUB_USERNAME" in
  slabgorb)     echo "keith.avery@company.io" ;;
  arcaven)      echo "michael.pursifull@company.io" ;;
  RoseSecurity) echo "michael.rosenfeld@company.io" ;;
  *)            echo "$GITHUB_USERNAME" ;;
esac
```

## JQL Reference

Common queries:

```bash
# Your assigned stories
jira issue list --jql "project=MSSCI AND assignee=currentUser()"

# Stories in current sprint
jira issue list --jql "project=MSSCI AND sprint in openSprints()"

# Unassigned stories
jira issue list --jql "project=MSSCI AND assignee is EMPTY"

# Stories by label
jira issue list --jql "project=MSSCI AND labels=pennyfarthing"

# Recently updated
jira issue list --jql "project=MSSCI AND updated >= -7d"
```

## File Locations

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/scripts/utils/jira-lib.sh` | Core Jira library |
| `pennyfarthing-dist/scripts/utils/jira-claim-story.sh` | Story claiming |
| `pennyfarthing-dist/scripts/utils/jira-sync-story.sh` | Story sync |
| `pennyfarthing-dist/scripts/utils/sync-epic-to-jira.sh` | Epic sync |
| `pennyfarthing-dist/skills/jira/SKILL.md` | CLI reference |

## See Also

- [Team Workflow](TEAM-WORKFLOW.md) - Multi-developer coordination
- [Workflows](WORKFLOWS.md) - TDD workflow documentation
- [Sprint Context Skill](SKILLS.md#sprint-context) - Sprint management
