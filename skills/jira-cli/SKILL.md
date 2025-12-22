---
name: jira-cli
description: Jira CLI commands for sprint management. Use when viewing, assigning, or updating Jira issues from the command line.
---

# Jira CLI Skill

## Overview

This skill covers using `jira-cli` (ankitpokhrel/jira-cli) for Jira integration. The examples below use Conductor project settings - update PROJECT_KEY and PROJECT_LABEL for your project.

## Prerequisites

```bash
# Install jira-cli
brew install ankitpokhrel/jira-cli/jira-cli

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
export PROJECT_LABEL="conductor"   # Label for filtering issues
```

Example settings (Conductor project):
- **Project Key:** `MSSCI`
- **Label:** `$PROJECT_LABEL`
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

**IMPORTANT:** The `--project` flag is required even though the issue key contains the project prefix.

```bash
# Assign to a specific user (by email)
jira issue assign --project MSSCI MSSCI-10988 "michael.rosenfeld@1898andco.io"

# Assign to self
jira issue assign --project MSSCI MSSCI-10988 "$(jira me)"

# Unassign
jira issue assign --project MSSCI MSSCI-10988 x
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

# Create a story under an epic
jira issue create \
    --project MSSCI \
    --type Story \
    --summary "Story Title" \
    --body "Description" \
    --parent MSSCI-10980 \
    --priority High \
    --label $PROJECT_LABEL \
    --no-input
```

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

The project has helper scripts for common Jira operations:

### Claim a Story

```bash
# Check if story is available
./scripts/jira-claim-story.sh MSSCI-10988

# Claim the story (assign to self + move to In Progress)
./scripts/jira-claim-story.sh MSSCI-10988 --claim

# Using story key format
./scripts/jira-claim-story.sh 35-4-checklist-configuration-ui --claim
```

### Sync Sprint to Jira

```bash
# Sync an epic to Jira
./scripts/sync-epic-to-jira.sh 35

# Sync with comments
./scripts/sync-epic-to-jira.sh 35 --with-comments

# Dry run
./scripts/sync-epic-to-jira.sh 35 --dry-run
```

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

Use the exact email address from Jira, not display name:
```bash
# WRONG
jira issue assign --project MSSCI MSSCI-10988 "Michael Rosenfeld"

# CORRECT
jira issue assign --project MSSCI MSSCI-10988 "michael.rosenfeld@1898andco.io"
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
| Get my username | `jira me` |
| List issues | `jira issue list --jql "project=MSSCI"` |
| Claim story | `./scripts/jira-claim-story.sh MSSCI-XXX --claim` |
