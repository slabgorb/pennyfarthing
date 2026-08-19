<gate name="stack-ready" model="haiku">

<purpose>
Verify that a stacked PR's parent story (or stories) are merged before allowing this PR to merge.
Prevents out-of-order merges that create broken intermediate states on the integration branch.

Used by: sm-finish (before merge step) when repo has `pr_strategy: stacked`.

Multi-parent aware (162-89 / 162-45): `depends_on` may be a scalar id or a
list. `pf sprint story stack-ready` resolves either form and reports readiness
machine-readably (all parents merged/archived -> ready), so a multi-parent
stack no longer false-passes on a stringified list.

Auto-pass when:
- Story has no `depends_on` (stack root)
- Repo `pr_strategy` is not `stacked`
- Every parent story is `done` (or archived/completed)
</purpose>

<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `STORY_ID` | Yes | Current story identifier |
| `SESSION_FILE` | Yes | Path to session file |
</arguments>

<pass>
1. Resolve readiness via the machine-readable consumer (handles scalar OR
   multi-parent list `depends_on`, plus archived-parent resolution).
2. A story with no `depends_on` reports `is_root: true, ready: true` — auto-pass.
3. Every parent `done` (or archived) -> `ready: true` -> pass.

```bash
# Exit 0 + ready:true when every parent is merged; exit 1 otherwise.
VERDICT=$(pf sprint story stack-ready {STORY_ID} --json)
echo "$VERDICT"
```

`VERDICT` is JSON: `{"story_id", "ready", "is_root", "parents":[{"id","status","satisfied"}], "blocking":[...]}`.

```yaml
GATE_RESULT:
  status: pass
  gate: stack-ready
  message: "All parents merged for {STORY_ID}"
  checks:
    - name: parents-merged
      status: pass
      detail: "Every depends_on parent is done/archived (see verdict.parents)"
```
</pass>

<fail>
If `ready` is false, one or more parents in `verdict.blocking` are not yet merged:

```yaml
GATE_RESULT:
  status: fail
  gate: stack-ready
  message: "Parent(s) {blocking} not yet merged for {STORY_ID}"
  checks:
    - name: parents-merged
      status: fail
      detail: "Unsatisfied parents: {blocking}; each must be done before merging this PR"
  recovery:
    - "Merge each blocking parent's PR first"
    - "Or remove depends_on from this story if the dependency no longer applies"
    - "After parents merge, run 'gt sync' to restack, then retry"
```
</fail>

</gate>
