# Jira CLI — Detailed Usage

All commands use `pf jira <command>` as the entry point. REST API is used where possible — no interactive prompt issues.

## Commands

### View Issue

```bash
pf jira view <KEY>
```

| Arg | Required | Description |
|-----|----------|-------------|
| `KEY` | Yes | Jira issue key (e.g., `MSSCI-12345`) |

Delegates to `jira issue view`. Shows summary, status, assignee, description, linked issues.

### Check Availability

```bash
pf jira check <KEY>
```

| Arg | Required | Description |
|-----|----------|-------------|
| `KEY` | Yes | Jira issue key |

Exit codes: `0` = available, `1` = assigned, `2` = not found, `3` = error.

### Claim Story

```bash
pf jira claim <KEY> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `KEY` | Yes | Jira issue key |
| `--dry-run` | No | Preview without making changes |

Assigns to self and moves to In Progress.

### Move Issue

```bash
pf jira move <KEY> "<STATUS>" [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `KEY` | Yes | Jira issue key |
| `STATUS` | Yes | Target status: `To Do`, `In Progress`, `In Review`, `Done` |
| `--dry-run` | No | Preview without making changes |

Checks current status first — skips if already there.

### Assign Issue

```bash
pf jira assign <KEY> <USER> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `KEY` | Yes | Jira issue key |
| `USER` | Yes | Email or GitHub username (auto-mapped) |
| `--dry-run` | No | Preview without making changes |

Checks current assignee — skips if already assigned.

### Link Issues

```bash
pf jira link <PARENT_KEY> <CHILD_KEY> [LINK_TYPE] [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `PARENT_KEY` | Yes | Inward issue (parent/blocker) |
| `CHILD_KEY` | Yes | Outward issue (child/blocked) |
| `LINK_TYPE` | No | `Relates` (default), `Blocks`, `Parent-Child`, `Duplicate` |
| `--dry-run` | No | Preview without making changes |

### Search Issues

```bash
pf jira search "<JQL>"
```

| Arg | Required | Description |
|-----|----------|-------------|
| `JQL` | Yes | JQL query string |

Delegates to `jira issue list --jql`.

### Create Epic

```bash
pf jira create epic <EPIC_ID> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_ID` | Yes | Epic ID from sprint YAML (e.g., `epic-63` or `63`) |
| `--dry-run` | No | Preview without creating |

Creates Jira epic and all child stories without existing Jira keys. Updates sprint YAML atomically.

### Create Story

```bash
pf jira create story <EPIC_JIRA_KEY> <STORY_ID> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC_JIRA_KEY` | Yes | Parent epic Jira key (e.g., `MSSCI-12077`) |
| `STORY_ID` | Yes | Local story ID (e.g., `63-7`) |
| `--dry-run` | No | Preview without creating |

Sets priority, points, sprint membership. Updates YAML.

### Create Standalone

```bash
pf jira create standalone "<TITLE>" [--points N] [-d DESC] [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `TITLE` | Yes | Story summary |
| `--points` | No | Story points (default: 2) |
| `-d` / `--description` | No | Story description |
| `--dry-run` | No | Preview without creating |

Creates story, adds to current sprint, transitions to Done. All via REST API.

### Sync Epic

```bash
pf jira sync <EPIC> [--transition] [--points] [--all] [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `EPIC` | Yes | Epic ID or Jira key |
| `--transition` | No | Sync status to Jira |
| `--points` | No | Sync story points |
| `--all` | No | Sync all fields (transition + points) |
| `--dry-run` | No | Preview without applying |

### Bidirectional Sync

```bash
pf jira bidirectional [options]
```

| Option | Description |
|--------|-------------|
| `--yaml-wins` | Prefer YAML values on conflict (default: Jira wins) |
| `--status` | Sync status field |
| `--points` | Sync story points |
| `--assignee` | Sync assignee field (Jira to YAML only) |
| `--all` | Sync all fields |
| `--sprint <ID>` | Target specific sprint |
| `--dry-run` | Preview without applying |

### Reconcile

```bash
pf jira reconcile [--fix]
```

| Option | Description |
|--------|-------------|
| `--fix` | Apply automatic fixes (add missing stories to sprint) |

Reports: status mismatches, missing Jira keys, orphans, sprint membership gaps.

### Sprint Add

```bash
pf jira sprint add <SPRINT_ID> <ISSUE_KEY> [--dry-run]
```

| Arg/Option | Required | Description |
|------------|----------|-------------|
| `SPRINT_ID` | Yes | Jira sprint ID number |
| `ISSUE_KEY` | Yes | Jira issue key |
| `--dry-run` | No | Preview without making changes |

---

## GitHub to Jira User Mapping

| GitHub Username | Jira Email |
|-----------------|------------|
| slabgorb | keith.avery@1898andco.io |
| arcaven | michael.pursifull@1898andco.io |
| RoseSecurity | michael.rosenfeld@1898andco.io |
| Zious11 | jared.richards@1898andco.io |
| drbothen | joshua.magady@1898andco.io |

## Prerequisites

```bash
brew install ankitpokhrel/jira-cli/jira-cli
jira init
export JIRA_API_TOKEN='your-token'
```

Create token at: https://id.atlassian.com/manage-profile/security/api-tokens
