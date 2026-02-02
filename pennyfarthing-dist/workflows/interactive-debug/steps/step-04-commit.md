# Step 4: Commit Changes

<step-meta>
number: 4
name: commit
gate: false
</step-meta>

## Purpose

Roll up all fixes into a single chore commit using the `/chore` skill.

## Mandatory Execution Rules

- REVIEW all changes before committing
- USE `/chore` skill for the commit
- VERIFY no unintended changes are staged

## Pre-Commit Review

Present summary of all changes:

```
## Debug Session Summary

**Issues Fixed:** [count]
**Files Changed:** [count]

### Changes

| File | Change |
|------|--------|
| `path/to/file.css` | Fixed overflow on main panel |
| `path/to/file.tsx` | Added missing click handler |
...

### Git Status
[show git status output]
```

Ask user to confirm:

> Ready to commit these changes as a chore fix?
>
> - **[C] Commit** - Bundle into chore commit
> - **[R] Review** - Show me the diffs first
> - **[S] Split** - These should be separate commits
> - **[X] Cancel** - Don't commit yet

## Commit Execution

**Use the `/chore` skill to create the commit.**

The chore skill will:
1. Stage the relevant files
2. Create a commit with appropriate message format
3. Handle the Co-Authored-By trailer

Suggested commit message format:

```
fix(ui): resolve visual bugs from debug session

- Fixed [issue 1 brief description]
- Fixed [issue 2 brief description]
...

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Post-Commit

After successful commit:

```
## Debug Session Complete

**Commit:** [hash]
**Message:** [commit message]
**Files:** [count] files changed

The fixes have been committed. You can:
- Push to remote when ready
- Continue with another debug session
- Exit the workflow
```

## Collaboration Menu

- **[P] Push** - Push to remote branch
- **[D] Debug more** - Start another debug session (back to step 1)
- **[X] Exit** - End workflow

## Workflow Complete

This concludes the interactive-debug workflow.
