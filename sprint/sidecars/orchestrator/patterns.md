# Orchestrator Process Patterns

> Critical patterns learned from Pennyfarthing development

## Pattern: Automatic vs Instructional Behavior

**Problem:** Agent behavior depends on following multi-step markdown instructions, which often fails during handoffs.

**Solution:** Make critical behaviors automatic via scripts rather than instructional via markdown.

### When to Apply
**Use automatic (script-based)** when:
- Behavior is critical and must not be skipped
- Multiple steps are involved
- Behavior should work during handoffs

**Use instructional (markdown-based)** when:
- Behavior is optional or context-dependent
- Agent judgment is required

---

## Pattern: Script Output as Agent Context

Output results in XML-like tags for agents to parse:
```bash
echo "<persona agent=\"${agent_name}\" theme=\"${theme}\">"
echo "Character: $(yq ...)"
echo "</persona>"
```

---

## Pattern: The .claude Climber (Portable Path Resolution)

**Problem:** `$CLAUDE_PROJECT_DIR` is NOT available in Bash tool invocations.

**Solution:** Use inline directory climbing:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/scripts/run.sh" SCRIPT ARGS
```

### Context Reference Table
| Context | `$CLAUDE_PROJECT_DIR` | Use Instead |
|---------|----------------------|-------------|
| Hooks (settings.local.json) | ✅ Available | Use it |
| statusLine | ✅ Available | Use it |
| Bash tool invocations | ❌ NOT SET | Use climber |

---

## Pattern: Skills Must Instruct Tool Use

**Problem:** Code blocks in skill files are documentation, not executed.

**Solution:** Use explicit tool-invocation instructions:
```markdown
**FIRST:** Use Bash tool to run: `command here`
```

---

## Pattern: Merge Critical Config, Skip User Config

**Problem:** `pennyfarthing init` skipped files if they existed, missing critical hooks.

**Solution:** Merge required configuration into existing files:
- Merge REQUIRED fields (hooks, paths)
- Preserve USER-CUSTOMIZED fields (permissions)

---

## Pattern: Reserve Capacity for Emergent Work

**Problem:** Mid-sprint bug discoveries (like Story 4-5) compete with planned work.

**Solution:** Plan at 80-85% of velocity target to leave room for:
- Bug fixes discovered during development
- Process improvements identified during work
- Urgent customer requests

**Example:** Sprint 2 had 34 points planned against 20pt velocity. Story 4-5 (statusline bug) was added mid-sprint but handled smoothly due to strong velocity.

---

## Pattern: Agent Behavior Drift Detection

**Problem:** Agent behavior degrades over time. Reviewer started rubber-stamping code instead of being adversarial.

**Solution:**
1. Monitor agent outputs for drift signals
2. Reinforce critical behaviors explicitly (not just instructionally)
3. Add behavior tests when possible

**Signals of drift:**
- Reviewer approving without substantive comments
- SM skipping handoff protocols
- Dev not running tests before declaring GREEN

**Fix:** Make the behavior explicit in agent files, not assumed.

---

## Pattern: Release Bundling

**Problem:** Sprint 2 had 8+ version bumps in 4 days. Each small fix triggered a release.

**Solution:**
- Batch related fixes into single releases
- Only release when story is fully complete
- Consider release candidate process for larger changes

**Exception:** Security fixes should release immediately.

---

## Pattern: Fix-to-Feature Ratio Monitoring

**Problem:** High fix ratio (>0.5:1) indicates integration gaps or inadequate testing.

**Solution:** Track fix commits vs feature commits per sprint.

| Ratio | Health | Interpretation |
|-------|--------|----------------|
| < 0.3:1 | 🟢 Good | Features ship clean |
| 0.3-0.5:1 | 🟡 Watch | Some reactive work |
| > 0.5:1 | 🔴 Concern | Too much fixing |

**Sprint 2+3 Result:** 1.1:1 (44 fixes / 40 features) - indicates need for pre-release testing.

---

## Pattern: Story Carryover Tracking

**Problem:** Stories that span sprints lose traceability.

**Solution:** Mark carried stories with `carried_from: sprint-N` in YAML.

```yaml
- id: "4-2"
  status: done
  carried_from: sprint-2  # Preserves history
```

**Benefits:**
- Original story IDs preserved
- Velocity reflects actual completion
- Easy to see what slipped

---

*Add process patterns discovered during orchestration below*
