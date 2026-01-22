---
name: jira
description: Jira CLI commands for sprint management. Use when viewing, assigning, or updating Jira issues from the command line.
args: "[view|claim|move|assign|create|sync|reconcile|link|search|sprint]"
---

# /jira - Jira Issue Management

<critical>
Never fabricate or guess Jira IDs. Valid Jira keys follow the pattern `MSSCI-XXXXX`. Old-style IDs like `31-18` are local sprint YAML placeholders, NOT valid Jira keys.
</critical>

## Commands

### `/jira` or `/jira view <issue-key>`

View details of a Jira issue.

<run>
jira issue view MSSCI-XXXXX
</run>

<when>
You need to see issue details: summary, status, assignee, description, linked issues.
</when>

<example>
# Standard view
jira issue view MSSCI-12038

# JSON output for scripting
jira issue view MSSCI-12038 --raw
</example>

---

### `/jira claim <issue-key> [--claim]`

Check availability and claim a story for work.

<run>
.pennyfarthing/scripts/core/run.sh jira/jira-claim-story.sh <issue-key> [--claim]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `issue-key` | Yes | Jira key `MSSCI-XXXXX` or story key `35-7-name` |
| `--claim` | No | Actually claim (assign + move to In Progress) |
</args>

<exit-codes>
| Code | Meaning |
|------|---------|
| `0` | Available or successfully claimed |
| `1` | Assigned to someone else |
| `2` | Not found or not synced |
| `3` | Error (CLI not installed, etc.) |
</exit-codes>

<example>
# Check if available
.pennyfarthing/scripts/core/run.sh jira/jira-claim-story.sh MSSCI-12038

# Claim it (assign to self + In Progress)
.pennyfarthing/scripts/core/run.sh jira/jira-claim-story.sh MSSCI-12038 --claim
</example>

---

### `/jira move <issue-key> <status>`

Transition a Jira issue to a new status.

<run>
jira issue move MSSCI-XXXXX "<status>" --project MSSCI
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `issue-key` | Yes | Jira key `MSSCI-XXXXX` |
| `status` | Yes | Target status (see table below) |
</args>

<output>
| Status | Description |
|--------|-------------|
| `To Do` | Not started |
| `In Progress` | Actively working |
| `Done` | Completed |
</output>

<example>
jira issue move MSSCI-12038 "In Progress" --project MSSCI
jira issue move MSSCI-12038 "Done" --project MSSCI
</example>

---

### `/jira assign <issue-key> <user>`

Assign an issue to a user.

<run>
jira issue assign MSSCI-XXXXX "<user>" --project MSSCI
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `issue-key` | Yes | Jira key `MSSCI-XXXXX` |
| `user` | Yes | Email, display name, or `x` to unassign |
</args>

<critical>
The `--project` flag is required even though the key contains the project prefix.
</critical>

<example>
# Assign to self
jira issue assign MSSCI-12038 "$(jira me)" --project MSSCI

# Assign by name
jira issue assign MSSCI-12038 "Keith Avery" --project MSSCI

# Unassign
jira issue assign MSSCI-12038 x --project MSSCI
</example>

---

### `/jira create story <epic-key> <story-id>`

Create a single Jira story under an epic from sprint YAML.

<run>
.pennyfarthing/scripts/core/run.sh jira/create-jira-story.sh <epic-key> <story-id>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-key` | Yes | Parent epic Jira key |
| `story-id` | Yes | Story ID from sprint YAML |
</args>

<when>
Creating a single story that's missing from Jira but exists in sprint YAML.
</when>

<example>
.pennyfarthing/scripts/core/run.sh jira/create-jira-story.sh MSSCI-12077 MSSCI-12066
</example>

<output>
1. Reads story from sprint YAML
2. Creates story in Jira with title, description, priority
3. Links to parent epic
4. Sets story points
5. Adds to current sprint
6. Updates sprint YAML with Jira key
</output>

---

### `/jira create epic <epic-id> [--dry-run]`

Create a Jira epic and all its child stories from sprint YAML.

<run>
.pennyfarthing/scripts/core/run.sh jira/create-jira-epic.sh <epic-id> [--dry-run]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic ID from sprint YAML (e.g., `epic-41` or `MSSCI-11952`) |
| `--dry-run` | No | Preview without creating issues |
</args>

<example>
# Preview what would be created
.pennyfarthing/scripts/core/run.sh jira/create-jira-epic.sh epic-41 --dry-run

# Create epic and stories
.pennyfarthing/scripts/core/run.sh jira/create-jira-epic.sh epic-41
</example>

<output>
1. Creates Jira epic if no `jira:` field exists
2. Creates all child stories linked to the epic
3. Sets story points and priority in Jira
4. Adds stories to current sprint (if jira_sprint_id set)
5. Updates sprint YAML with Jira keys
</output>

---

### `/jira sync <epic-id> [options]`

Sync an epic and its stories from sprint YAML to Jira.

<run>
.pennyfarthing/scripts/core/run.sh jira/sync-epic-jira.sh <epic-id> [options]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `epic-id` | Yes | Epic Jira key (e.g., `MSSCI-11952`) |
| `--dry-run` | No | Preview without making changes |
| `--transition` | No | Transition Jira issues to match YAML status |
| `--points` | No | Sync story points from YAML to Jira |
| `--all` | No | Equivalent to `--transition --points` |
</args>

<example>
# Show sync status
.pennyfarthing/scripts/core/run.sh jira/sync-epic-jira.sh MSSCI-11952

# Preview changes
.pennyfarthing/scripts/core/run.sh jira/sync-epic-jira.sh MSSCI-11952 --dry-run

# Full sync
.pennyfarthing/scripts/core/run.sh jira/sync-epic-jira.sh MSSCI-11952 --all
</example>

<output>
1. Compares sprint YAML status with Jira status
2. Optionally transitions Jira issues to match
3. Optionally syncs story points to Jira
4. Reports sync summary
</output>

---

### `/jira reconcile [--fix]`

Generate a reconciliation report comparing sprint YAML against Jira.

<run>
.pennyfarthing/scripts/core/run.sh jira/jira-reconcile.sh [--fix]
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `--fix` | No | Apply automatic fixes where safe |
</args>

<example>
# Report only
.pennyfarthing/scripts/core/run.sh jira/jira-reconcile.sh

# Report and fix
.pennyfarthing/scripts/core/run.sh jira/jira-reconcile.sh --fix
</example>

<output>
Checks performed:
1. **Status mismatches** - YAML status vs Jira status
2. **Missing Jira keys** - YAML stories without jira: field
3. **Orphan issues** - In Jira sprint but not in YAML
4. **Sprint membership** - YAML stories not in Jira sprint
5. **Epic sync** - Epic ID/jira field alignment
</output>

<when>
Use `--fix` to:
- Add YAML stories to Jira sprint if missing

Does NOT auto-fix (requires human decision):
- Status mismatches
- Missing Jira issues
</when>

---

### `/jira link <parent> <child> <type>`

Link two Jira issues.

<run>
jira issue link <parent-key> <child-key> "<link-type>"
</run>

<critical>
Argument order matters! First issue becomes the PARENT, second becomes the CHILD.
</critical>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `parent-key` | Yes | Parent issue Jira key |
| `child-key` | Yes | Child issue Jira key |
| `link-type` | Yes | Link type (see table below) |
</args>

<output>
| Type | Description |
|------|-------------|
| `Parent-Child` | For epic/story hierarchy |
| `Blocks` | For dependencies |
| `Relates` | For general relationships |
| `Duplicate` | For duplicate issues |
</output>

<example>
# Link epic to story (epic is parent)
jira issue link MSSCI-11494 MSSCI-11390 "Parent-Child"

# Unlink
jira issue unlink MSSCI-11494 MSSCI-11390

# Verify link direction
jira issue view MSSCI-11494 --plain | grep -A5 "Linked Issues"
</example>

---

### `/jira search <jql>`

Search for issues using JQL.

<run>
jira issue list --jql "<jql-query>" --plain
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `jql-query` | Yes | JQL query string |
</args>

<example>
# Find all epics
jira issue list --jql "project=MSSCI AND type=Epic" --plain

# Find stories in an epic
jira issue list --jql "project=MSSCI AND type=Story AND parent=MSSCI-10980" --plain

# Find by summary
jira issue list --jql "project=MSSCI AND summary~'feedback rules'" --plain

# Active sprint issues
jira issue list --project MSSCI -q "sprint in openSprints()" --plain

# Future sprint issues
jira issue list --project MSSCI -q "sprint in futureSprints()" --plain
</example>

---

### `/jira sprint add <sprint-id> <issue-key>`

Add an issue to a sprint.

<run>
jira sprint add <sprint-id> <issue-key>
</run>

<args>
| Arg | Required | Description |
|-----|----------|-------------|
| `sprint-id` | Yes | Numeric sprint ID |
| `issue-key` | Yes | Jira key `MSSCI-XXXXX` |
</args>

<example>
jira sprint add 276 MSSCI-11999
</example>

<when>
Get sprint ID from an issue:
```bash
jira issue view MSSCI-XXXXX --raw | jq '.fields.customfield_10020[] | select(.state == "active") | .id'
```
</when>

---

### `/jira sprint info`

Get sprint information from Jira.

<run>
jira issue view MSSCI-XXXXX --raw | jq '.fields.customfield_10020[] | select(.state == "active")'
</run>

<output>
Sprint field reference:
- Sprint data is in custom field `customfield_10020` (array of sprint objects)
- Each sprint object contains: `id`, `name`, `state`, `boardId`, `startDate`, `endDate`
- States: `active`, `future`, `closed`
</output>

---

## Quick Reference

| Command | Script/Action |
|---------|---------------|
| `/jira view MSSCI-XXX` | `jira issue view MSSCI-XXX` |
| `/jira claim MSSCI-XXX` | `jira-claim-story.sh MSSCI-XXX` |
| `/jira claim MSSCI-XXX --claim` | `jira-claim-story.sh MSSCI-XXX --claim` |
| `/jira move MSSCI-XXX "Done"` | `jira issue move MSSCI-XXX "Done" -p MSSCI` |
| `/jira assign MSSCI-XXX "user"` | `jira issue assign MSSCI-XXX "user" -p MSSCI` |
| `/jira create story E-KEY S-ID` | `create-jira-story.sh E-KEY S-ID` |
| `/jira create epic epic-41` | `create-jira-epic.sh epic-41` |
| `/jira sync MSSCI-XXX` | `sync-epic-jira.sh MSSCI-XXX` |
| `/jira sync MSSCI-XXX --all` | `sync-epic-jira.sh MSSCI-XXX --all` |
| `/jira reconcile` | `jira-reconcile.sh` |
| `/jira reconcile --fix` | `jira-reconcile.sh --fix` |
| `/jira link P-KEY C-KEY "Type"` | `jira issue link P-KEY C-KEY "Type"` |
| `/jira search "jql"` | `jira issue list --jql "jql"` |
| `/jira sprint add ID KEY` | `jira sprint add ID KEY` |

---

## Prerequisites

<run>
# Install jira CLI
brew install ankitpokhrel/jira/jira

# Initialize (one-time)
jira init

# Set API token (required)
export JIRA_API_TOKEN='your-token'
</run>

<when>
Create token at: https://id.atlassian.com/manage-profile/security/api-tokens
</when>

---

## GitHub to Jira User Mapping

| GitHub Username | Jira Email |
|-----------------|------------|
| slabgorb | keith.avery@1898andco.io |
| arcaven | michael.pursifull@1898andco.io |
| RoseSecurity | michael.rosenfeld@1898andco.io |
| Zious11 | jared.richards@1898andco.io |
| drbothen | joshua.magady@1898andco.io |

---

## Troubleshooting

### "400 Bad Request" on assign

<critical>
The `--project` flag is required:
</critical>

<example>
# WRONG
jira issue assign MSSCI-10988 "user@email.com"

# CORRECT
jira issue assign MSSCI-10988 "user@email.com" --project MSSCI
</example>

### "User not found"

Use either the exact email address or exact display name from Jira.

### Interactive prompts blocking scripts

<run>
echo "" | jira issue create --project MSSCI --type Story --summary "Title" --no-input
</run>

<when>
Always use `--no-input` flag and pipe empty input to prevent blocking.
</when>

### Token expired

Regenerate at https://id.atlassian.com/manage-profile/security/api-tokens
