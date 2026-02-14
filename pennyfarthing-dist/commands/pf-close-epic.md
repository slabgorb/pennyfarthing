---
description: Close an epic - verify completion, update status, and archive context
---

# Close Epic

<purpose>
Closes an epic after all stories are done. Updates sprint YAML, transitions Jira, archives context.
Counterpart to `/start-epic`. Idempotent — safe to run multiple times.
</purpose>

<usage>
```bash
/close-epic 79        # Close epic 79
/close-epic epic-79   # Also accepts epic-N format
```
</usage>

<workflow>
1. Parse epic ID (strip `epic-` prefix if present). Ask if not provided.
2. Read epic shard `sprint/epic-{JIRA_KEY}.yaml`, verify all stories `status: done`. Warn if incomplete.
3. Update epic: `status: done`, `completed_points: {sum of story points}`
4. Recalculate sprint summary totals in `sprint/current-sprint.yaml`
5. If epic has `jira:` key → `pf jira move {JIRA_KEY} "Done"`
6. If `sprint/context/context-epic-{N}.md` exists → move to `sprint/archive/`
7. Commit and push sprint changes
</workflow>

<related>
- `/start-epic` — Start an epic (move to current sprint, generate context)
- `/pf-sprint status` — View sprint progress
</related>
