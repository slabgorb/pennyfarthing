---
description: Sync Pennyfarthing epic to Jira MSSCI project using jira CLI
---

# Sync Epic to Jira Workflow

This workflow syncs a Pennyfarthing epic and its stories to Jira using the `jira` CLI tool.

**IMPORTANT:** All Pennyfarthing issues MUST be labeled with `pennyfarthing` to distinguish them from Pennyfarthing work.

## Prerequisites

- `jira` CLI installed: `brew install ankitpokhrel/jira-cli/jira-cli`
- `jira` CLI configured: `jira init`
- Epic exists in `sprint/current-sprint.yaml`

**For complete jira CLI reference, see the `jira` skill** (`.claude/skills/jira/SKILL.md`). The examples below are quick references; the skill has troubleshooting, user mappings, and edge cases.

## Label Requirement

All Pennyfarthing epics and stories must include the `pennyfarthing` label:
```bash
-l pennyfarthing
```

## Quick Sync

### Sync a Single Story

```bash
# View story status
./scripts/run.sh jira/jira-sync-story.sh 35-2-topology-editor

# Transition to match Pennyfarthing status
./scripts/run.sh jira/jira-sync-story.sh 35-2-topology-editor --transition

# Add a comment
./scripts/run.sh jira/jira-sync-story.sh 35-2-topology-editor --comment "Started development"
```

### Sync All Stories in Epic

```bash
# For each story in the epic, sync status
for story in $(yq '.epic-35.stories | keys | .[]' sprint/current-sprint.yaml); do
    ./scripts/run.sh jira/jira-sync-story.sh "$story" --transition
done
```

## Manual Jira CLI Commands

**IMPORTANT:** Most commands require `-p MSSCI` (project flag) even when the issue key contains the project prefix.

### View Issue

```bash
jira issue view MSSCI-123
```

### Create Story

```bash
jira issue create \
    -p MSSCI \
    -tStory \
    -s"Story 1-5: Add Epic Context Guardrail" \
    -b"Description here" \
    -yHigh \
    -l pennyfarthing \
    --no-input
```

### Create Epic

```bash
jira issue create \
    -p MSSCI \
    -tEpic \
    -s"Epic 1: Agentic Best Practices Implementation" \
    -b"Epic description" \
    -l pennyfarthing \
    --no-input
```

### Link Story to Epic

```bash
# Use --parent to link a story to its epic
jira issue create \
    -p MSSCI \
    -tStory \
    -s"Story Title" \
    --parent MSSCI-EPIC_KEY \
    -l pennyfarthing \
    --no-input
```

### Assign Issue

```bash
# Assign to self
jira issue assign -p MSSCI MSSCI-123 "$(jira me)"

# Assign to someone else
jira issue assign -p MSSCI MSSCI-123 "john.doe@1898andco.io"
```

### Transition Issue

```bash
jira issue move MSSCI-123 "In Progress" -p MSSCI
jira issue move MSSCI-123 "In Review" -p MSSCI
jira issue move MSSCI-123 "Done" -p MSSCI
```

### Add Comment

```bash
jira issue comment add MSSCI-123 "Development started on branch feat/35-2"
```

### Link Issues

```bash
jira issue link MSSCI-123 MSSCI-124 "Blocks"
```

### List Issues

```bash
# All in-progress stories
jira issue list -s "In Progress"

# Stories in current sprint
jira sprint list --current

# Stories assigned to me
jira issue list -a$(jira me)
```

## Status Mapping

| Pennyfarthing | Jira |
|-----------|------|
| `backlog` | To Do |
| `in-progress` | In Progress |
| `review` | In Review |
| `done` | Done |

## Priority Mapping

| Pennyfarthing | Jira |
|-----------|------|
| `P0` | Highest |
| `P1` | High |
| `P2` | Medium |

## Troubleshooting

**jira CLI not configured:**
```bash
jira init
# Follow prompts to authenticate
```

**Issue not found:**
- Check the Jira key is correct
- Verify you have access to the project

**Transition not available:**
- Some transitions require specific conditions
- Check the Jira workflow for allowed transitions

## Related Scripts

| Script | Purpose |
|--------|---------|
| `jira-claim-story.sh` | Check/claim story assignment |
| `jira-sync-story.sh` | Sync single story status |
| `sync-epic-to-jira.sh` | Generate sync report for epic |

---

**Last Updated**: 2025-12-16
