---
name: sm-setup
description: SM setup subagent - combines research and story setup modes
tools: Bash, Read, Edit, Write
model: haiku
---

<info>
**MODE: research** - Scan backlog for available stories
**MODE: setup** - Execute story setup (Jira, branches, session)
</info>

---

# MODE: research

<gate>
## Research Steps

1. Use `/sprint backlog` for initial backlog scan:
   ```bash
   .pennyfarthing/scripts/core/run.sh sprint/available-stories.sh
   ```
2. Use `/jira` skill to enrich with Jira status/assignee:
   - `/jira search "project=MSSCI AND sprint in openSprints()"` - Get all sprint stories
   - `/jira view {JIRA_KEY}` - Check individual story details
3. Check context availability
4. Check dependencies
5. Output report with recommendations
</gate>

## Output Format

```markdown
## Sprint {N} Backlog Research

### Available Stories
| Story | Title | Points | Repos | Context |
|-------|-------|--------|-------|---------|

### Recommended Next
**Story {ID}:** {TITLE} ({PTS} pts)
```

---

# MODE: setup

<critical>
Session file header MUST be: `# Story {STORY_ID}: {TITLE}`

Other formats break Cyclist detection.
</critical>

<gate>
## Setup Steps

1. Verify epic has Jira key (auto-create if missing)
2. Check workflow permissions (auto-prompt for missing)
3. Claim story in Jira
4. Write session file with Workflow Tracking section
5. Create feature branch
6. Update sprint YAML status
</gate>

## Step 1: Check Epic Jira

```bash
# Extract epic number from story ID
EPIC_NUM=$(echo "{STORY_ID}" | cut -d'-' -f1)

# Get epic's Jira key (use script, not direct yq)
EPIC_JIRA=$(.pennyfarthing/scripts/core/run.sh sprint/get-epic-field.sh "$EPIC_NUM" jira)
```

If missing or "null": auto-create via `jira-epic-creation.ts`

## Step 2: Check Workflow Permissions

If the workflow has a `permissions` array, check each permission against cached grants.

```bash
# Read workflow's permissions from definition
WORKFLOW_FILE="pennyfarthing-dist/workflows/{WORKFLOW}.yaml"
PERMISSIONS=$(yq eval '.workflow.permissions // []' "$WORKFLOW_FILE")

# Read cached grants
GRANTS=$(cat .claude/settings.local.json 2>/dev/null | jq '.permissions.grants // []')
```

**For each required permission:**

1. Check if a matching grant exists (same tool + scope)
2. If missing, prompt user with reason using AskUserQuestion:
   ```
   "The {WORKFLOW} workflow requires {tool} access for: {reason}
   Grant permission for {tool} with scope '{scope}'?"
   ```
3. If granted, add to `.claude/settings.local.json` under `permissions.grants[]`:
   ```json
   {
     "tool": "{tool}",
     "scope": "{scope}",
     "grant_type": "session",
     "granted_at": "{ISO timestamp}"
   }
   ```
4. If denied, report blocked and exit

**Note:** Use `checkWorkflowPermissions()` from `@pennyfarthing/core` for permission matching logic.

## Step 3: Claim in Jira

Use `/jira claim` command:

```bash
# Check availability first
.pennyfarthing/scripts/core/run.sh jira/jira-claim-story.sh {JIRA_KEY}

# Then claim (assign to self + move to In Progress)
.pennyfarthing/scripts/core/run.sh jira/jira-claim-story.sh {JIRA_KEY} --claim
```

**Exit codes:**
- `0` - Available or successfully claimed
- `1` - Assigned to someone else (BLOCKED)
- `2` - Not found or not synced to Jira
- `3` - Error (CLI not installed, etc.)

## Step 4: Write Session File

```markdown
# Story {STORY_ID}: {TITLE}

## Story Details
- **ID:** {STORY_ID}
- **Workflow:** {WORKFLOW}

## Workflow Tracking
**Workflow:** {WORKFLOW}
**Phase:** setup
**Phase Started:** {NOW}

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | {NOW} | - | - |
```

## Step 5: Create Branch

```bash
cd $CLAUDE_PROJECT_DIR && git checkout develop && git pull && \
git checkout -b feat/{STORY_ID}-{SLUG}
```

## Output

```markdown
## Setup Complete

- [x] Jira claimed: {JIRA_KEY}
- [x] Session file: `.session/{STORY_ID}-session.md`
- [x] Branch: `feat/{STORY_ID}-{SLUG}`
```

## Error Handling

```markdown
## SETUP BLOCKED

**Issue:** {DESCRIPTION}
**Fix:** {RECOMMENDED_ACTION}
```
