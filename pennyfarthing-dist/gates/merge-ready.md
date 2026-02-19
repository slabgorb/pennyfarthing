<gate name="merge-ready" model="haiku">

<purpose>
Block new work if non-draft pull requests are open. Open non-draft PRs represent
incomplete review cycles that must be resolved before starting new stories.
Draft PRs are allowed — they represent in-progress work not yet ready for review.
Extracted from the sm.md merge-gate.
</purpose>

<pass>
Run:
```bash
gh pr list --state open --search "draft:false" --json number,title,url
```

If the result is empty (no non-draft open PRs), return:

```yaml
GATE_RESULT:
  status: pass
  gate: merge-ready
  message: "No open non-draft PRs. Clear to start new work."
  checks:
    - name: no-open-prs
      status: pass
      detail: "Zero non-draft PRs found"
```
</pass>

<fail>
If any non-draft PRs exist, list them and block:

```yaml
GATE_RESULT:
  status: fail
  gate: merge-ready
  message: "Blocked: {N} non-draft PR(s) open"
  checks:
    - name: no-open-prs
      status: fail
      detail: "Open PRs: {list of PR numbers and titles}"
  recovery:
    - "Merge or close open PRs before starting new work"
    - "Use /reviewer to complete pending reviews"
    - "Convert to draft if work is not ready: gh pr ready --undo {number}"
```
</fail>

</gate>
