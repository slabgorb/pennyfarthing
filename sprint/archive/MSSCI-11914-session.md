# Story MSSCI-11914: Respect handoff mode preference (manual/auto)

## Story Overview
- **Epic:** MSSCI-11599 (Customizable Workflow Engine)
- **Points:** 2
- **Priority:** P2
- **Repos:** pennyfarthing
- **Workflow:** trivial (SM → Dev → Reviewer)

## Current State

The agent handoff sections currently have hardcoded "MANDATORY" auto-invoke behavior that ignores the user's `handoff_mode` preference in Cyclist settings.

**Problem locations in agent files:**

1. **sm.md** (lines ~476-486):
   ```markdown
   | < 60% | **MANDATORY: Use the Skill tool to invoke next agent NOW.** Do not ask the user. |
   ```

2. **tea.md** (lines ~varies):
   ```markdown
   **If < 60%:** **MANDATORY: Use the Skill tool to invoke `/dev` NOW.** Do not ask the user
   ```

3. **dev.md** (lines ~varies):
   ```markdown
   **If < 60%:** **MANDATORY: Use the Skill tool to invoke `/reviewer` NOW.** Do not ask the user
   ```

4. **reviewer.md** (lines ~varies):
   Similar hardcoded auto-invoke pattern.

**Correct behavior exists in:**
- `generic-handoff.md` - Already reads `handoff_mode` from settings and respects it
- Contains full decision matrix for context × mode combinations

## Technical Approach

Update each main agent file's "Context-Aware Handoff" section to:
1. Check handoff mode before deciding to auto-invoke
2. In manual mode: emit CYCLIST:HANDOFF marker but wait for user
3. In auto mode: keep current auto-invoke behavior (< 60%)
4. Reference generic-handoff.md's decision matrix as canonical source

**Pattern to implement (from generic-handoff.md):**

| Context | Mode | Action |
|---------|------|--------|
| OK (<60%) | auto | Invoke next agent directly |
| OK (<60%) | manual | Report ready, user invokes next agent |
| HIGH (>=60%) | auto | Emit CONTEXT_CLEAR marker (triggers auto-reload) |
| HIGH (>=60%) | manual | Report: "Context high. Start fresh with /{next_agent}" |

## Files to Modify

| File | Change |
|------|--------|
| `pennyfarthing-dist/agents/sm.md` | Update Context-Aware Handoff section |
| `pennyfarthing-dist/agents/tea.md` | Update Context-Aware Handoff section |
| `pennyfarthing-dist/agents/dev.md` | Update Context-Aware Handoff section |
| `pennyfarthing-dist/agents/reviewer.md` | Update Context-Aware Handoff section |

## Acceptance Criteria

- [ ] AC1: Agent handoff sections check handoff mode before auto-invoking
- [ ] AC2: Manual mode shows CYCLIST:HANDOFF marker but waits for user
- [ ] AC3: Auto mode continues current behavior (invoke when < 60%)
- [ ] AC4: Mode preference read from Cyclist settings or session flag

## Implementation Notes

1. The settings file location is `~/.cyclist/settings.yaml` (user) or `.claude/cyclist.local.yaml` (project)
2. Default handoff_mode is 'manual' per settings.ts:89
3. Legacy format `auto_handoff: true/false` should still be supported (already handled in generic-handoff.md)
4. All 4 agent files need the same update pattern for consistency

## Testing Strategy

Manual verification:
1. Set `handoff_mode: manual` → verify agents show marker but don't auto-invoke
2. Set `handoff_mode: auto` → verify agents auto-invoke when context < 60%
3. Test with no setting → should default to manual

---

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/agents/sm.md` - Updated Context-Aware Handoff with decision matrix
- `pennyfarthing-dist/agents/tea.md` - Updated Context-Aware Handoff with decision matrix
- `pennyfarthing-dist/agents/dev.md` - Updated Context-Aware Handoff with decision matrix
- `pennyfarthing-dist/agents/reviewer.md` - Updated Context-Aware Handoff with decision matrix (includes verdict column)

**Tests:** N/A (documentation change - trivial workflow)
**PR:** #332 - feat(MSSCI-11914): Respect handoff mode preference
**Branch:** feat/MSSCI-11914-respect-handoff-mode (pushed)

**Self-Review:**
- [x] All 4 agent files updated with consistent pattern
- [x] Decision matrix matches generic-handoff.md canonical implementation
- [x] Manual mode: emit marker, wait for user
- [x] Auto mode: invoke directly when context < 60%
- [x] High context + auto: emit CONTEXT_CLEAR marker
- [x] All acceptance criteria addressed

**Handoff:** To Queequeg (Reviewer) for code review

---

## Reviewer Assessment

**PR:** #332
**Verdict:** APPROVED

**Review Evidence:**

1. **Pattern Consistency:** All 4 agent files (sm.md, tea.md, dev.md, reviewer.md) have identical decision matrix structure with Context/Mode/Action columns. Reviewer.md correctly includes additional Verdict column for dual-path handoff.

2. **Canonical Source Alignment:** Verified decision matrix matches `generic-handoff.md:329-334`:
   - `< 60% | auto` → Invoke next agent
   - `< 60% | manual` → Report ready, wait for user
   - `>= 60% | auto` → CONTEXT_CLEAR marker
   - `>= 60% | manual` → Tell user to start fresh

3. **Settings Reference:** All files reference `~/.cyclist/settings.yaml → workflow.handoff_mode: auto|manual` with default `manual`.

4. **Threshold Fix:** Changed `> 60%` to `>= 60%` across all files, matching canonical source.

5. **CONTEXT_CLEAR Markers:** Each file includes agent-specific marker (`/dev`, `/reviewer`, `/sm`).

**Acceptance Criteria:**
- [x] AC1: Handoff sections check handoff mode
- [x] AC2: Manual mode emits marker, waits
- [x] AC3: Auto mode invokes directly
- [x] AC4: Mode read from Cyclist settings

**No Issues Found:** Documentation-only change with consistent pattern application.

**Handoff:** To Starbuck (SM) for finish-story workflow

---

## Workflow Tracking

**Workflow:** trivial
**Phase:** approved
**Phase Started:** 2026-01-18T13:20:00Z

- [x] setup - SM prepared story context
- [x] implement - Dev implements changes
- [x] review - Reviewer approves

---

**Status:** Approved
**Phase:** approved
**Assigned:** Keith Avery
**Jira:** MSSCI-11914
**Branch:** feat/MSSCI-11914-respect-handoff-mode
**PR:** #332
