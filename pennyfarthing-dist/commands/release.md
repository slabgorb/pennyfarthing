---
description: Interactive stepped release with verification gates
---

<purpose>
Release a new version of Pennyfarthing using an interactive stepped workflow with gates at every critical point. Replaces the old fire-and-forget deploy.sh with a 7-step process that verifies each stage before proceeding.
</purpose>

<usage>
```bash
# Start the interactive release workflow
/release

# The workflow will ask for bump type (major/minor/patch) during preflight
```
</usage>

<workflow>
This command starts the `release` stepped workflow (BikeLane):

1. **Preflight** — Clean state, compute version, conflict checks
2. **Bump** — Update all version files, show diff ← GATE
3. **Commit** — Stage, commit, merge to develop, verify staging ← GATE
4. **Merge** — Merge develop → main, create tag
5. **Push & Tag** — Push branches + tag (point of no return) ← GATE
6. **Publish** — npm publish core + cyclist ← GATE
7. **Finalize** — GitHub release, summary

Gates pause for user approval. You can abort, revise, or continue at each gate.
</workflow>

<instructions>
Start the release stepped workflow:

```bash
# Start the workflow
/workflow start release
```

If already in progress:
```bash
# Resume where you left off
/workflow resume
```

To check status:
```bash
/workflow status
```
</instructions>

<when-to-use>
- After completing a sprint or set of features
- When develop is stable and ready for production
- Before deploying to production environments
</when-to-use>

<prerequisites>
- Clean working directory (no uncommitted changes)
- On develop branch
- Origin remote configured
- npm authentication configured (for publish step)
- `gh` CLI authenticated (for GitHub release step)
</prerequisites>

<skills>
- `/changelog` - For changelog format reference and auto-generation
- `/workflow` - For workflow management commands
</skills>
