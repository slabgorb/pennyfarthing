# Sprint CLI — Examples

## Status & Discovery

```bash
# Full sprint status
pf.sh sprint status

# Only backlog stories
pf.sh sprint status backlog

# Only in-progress work
pf.sh sprint status in-progress

# Only completed stories
pf.sh sprint status done

# Available stories grouped by epic
pf.sh sprint backlog

# Sprint metrics and velocity
pf.sh sprint metrics
pf.sh sprint metrics --json

# Sprint header as JSON (for scripts)
pf.sh sprint info

# Future initiatives overview
pf.sh sprint future

# Future epic detail with stories
pf.sh sprint future epic-55
```

## Starting Work

```bash
# Show available stories (interactive)
pf.sh sprint work

# Start specific story
pf.sh sprint work 91-3

# Auto-select highest priority
pf.sh sprint work next

# Preview without starting
pf.sh sprint work 91-3 --dry-run

# Check story availability (JSON output)
pf.sh sprint check 91-3
pf.sh sprint check MSSCI-15033
pf.sh sprint check next
```

## Story Operations

```bash
# Show story details
pf.sh sprint story show 91-3
pf.sh sprint story show MSSCI-15033 --json

# Add story to epic
pf.sh sprint story add 91 "Add error handling" 3
pf.sh sprint story add 91 "Fix null pointer" 2 --type bug
pf.sh sprint story add 91 "Refactor parser" 3 --workflow trivial --priority p0

# Add standalone story to initiative
pf.sh sprint story add --initiative technical-debt "Fix flaky test" 2 --type bug

# Update story fields
pf.sh sprint story update 91-3 --status in_progress
pf.sh sprint story update 91-3 --status done
pf.sh sprint story update 91-3 --points 5 --priority P0
pf.sh sprint story update 91-3 --assigned-to keith.avery@1898andco.io
pf.sh sprint story update 91-3 --workflow tdd-tandem
pf.sh sprint story update 91-3 --status done --dry-run

# Get single field
pf.sh sprint story field 91-3 workflow    # tdd
pf.sh sprint story field 91-3 jira        # MSSCI-15033
pf.sh sprint story field 91-3 status      # in_progress

# Sizing guidelines
pf.sh sprint story size
pf.sh sprint story size 5

# Story templates
pf.sh sprint story template
pf.sh sprint story template feature
pf.sh sprint story template bug

# Complete story (archive, merge, Jira transition)
pf.sh sprint story finish 91-3
pf.sh sprint story finish 91-3 --dry-run

# Claim/unclaim in Jira
pf.sh sprint story claim MSSCI-15033
pf.sh sprint story claim MSSCI-15033 --unclaim
```

## Epic Operations

```bash
# Show epic details
pf.sh sprint epic show 91
pf.sh sprint epic show MSSCI-14298
pf.sh sprint epic show 91 --json

# Add new epic
pf.sh sprint epic add epic-95 "New Feature Epic"
pf.sh sprint epic add epic-95 "New Feature" --priority p0 --jira MSSCI-15100
pf.sh sprint epic add epic-95 "New Feature" -d "Description of the epic"

# Update epic
pf.sh sprint epic update 91 --status in_progress
pf.sh sprint epic update MSSCI-14298 --priority P0
pf.sh sprint epic update 91 --status done --dry-run

# Promote from future to current sprint
pf.sh sprint epic promote epic-55
pf.sh sprint epic promote 55
pf.sh sprint epic promote epic-55 --dry-run

# Archive completed epics
pf.sh sprint epic archive                     # Scan all completed
pf.sh sprint epic archive --dry-run           # Preview
pf.sh sprint epic archive 91                  # Specific epic
pf.sh sprint epic archive 91 --jira           # Also update Jira

# Cancel epic and all stories
pf.sh sprint epic cancel 91
pf.sh sprint epic cancel 91 --jira            # Also cancel in Jira
pf.sh sprint epic cancel 91 --dry-run

# Import BMAD epics
pf.sh sprint epic import docs/planning/feature-epics.md
pf.sh sprint epic import docs/planning/feature-epics.md "My Feature" --marker my-feature
pf.sh sprint epic import docs/planning/feature-epics.md --dry-run

# Remove from future.yaml
pf.sh sprint epic remove epic-41
pf.sh sprint epic remove epic-41 --dry-run

# Get epic field
pf.sh sprint epic field 91 jira               # MSSCI-14298
pf.sh sprint epic field 91 title              # Epic title
```

## Initiative Operations

```bash
# Show initiative details
pf.sh sprint initiative show benchmark-reliability
pf.sh sprint initiative show technical-debt --json

# Cancel initiative
pf.sh sprint initiative cancel technical-debt
pf.sh sprint initiative cancel technical-debt --jira
pf.sh sprint initiative cancel technical-debt --dry-run
```

## Sprint Lifecycle

```bash
# Initialize new sprint
pf.sh sprint new 2607 278 2026-02-16 2026-03-01 "Performance and polish"
pf.sh sprint new 2607 278 2026-02-16 2026-03-01 "Performance and polish" --dry-run

# Archive completed story
pf.sh sprint archive 91-3 856
pf.sh sprint archive 91-3 856 --apply          # Archive + remove atomically

# Validate sprint YAML
pf.sh sprint validate                           # All validators
pf.sh sprint validate sprint                    # Sprint YAML only
pf.sh sprint validate --fix                     # Auto-fix issues
pf.sh sprint validate --strict                  # Warnings as errors
```

## Sizing Quick Reference

| Points | Scale | Complexity | Examples |
|--------|-------|------------|----------|
| 1-2 | Trivial | Single file, minimal testing | Config, typo, simple fix |
| 3 | Small | Few files, some testing | Validation, single component |
| 5 | Medium | Multiple files, comprehensive testing | New page, API endpoint |
| 8 | Large | Significant scope, extensive testing | Integration, major refactor |
| 13+ | **SPLIT** | Too complex for single story | Break into smaller stories |
