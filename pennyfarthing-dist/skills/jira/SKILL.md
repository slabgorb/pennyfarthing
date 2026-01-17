---
name: jira
description: Jira CLI commands for sprint management. Use when viewing, assigning, or updating Jira issues from the command line.
---

# Jira CLI Skill

## Overview

This skill covers using `jira` (ankitpokhrel/jira) for Jira integration. The examples below use Conductor project settings - update PROJECT_KEY and PROJECT_LABEL for your project.

## Prerequisites

```bash
# Install jira
brew install ankitpokhrel/jira/jira

# Initialize (one-time setup)
jira init

# Set API token (required)
export JIRA_API_TOKEN='your-token'
# Create token at: https://id.atlassian.com/manage-profile/security/api-tokens
```

## Project Configuration

Configure these in your project's `.claude/project/hooks/setup-env.sh`:

```bash
export JIRA_PROJECT_KEY="MSSCI"    # Your Jira project key
export PROJECT_LABEL="conductor"   # Label for filtering issues (defaults to PROJECT_NAME)
```

The `PROJECT_LABEL` is used to tag Jira issues created by the sync scripts. If not set, it defaults to `PROJECT_NAME`.

Example settings (Conductor project):
- **Project Key:** `MSSCI`
- **Label:** `$PROJECT_LABEL` (or `$PROJECT_NAME` if not set)
- **Config file:** `~/.config/.jira/.config.yml`

## Common Operations

### View an Issue

```bash
# View issue details
jira issue view MSSCI-10988

# Get raw JSON (for scripting)
jira issue view MSSCI-10988 --raw
```

### Assign an Issue

**IMPORTANT:** The `-p/--project` flag is required even though the issue key contains the project prefix.

```bash
# Assign to a specific user (by email or display name)
jira issue assign -pMSSCI MSSCI-10988 "michael.rosenfeld@1898andco.io"
jira issue assign -pMSSCI MSSCI-10988 "Keith Avery"

# Assign to self
jira issue assign -pMSSCI MSSCI-10988 "$(jira me)"

# Unassign
jira issue assign -pMSSCI MSSCI-10988 x
```

### Move Issue Status

```bash
# Move to In Progress
jira issue move MSSCI-10988 "In Progress" --project MSSCI

# Move to Done
jira issue move MSSCI-10988 "Done" --project MSSCI
```

### Create Issues

```bash
# Create an epic
jira issue create \
    --project MSSCI \
    --type Epic \
    --summary "Epic Title" \
    --body "Description" \
    --label $PROJECT_LABEL \
    --no-input

# Create a story under an epic (--parent links it to the epic)
jira issue create \
    -pMSSCI \
    -tStory \
    -s"Story Title" \
    -b"Description" \
    --parent MSSCI-10980 \
    -yHigh \
    -l pennyfarthing \
    --no-input
```

### Link Issues (Parent-Child)

**CRITICAL:** Argument order matters! First issue becomes the PARENT, second becomes the CHILD.

```bash
# CORRECT: Epic is parent, Story is child
jira issue link MSSCI-11494 MSSCI-11390 "Parent-Child"
# Result: Epic "IS PARENT OF" Story ✓

# WRONG: This makes the Story parent of the Epic!
jira issue link MSSCI-11390 MSSCI-11494 "Parent-Child"
# Result: Story "IS PARENT OF" Epic ✗
```

**Verify the link direction:**
```bash
# Check what an issue is linked to
jira issue view MSSCI-11494 --plain | grep -A5 "Linked Issues"
# Should show: IS PARENT OF (not IS CHILD OF)
```

**Fix incorrect links:**
```bash
# Remove the bad link
jira issue unlink MSSCI-11390 MSSCI-11494

# Re-create with correct order (parent first, child second)
jira issue link MSSCI-11494 MSSCI-11390 "Parent-Child"
```

**Available link types:**
- `Parent-Child` - For epic/story hierarchy
- `Blocks` - For dependencies
- `Relates` - For general relationships
- `Duplicate` - For duplicate issues

### Search Issues

```bash
# Find epics
jira issue list --jql "project=MSSCI AND type=Epic" --plain

# Find stories in an epic
jira issue list --jql "project=MSSCI AND type=Story AND parent=MSSCI-10980" --plain

# Find by summary
jira issue list --jql "project=MSSCI AND summary~'feedback rules'" --plain
```

## Project Scripts

The project has helper scripts for common Jira operations. All scripts are invoked via `run.sh`:

```bash
# Pattern: ./.pennyfarthing/scripts/run.sh <script-name> [args]
# Or if scripts are in PATH: ./scripts/run.sh <script-name> [args]
```

### Sync Epic to Jira

Syncs all stories in an epic to Jira. Shows status, optionally transitions issues and syncs story points.

```bash
# Show sync status for epic 24
./.pennyfarthing/scripts/run.sh jira-sync.sh 24

# Dry run - show what would happen without making changes
./.pennyfarthing/scripts/run.sh jira-sync.sh 24 --dry-run

# Sync status (transition issues to match Conductor status)
./.pennyfarthing/scripts/run.sh jira-sync.sh 24 --transition

# Sync both status and story points
./.pennyfarthing/scripts/run.sh jira-sync.sh 24 --transition --points
```

### Sync Single Story

Syncs a single story to Jira with more detailed output.

```bash
# Show story status in Jira
./.pennyfarthing/scripts/run.sh jira-sync-story.sh 24-1

# Transition to match Conductor status
./.pennyfarthing/scripts/run.sh jira-sync-story.sh 24-1 --transition

# Sync story points
./.pennyfarthing/scripts/run.sh jira-sync-story.sh 24-1 --points

# Add a comment
./.pennyfarthing/scripts/run.sh jira-sync-story.sh 24-1 --comment "Started development"
```

### Claim a Story

Check availability and claim a Jira story for work.

```bash
# Check if story is available
./.pennyfarthing/scripts/run.sh jira-claim-story.sh MSSCI-10988

# Claim the story (assign to self + move to In Progress)
./.pennyfarthing/scripts/run.sh jira-claim-story.sh MSSCI-10988 --claim

# Using story key format
./.pennyfarthing/scripts/run.sh jira-claim-story.sh 35-4 --claim
```

### Script Summary

| Script | Purpose |
|--------|---------|
| `jira-sync.sh` | Sync all stories in an epic to Jira |
| `jira-sync-story.sh` | Sync a single story to Jira |
| `jira-claim-story.sh` | Claim a story (assign + move to In Progress) |
| `sync-epic-to-jira.sh` | Alias for `jira-sync.sh` |

## GitHub to Jira User Mapping

When assigning issues based on PR authors:

| GitHub Username | Jira Email |
|-----------------|------------|
| slabgorb | keith.avery@1898andco.io |
| arcaven | michael.pursifull@1898andco.io |
| RoseSecurity | michael.rosenfeld@1898andco.io |
| Zious11 | jared.richards@1898andco.io |
| drbothen | joshua.magady@1898andco.io |

## Troubleshooting

### "400 Bad Request" on assign

The `--project` flag is required:
```bash
# WRONG
jira issue assign MSSCI-10988 "user@email.com"

# CORRECT
jira issue assign --project MSSCI MSSCI-10988 "user@email.com"
```

### "User not found"

Use either the exact email address or exact display name from Jira:
```bash
# Both work - display name or email
jira issue assign -pMSSCI MSSCI-10988 "Keith Avery"
jira issue assign -pMSSCI MSSCI-10988 "keith.avery@1898andco.io"
```

### Interactive prompts blocking scripts

Always use `--no-input` flag for non-interactive usage:
```bash
jira issue create --project MSSCI --type Story --summary "Title" --no-input
```

### Token expired

Regenerate at https://id.atlassian.com/manage-profile/security/api-tokens and update:
```bash
export JIRA_API_TOKEN='new-token'
```

## Quick Reference

| Action | Command |
|--------|---------|
| View issue | `jira issue view MSSCI-XXX` |
| Assign | `jira issue assign --project MSSCI MSSCI-XXX "email@1898andco.io"` |
| Move status | `jira issue move MSSCI-XXX "In Progress" --project MSSCI` |
| Link parent→child | `jira issue link MSSCI-PARENT MSSCI-CHILD "Parent-Child"` |
| Unlink issues | `jira issue unlink MSSCI-XXX MSSCI-YYY` |
| Get my username | `jira me` |
| List issues | `jira issue list --jql "project=MSSCI"` |
| Claim story | `./scripts/jira-claim-story.sh MSSCI-XXX --claim` |
