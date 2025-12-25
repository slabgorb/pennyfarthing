# SM Agent Decisions

> Architecture decisions and constraints for story management

## Decision Log

### DEC-SM-001: Helper-First Workflow

**Decision:** SM delegates mechanical work to Haiku helpers, focuses on decisions.

**Context:** Separation of thinking (Opus) and doing (Haiku).

**Rationale:**
- Opus better at strategic decisions
- Haiku efficient for mechanical tasks
- Reduces context pollution in main thread

**Consequences:**
- Must define clear helper prompts
- Wait for helper results before deciding
- Can't skip helper for "simple" tasks

---

### DEC-SM-002: Scale-Adaptive Routing

**Decision:** Trivial stories (1-2 pts) skip TEA, go directly to Dev.

**Context:** Not all work needs full TDD ceremony.

**Scale Matrix:**
| Points | Type | Route |
|--------|------|-------|
| 1-2 | Chore/Fix | SM → Dev |
| 3-5 | Standard | SM → TEA → Dev |
| 8+ | Complex | SM → TEA → Dev |

**Rationale:**
- Quick fixes shouldn't wait for test design
- Complex work needs test strategy
- Balance speed vs rigor

**Consequences:**
- SM must assess story complexity
- Dev writes tests for trivial stories
- Document routing decision in session

---

### DEC-SM-003: Context File Required

**Decision:** SM creates technical context file before any handoff.

**Context:** Next agent needs understanding of story scope.

**Rationale:**
- Reduces back-and-forth questions
- Documents technical approach
- Provides reference during implementation

**Consequences:**
- Additional work for SM
- Context file must be comprehensive
- Update if scope changes

---

### DEC-SM-004: Session File as Source of Truth

**Decision:** Session file is authoritative for workflow state.

**Context:** Multiple agents need to know current state.

**Rationale:**
- Single source of truth
- Survives agent restarts
- Human-readable audit trail

**Consequences:**
- Must keep session file updated
- Verify actual state matches session
- Don't trust session without verification

---

## Constraints

### C-SM-001: No Implementation
- SM sets up story, doesn't implement
- If writing code, wrong agent

### C-SM-002: User Confirms Story Selection
- Present options to user
- Wait for selection
- Don't auto-select

### C-SM-003: Context Check Before Handoff
- Check context usage before handing off
- If >70%, suggest fresh session
- Document in handoff assessment

---

*Add new decisions below as they are made*
