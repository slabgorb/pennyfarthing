---
description: Update CLAUDE-*.md domain documentation files based on current codebase
---

# Update Domain Documentation

You are a documentation updater. Your job is to refresh the `internal/CLAUDE-*.md` domain documentation files to reflect the current state of the codebase.

## Process

### 1. Analyze Current Code Structure

For each domain, scan the relevant files and extract:
- Service files and their main functions
- Handler files and their endpoints
- Model files and their structs
- Worker files (if applicable)
- Test files

### 2. Domain Mappings

Use these file patterns to identify domain content:

| Domain | Service Pattern | Handler Pattern | Model Pattern | Worker Pattern |
|--------|-----------------|-----------------|---------------|----------------|
| ticket | `ticket_*.go`, `activity_*.go`, `event_*.go`, `bulk_*.go` | `ticket_*.go`, `events.go` | `ticket.go`, `activity_log.go`, `event.go` | `event_worker.go` |
| escalation | `sla_*.go`, `escalation_*.go` | `sla_*.go`, `escalation_*.go` | `sla*.go`, `escalation.go` | `sla_violation_checker.go` |
| notification | `notifiers/*`, `quota_alert_*.go` | `notification_*.go` | `notification_*.go`, `quota_alert.go` | `notification_*.go` |
| search | `search_*.go`, `filter_*.go`, `similarity_*.go` | `search_*.go`, `filter_*.go`, `similarity_*.go` | `filter_preset.go` | - |
| impact | `impact_*.go`, `risk_*.go`, `predictive_*.go` | `ticket_impact_*.go` | `impact.go`, `risk_*.go`, `historical_*.go` | - |
| asset | `asset_*.go`, `client_asset_*.go`, `completeness_*.go` | `asset_*.go`, `client_asset_*.go`, `completeness_*.go` | `asset.go`, `score_history.go` | - |
| dashboard | `dashboard_*.go`, `system_metrics_*.go`, `consolidation_*.go`, `metrics_collector.go` | `dashboard_*.go`, `metrics_*.go`, `analytics_*.go` | `dashboard_*.go`, `metrics.go` | - |
| compliance | `audit_*.go`, `compliance_*.go`, `merkle_*.go` | `audit_*.go`, `compliance_*.go` | `audit_log.go`, `compliance.go`, `legal_hold.go` | - |
| feedback | `feedback_*.go` | `feedback_*.go` | `feedback.go` | - |
| client | `client_*.go`, `tenant_*.go`, `resource_*.go` | `client_*.go`, `tenant_*.go` | `client*.go` | - |
| admin | `admin_*.go` | `admin_*.go` | `admin.go` | - |

### 3. For Each Domain, Update:

1. **Key Files section** - List actual files that exist (exclude _test.go in main list)
2. **API Endpoints section** - Extract from handler files using grep for route patterns
3. **Key Concepts** - Keep existing if accurate, update if code changed
4. **Testing section** - Verify test command patterns work

### 4. Update Process

```bash
# For each domain, run these to gather info:
ls internal/services/*{pattern}*.go 2>/dev/null | grep -v _test
ls internal/handlers/*{pattern}*.go 2>/dev/null | grep -v _test
ls internal/models/*{pattern}*.go 2>/dev/null | grep -v _test
ls internal/workers/*{pattern}*.go 2>/dev/null | grep -v _test

# Extract API routes from handlers:
grep -h "\.GET\|\.POST\|\.PUT\|\.PATCH\|\.DELETE" internal/handlers/{pattern}*.go | head -20
```

### 5. Output

After updating each file:
1. Show what changed (new files added, removed files, new endpoints)
2. Confirm the update was made

### 6. Update Index

After all domain files are updated, refresh `internal/CLAUDE.md`:
- Update the keyword table if new keywords discovered
- Update file sizes in any size references
- Verify all domain files listed exist

## Execution

Start by asking: "Which domains should I update? (all / specific domain names)"

Then systematically:
1. Scan the codebase for each domain
2. Compare with existing CLAUDE-{domain}.md
3. Update files with current information
4. Report changes made

## Quick Mode

If user says "quick" or "all", update all domains without confirmation prompts.
