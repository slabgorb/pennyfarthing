---
description: Sync Conductor epic to Jira MSSCI project using jira CLI
---

# Sync Epic to Jira Workflow

This workflow syncs a Conductor epic and its stories to Jira using the `jira` CLI tool.

## Prerequisites

- `jira` CLI installed: `brew install ankitpokhrel/jira-cli/jira-cli`
- `jira` CLI configured: `jira init`
- Epic exists in `sprint/current-sprint.yaml`

## Quick Sync

### Sync a Single Story

```bash
# View story status
./scripts/jira-sync-story.sh 35-2-topology-editor

# Transition to match Conductor status
./scripts/jira-sync-story.sh 35-2-topology-editor --transition

# Add a comment
./scripts/jira-sync-story.sh 35-2-topology-editor --comment "Started development"
```

### Sync All Stories in Epic

```bash
# For each story in the epic, sync status
for story in $(yq '.epic-35.stories | keys | .[]' sprint/current-sprint.yaml); do
    ./scripts/jira-sync-story.sh "$story" --transition
done
```

## Manual Jira CLI Commands

### View Issue

```bash
jira issue view MSSCI-123
```

### Create Story

```bash
jira issue create \
    -tStory \
    -s"Story 35-2: Topology Editor" \
    -b"Description here" \
    -yHigh \
    -lcondutor
```

### Create Epic

```bash
jira issue create \
    -tEpic \
    -s"Epic 35: Feature Name" \
    -b"Epic description"
```

### Assign Issue

```bash
# Assign to self
jira issue assign MSSCI-123 $(jira me)

# Assign to someone else
jira issue assign MSSCI-123 "John Doe"
```

### Transition Issue

```bash
jira issue move MSSCI-123 "In Progress"
jira issue move MSSCI-123 "In Review"
jira issue move MSSCI-123 "Done"
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

| Conductor | Jira |
|-----------|------|
| `backlog` | To Do |
| `in-progress` | In Progress |
| `review` | In Review |
| `done` | Done |

## Priority Mapping

| Conductor | Jira |
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
