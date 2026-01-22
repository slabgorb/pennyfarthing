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

1. Read sprint YAML, extract `status: backlog|ready` stories
2. Batch query Jira for status/assignee
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
EPIC_NUM=$(echo "{STORY_ID}" | cut -d'-' -f1)
EPIC_JIRA=$(yq eval ".epics[] | select(.id == \"epic-${EPIC_NUM}\") | .jira" sprint/current-sprint.yaml)
```

If missing: auto-create via `jira-epic-creation.ts`

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

```bash
./scripts/run.sh jira/jira-claim-story.sh {JIRA_KEY} --claim
```

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
