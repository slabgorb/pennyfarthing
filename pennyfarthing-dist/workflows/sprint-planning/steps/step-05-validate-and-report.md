---
name: 'step-05-validate-and-report'
description: 'Validate the generated sprint status file and report results'

# Path Definitions
workflow_path: '{project_root}/.pennyfarthing/workflows/sprint-planning'

# File References
thisStepFile: './step-05-validate-and-report.md'
nextStepFile: null
---

# Step 5: Validate and Report

## Goal

Validate the generated sprint status file and report results.

## Validation Checks

Perform the following validation checks:

- [ ] Every epic in epic files appears in `{status_file}`
- [ ] Every story in epic files appears in `{status_file}`
- [ ] Every epic has a corresponding retrospective entry
- [ ] No items in `{status_file}` that don't exist in epic files
- [ ] All status values are legal (match state machine definitions)
- [ ] File is valid YAML syntax

## Count Totals

Calculate and report:

- Total epics: `{epic_count}`
- Total stories: `{story_count}`
- Epics in-progress: `{in_progress_count}`
- Stories done: `{done_count}`

## Completion Summary

Display to user:

**Sprint Status Generated Successfully**

- **File Location:** `{status_file}`
- **Total Epics:** `{epic_count}`
- **Total Stories:** `{story_count}`
- **Epics In Progress:** `{epics_in_progress_count}`
- **Stories Completed:** `{done_count}`

## Next Steps

1. Review the generated `{status_file}`
2. Use this file to track development progress
3. Agents will update statuses as they work
4. Re-run this workflow to refresh auto-detected statuses
