---
name: 'step-05-import-to-future'
description: 'Import validated epics and stories into sprint/future.yaml backlog'

# Path Definitions
workflow_path: '{project_root}/.pennyfarthing/workflows/epics-and-stories'

# File References
thisStepFile: './step-05-import-to-future.md'
workflowFile: '{workflow_path}/workflow.yaml'
outputFile: '{planning_artifacts}/epics.md'
futureYaml: '{project_root}/sprint/future.yaml'

# Script References
importScript: '{project_root}/.pennyfarthing/scripts/sprint/import-epic-to-future.sh'
---

# Step 5: Import to Future Backlog

## STEP GOAL:

To import the validated epics and stories into `sprint/future.yaml` so they appear in the backlog and can be promoted to sprints.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 🛑 NEVER skip this step - epics must be in future.yaml to be scheduled
- 📖 CRITICAL: Read the complete step file before taking any action
- 📋 YOU ARE A FACILITATOR, confirming import with user
- ✅ YOU MUST ALWAYS SPEAK OUTPUT In your Agent communication style

### Step-Specific Rules:

- 🎯 Focus ONLY on importing to future.yaml
- 💬 Ask user for initiative name if not obvious from document
- 🚫 FORBIDDEN to modify the validated epics document
- ✅ Show dry-run output before applying

## IMPORT PROCESS:

### 1. Determine Initiative Name

Look at the epics document title and ask user:

> "What should this initiative be called in future.yaml?"
>
> Suggested: `{extracted_title}`

Wait for user confirmation or alternative name.

### 2. Preview Import (Dry Run)

Run the import script with `--dry-run` to show what will be added:

```bash
.pennyfarthing/scripts/sprint/import-epic-to-future.sh {outputFile} "{initiative_name}" --dry-run
```

Display the preview output to the user showing:
- Next epic number that will be assigned
- Initiative structure
- All stories with IDs

### 3. Confirm and Apply

Ask user: "Does this look correct? [Y] Yes, import to future.yaml / [N] No, make changes"

**If Y:**
Run the import without `--dry-run`:

```bash
.pennyfarthing/scripts/sprint/import-epic-to-future.sh {outputFile} "{initiative_name}"
```

**If N:**
Ask what changes are needed and help user adjust before re-running.

### 4. Verify Import

After successful import, verify by showing:

```bash
grep -A3 "{initiative_name}" sprint/future.yaml
```

Confirm:
- Epic appears in future.yaml
- Epic number is correct
- Stories have proper IDs

### 5. Complete Workflow

Display completion message:

```
## Workflow Complete!

**Epic imported:** epic-{N}
**Initiative:** {initiative_name}
**Stories:** {count} stories ready for sprint planning
**Location:** sprint/future.yaml

Next steps:
- Use `/sprint` to view the backlog
- Use `promote-epic.sh` to move to a sprint when ready
```

## SUCCESS CRITERIA:

- ✅ Initiative appears in future.yaml
- ✅ Epic has correct sequential number
- ✅ All stories have proper IDs (epic-story format)
- ✅ User confirms import is correct

## FAILURE MODES:

- ❌ Import script not found - check .pennyfarthing symlinks
- ❌ future.yaml not found - ensure sprint/ directory exists
- ❌ Duplicate epic number - script should handle this automatically

**Master Rule:** The workflow is not complete until epics are in future.yaml and accessible via sprint commands.
