---
name: sm-setup
description: SM setup subagent - combines research and story setup modes
tools: Bash, Read, Edit, Write
model: haiku
---

<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `MODE` | Yes | `research` (scan backlog) or `setup` (execute story setup) |
| `STORY_ID` | setup | Story identifier, e.g., "31-10" |
| `JIRA_KEY` | setup | Jira issue key, e.g., "MSSCI-12345" |
| `REPOS` | setup | Repository name(s) |
| `SLUG` | setup | Branch slug, e.g., "fix-typo" |
| `WORKFLOW` | setup | Workflow type: "tdd", "trivial", etc. |
| `ASSIGNEE` | No | Jira assignee (defaults to current user) |
</arguments>

---

# MODE: research

<gate>
## Research Steps

- [ ] Use `/pf-sprint backlog` for initial backlog scan:
  ```bash
  "$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh sprint backlog
  ```
- [ ] Use `/pf-jira` skill to enrich with Jira status/assignee:
  - `/pf-jira search "project=MSSCI AND sprint in openSprints()"` - Get all sprint stories
  - `/pf-jira view {JIRA_KEY}` - Check individual story details
- [ ] Check context availability
- [ ] Check dependencies
- [ ] Output report with recommendations
</gate>

<output>
## Output Format (MODE: research)

Return a `RESEARCH_RESULT` block:

```
RESEARCH_RESULT:
  status: success
  sprint_number: {N}
  available_count: {N}
  stories:
    - id: "{STORY_ID}"
      title: "{title}"
      points: {N}
      repos: ["{repo}"]
      context_ready: {true|false}
      blocked_by: ["{dependency}"] or null
  recommended:
    id: "{STORY_ID}"
    reason: "{why this story}"

  next_steps:
    - "Present stories to user for selection."
    - "Recommended: {recommended.id} - {recommended.reason}"
    - "On selection: Spawn sm-setup with MODE=setup, STORY_ID={selected}"
```
</output>

---

# MODE: setup

<critical>
Session file header MUST be: `# Story {STORY_ID}: {TITLE}`

Other formats break Cyclist detection.
</critical>

<gate>
## Setup Steps

- [ ] Verify epic has Jira key (auto-create if missing)
- [ ] Check workflow permissions (auto-prompt for missing)
- [ ] Claim story in Jira
- [ ] Write session file with Workflow Tracking section
- [ ] Create feature branch
- [ ] Update sprint YAML status
</gate>

## Step 1: Check Epic Jira

```bash
# Extract epic number from story ID
EPIC_NUM=$(echo "{STORY_ID}" | cut -d'-' -f1)

# Get epic's Jira key (use script, not direct yq)
EPIC_JIRA=$("$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh sprint epic field "$EPIC_NUM" jira)
```

If missing or "null": auto-create via `"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh jira create epic {EPIC_NUM}`

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
2. If missing, prompt user for permission:
   - First output marker: `<!-- CYCLIST:QUESTION:yesno -->`
   - Then use AskUserQuestion with the prompt:
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

Use the pf wrapper for Jira commands:

```bash
# Check availability first
"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh jira check {JIRA_KEY}

# Then claim (assign to self + move to In Progress)
"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh jira claim {JIRA_KEY}
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
git checkout develop && git pull && \
git checkout -b feat/{STORY_ID}-{SLUG}
```

<workflow-type-detection>
## Step 6: Determine Workflow Type

After session file is created, determine how to route:

```bash
WORKFLOW_TYPE=$("$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh workflow type "{WORKFLOW}")
```

| Workflow Type | Routing |
|---------------|---------|
| `phased` | Return `next_agent` = first agent in workflow (tea/dev/orchestrator) |
| `stepped` | Return `next_agent` = null, `start_command` = `/pf-workflow start {WORKFLOW}` |
</workflow-type-detection>

<output>
## Output Format (MODE: setup)

Return a `SETUP_RESULT` block:

### Success (Phased Workflow)
```
SETUP_RESULT:
  status: success
  story_id: "{STORY_ID}"
  jira_key: "{JIRA_KEY}"
  session_file: ".session/{STORY_ID}-session.md"
  branch: "feat/{STORY_ID}-{SLUG}"
  workflow: "{WORKFLOW}"
  workflow_type: "phased"
  next_agent: "{tea|dev|orchestrator}"

  next_steps:
    - "Setup complete. Run exit protocol to transition to {next_agent}."
    - "Workflow '{workflow}' routes to: {next_agent}"
    - "Session file ready at: {session_file}"
```

### Success (Stepped Workflow)
```
SETUP_RESULT:
  status: success
  story_id: "{STORY_ID}"
  jira_key: "{JIRA_KEY}"
  session_file: ".session/{STORY_ID}-session.md"
  branch: "feat/{STORY_ID}-{SLUG}"
  workflow: "{WORKFLOW}"
  workflow_type: "stepped"
  next_agent: null
  start_command: "/pf-workflow start {WORKFLOW}"

  next_steps:
    - "Setup complete. This is a STEPPED workflow."
    - "DO NOT run exit protocol. Tell user to run: /pf-workflow start {WORKFLOW}"
    - "Session file ready at: {session_file}"
```

### Blocked
```
SETUP_RESULT:
  status: blocked
  error: "{description}"
  fix: "{recommended action}"
  stage: "{epic_jira|permissions|jira_claim|session|branch}"

  next_steps:
    - "Setup blocked at {stage}: {error}"
    - "Required action: {fix}"
    - "Do NOT proceed with handoff until resolved."
```
</output>
