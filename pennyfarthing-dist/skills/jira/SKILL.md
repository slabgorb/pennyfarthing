---
name: jira
description: Jira CLI commands for sprint management. Use when viewing, assigning, or updating Jira issues from the command line.
args: "[view|check|claim|move|assign|create|sync|reconcile|link|search|sprint]"
---

# /jira - Jira Issue Management

<critical>
Never fabricate or guess Jira IDs. Valid Jira keys follow the pattern `MSSCI-XXXXX`. Old-style IDs like `31-18` are local sprint YAML placeholders, NOT valid Jira keys.
</critical>

<critical>
All commands use `pf jira <command>` as the canonical entry point. REST API is used where possible — no interactive prompt issues.
</critical>

## Commands

### View Issue

```bash
pf jira view MSSCI-12345
```

Shows issue details: summary, status, assignee, description, linked issues.

---

### Check Availability

```bash
pf jira check MSSCI-12345
```

Exit codes: `0` = available, `1` = assigned to someone else, `2` = not found, `3` = error.

---

### Claim Story

```bash
pf jira claim MSSCI-12345
```

Assigns to self + moves to In Progress. Same exit codes as check.

---

### Move Issue

```bash
pf jira move MSSCI-12345 "In Progress"
pf jira move MSSCI-12345 "Done"
pf jira move MSSCI-12345 "To Do"
pf jira move MSSCI-12345 "In Review"
```

Uses REST API transitions. Checks current status first — skips if already there.

---

### Assign Issue

```bash
pf jira assign MSSCI-12345 keith.avery@1898andco.io
pf jira assign MSSCI-12345 slabgorb
```

Accepts email or GitHub username (auto-mapped). Checks current assignee — skips if already assigned.

---

### Link Issues

```bash
pf jira link MSSCI-12345 MSSCI-12346 "Blocks"
pf jira link MSSCI-12345 MSSCI-12346 "Parent-Child"
pf jira link MSSCI-12345 MSSCI-12346 "Relates"
```

First key is inward (parent/blocker), second is outward (child/blocked).

---

### Search Issues

```bash
pf jira search "project=MSSCI AND type=Epic"
pf jira search "project=MSSCI AND parent=MSSCI-10980"
pf jira search "project=MSSCI AND summary~'feedback rules'"
```

Delegates to `jira issue list --jql`.

---

### Create Epic

```bash
pf jira create epic epic-63
pf jira create epic 63 --dry-run
```

Creates Jira epic + all child stories without Jira keys. Updates sprint YAML atomically.

---

### Create Story

```bash
pf jira create story MSSCI-12077 63-7
pf jira create story MSSCI-12077 63-7 --dry-run
```

Creates single story under an epic. Sets priority, points, sprint membership. Updates YAML.

---

### Sync Epic

```bash
pf jira sync MSSCI-11952 --all
pf jira sync 63 --transition --points
pf jira sync 63 --dry-run
```

Options: `--transition` (sync status), `--points` (sync story points), `--all` (both), `--dry-run`.

---

### Bidirectional Sync

```bash
pf jira bidirectional --all --dry-run
pf jira bidirectional --status --yaml-wins
```

Options: `--yaml-wins` (default: Jira wins), `--status`, `--points`, `--all`, `--sprint ID`.

---

### Reconcile

```bash
pf jira reconcile
pf jira reconcile --fix
```

Compares sprint YAML vs Jira. Reports: status mismatches, missing Jira keys, orphans, sprint membership gaps. `--fix` adds missing stories to sprint.

---

### Sprint Add

```bash
pf jira sprint add 276 MSSCI-11999
```

Add an issue to a sprint by sprint ID.

---

## Quick Reference

| Command | Action |
|---------|--------|
| `pf jira view MSSCI-XXX` | View issue details |
| `pf jira check MSSCI-XXX` | Check availability |
| `pf jira claim MSSCI-XXX` | Claim story |
| `pf jira move MSSCI-XXX "Done"` | Transition status |
| `pf jira assign MSSCI-XXX "user"` | Assign issue |
| `pf jira create epic epic-41` | Create epic + stories |
| `pf jira create story E-KEY S-ID` | Create single story |
| `pf jira sync MSSCI-XXX --all` | Sync epic to Jira |
| `pf jira bidirectional --all` | Bidirectional sync |
| `pf jira reconcile` | Reconciliation report |
| `pf jira reconcile --fix` | Reconcile + auto-fix |
| `pf jira link P-KEY C-KEY "Type"` | Link two issues |
| `pf jira search "jql"` | Search by JQL |
| `pf jira sprint add ID KEY` | Add to sprint |

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

## Prerequisites

```bash
# Install jira CLI (still needed for view/search)
brew install ankitpokhrel/jira-cli/jira-cli
jira init

# Set API token (required for all operations)
export JIRA_API_TOKEN='your-token'
```

Create token at: https://id.atlassian.com/manage-profile/security/api-tokens
