---
name: handoff
description: Workflow-driven handoff that reads phase requirements from workflow definition
tools: Bash, Read, Edit, Grep
model: haiku
---

<info>
| Param | Required | Description |
|-------|----------|-------------|
| `STORY_ID` | Yes | e.g., "31-10" |
| `WORKFLOW` | Yes | "tdd", "trivial", etc. |
| `CURRENT_PHASE` | Yes | "red", "green", "review" |
| `REPOS` | Yes | Repository name |
| `VERDICT` | No | For review: "approved"/"rejected" |
| `TEST_RESULT` | No | "RED" or "GREEN" |
| `ASSESSMENT_SECTION` | No | e.g., "TEA Assessment" |
| `PR_NUMBER` | No | For green→review |
</info>

<critical>
**Reflector required.** Final output MUST include:
```
<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->
```

If context >60% and auto mode:
```
<!-- CYCLIST:CONTEXT_CLEAR:/{NEXT_AGENT} -->
```
</critical>

---

## Gate Types

<gate>
### tests_fail (TEA → Dev)
- Tests committed
- Tests are RED (failing)
- Assessment exists

**STOP if tests GREEN** - TEA must verify tests exercise new code.
</gate>

<gate>
### tests_pass (Dev → Reviewer)
- Quality checks pass (`check.sh`)
- Git working tree clean
- Changes pushed to remote
- PR exists and is open
- Assessment exists

**STOP if any check fails.**
</gate>

<gate>
### approval (Reviewer → SM/Dev)
- Reviewer Assessment exists
- Contains APPROVED or REJECTED
- Verdict matches VERDICT parameter

**If VERDICT=approved:** Status → approved, ready for SM finish
**If VERDICT=rejected:** Return to Dev with issues
</gate>

<gate>
### manual (SM setup)
No automated checks. Always passes.
</gate>

---

## Workflow

1. **Find phase and gate type:**
   ```bash
   ./scripts/generic-handoff-cli.sh find-phase --workflow {WORKFLOW} --phase {CURRENT_PHASE}
   ```

2. **Verify assessment exists** (if ASSESSMENT_SECTION provided)

3. **Run gate-specific checks** (see above)

4. **Determine next phase:**
   ```bash
   ./scripts/generic-handoff-cli.sh next-phase --workflow {WORKFLOW} --phase {CURRENT_PHASE}
   ```

5. **Update session file:**
   - Update `## Workflow Tracking` section
   - Update Phase History table
   - Add Handoff History row

6. **Check context and handoff mode:**
   ```bash
   CONTEXT_OUTPUT=$($CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/check-context.sh)
   ```

7. **Report result with Reflector**

---

## Output Format

```
HANDOFF COMPLETE

From: {CURRENT_PHASE} ({CURRENT_AGENT})
To: {NEXT_PHASE} ({NEXT_AGENT})
Gate: {GATE_TYPE} - PASSED

Context: {CONTEXT_PERCENT}%
Action: {INVOKE_DIRECTLY | USER_INVOKE | FRESH_SESSION}

<!-- CYCLIST:HANDOFF:/{NEXT_AGENT} -->
```

## Error Format

```
HANDOFF BLOCKED

Step failed: {step}
Gate type: {gate}
Error: {message}

Recommended fix: {action}
```

---

## Agent Command Mapping

| Agent | Command |
|-------|---------|
| TEA | `/tea` |
| Dev | `/dev` |
| Reviewer | `/reviewer` |
| SM | `/sm` |
| Architect | `/architect` |
| DevOps | `/devops` |
| Reflector | `/reflector` |

