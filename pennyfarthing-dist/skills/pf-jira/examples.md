# Jira CLI — Examples

## Viewing & Checking

```bash
# View issue details
pf.sh jira view MSSCI-12345

# Check if story is available to claim
pf.sh jira check MSSCI-12345

# Search by JQL
pf.sh jira search "project=MSSCI AND type=Epic"
pf.sh jira search "project=MSSCI AND parent=MSSCI-10980"
pf.sh jira search "project=MSSCI AND summary~'feedback rules'"
```

## Claiming & Assigning

```bash
# Claim story (assign to self + In Progress)
pf.sh jira claim MSSCI-12345

# Assign to user by email
pf.sh jira assign MSSCI-12345 keith.avery@1898andco.io

# Assign by GitHub username (auto-mapped)
pf.sh jira assign MSSCI-12345 slabgorb

# Preview
pf.sh jira claim MSSCI-12345 --dry-run
pf.sh jira assign MSSCI-12345 slabgorb --dry-run
```

## Transitions

```bash
# Move to In Progress
pf.sh jira move MSSCI-12345 "In Progress"

# Move to Done
pf.sh jira move MSSCI-12345 "Done"

# Move to In Review
pf.sh jira move MSSCI-12345 "In Review"

# Move back to To Do
pf.sh jira move MSSCI-12345 "To Do"

# Preview
pf.sh jira move MSSCI-12345 "Done" --dry-run
```

## Creating Issues

```bash
# Create epic + all child stories from sprint YAML
pf.sh jira create epic epic-63
pf.sh jira create epic 63
pf.sh jira create epic 63 --dry-run

# Create single story under an epic
pf.sh jira create story MSSCI-12077 63-7
pf.sh jira create story MSSCI-12077 63-7 --dry-run

# Create standalone story (create + sprint + Done)
pf.sh jira create standalone "Fix sprint script shard support"
pf.sh jira create standalone "Fix sprint script shard support" --points 3
pf.sh jira create standalone "Add drift detection" -d "Detects YAML drift"
pf.sh jira create standalone "Quick fix" --dry-run
```

## Linking Issues

```bash
# Block relationship
pf.sh jira link MSSCI-12345 MSSCI-12346 "Blocks"

# Parent-child
pf.sh jira link MSSCI-12345 MSSCI-12346 "Parent-Child"

# Related (default)
pf.sh jira link MSSCI-12345 MSSCI-12346
pf.sh jira link MSSCI-12345 MSSCI-12346 "Relates"

# Duplicate
pf.sh jira link MSSCI-12345 MSSCI-12346 "Duplicate"
```

## Syncing

```bash
# Sync epic to Jira (all fields)
pf.sh jira sync MSSCI-11952 --all

# Sync only status transitions
pf.sh jira sync 63 --transition

# Sync only story points
pf.sh jira sync 63 --points

# Preview
pf.sh jira sync 63 --all --dry-run

# Bidirectional sync (Jira wins by default)
pf.sh jira bidirectional --all
pf.sh jira bidirectional --all --dry-run

# YAML wins on conflicts
pf.sh jira bidirectional --status --yaml-wins

# Sync specific fields
pf.sh jira bidirectional --status --points --assignee

# Target specific sprint
pf.sh jira bidirectional --all --sprint 276
```

## Reconciliation

```bash
# Report mismatches
pf.sh jira reconcile

# Auto-fix (add missing stories to sprint)
pf.sh jira reconcile --fix
```

## Sprint Management

```bash
# Read sprint ID from current-sprint.yaml (never hardcode)
SPRINT_ID=$(grep 'jira_sprint_id:' sprint/current-sprint.yaml | awk '{print $2}')

# Add issue to sprint
pf.sh jira sprint add "$SPRINT_ID" MSSCI-11999

# Preview
pf.sh jira sprint add "$SPRINT_ID" MSSCI-11999 --dry-run
```

## Common Workflows

### New story from sprint YAML to Jira
```bash
# 1. Add story to sprint YAML
pf.sh sprint story add 91 "New feature" 3

# 2. Create in Jira under existing epic
pf.sh jira create story MSSCI-14298 91-5

# 3. Claim it
pf.sh jira claim MSSCI-15050
```

### End-of-sprint reconciliation
```bash
# 1. Check for mismatches
pf.sh jira reconcile

# 2. Sync all completed stories
pf.sh jira bidirectional --all

# 3. Fix any remaining issues
pf.sh jira reconcile --fix
```
