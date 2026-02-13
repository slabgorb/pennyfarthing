---
description: Interactive stepped release with verification gates
---

<purpose>
Release a new version of Pennyfarthing using an interactive stepped workflow with gates at every critical point. An 11-step process that verifies each stage before proceeding.
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
3. **Changelog** — Generate entries from commits (`/changelog`) ← GATE
4. **README** — Audit feature counts, update content
5. **CLAUDE.md** — Verify version, build commands, project structure
6. **Retro** — Optional retrospective (`/retro`)
7. **Commit** — Stage, commit, merge to develop, verify staging ← GATE
8. **Merge** — Merge develop → main, create tag
9. **Push & Tag** — Push branches + tag (point of no return) ← GATE
10. **Publish** — npm publish all packages (core, cyclist, theme packs) ← GATE
11. **Finalize** — GitHub release, summary

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
- `/retro` - For optional release retrospective
- `/workflow` - For workflow management commands
</skills>
