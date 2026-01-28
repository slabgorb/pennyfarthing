# ADR-0003: Cyclist Alignment with Claude Code 2.1.0

**Status:** Superseded
**Date:** 2026-01-09
**Author:** Architect (E.B. Farnum)
**Superseded by:** ADR-0016 (Bell Mode) and ADR-0017 (Relay Mode)
**Note:** The decisions in this ADR have been implemented. Message queueing became Bell Mode (ADR-0016). Demo mode was adopted. The alignment work is complete; this ADR is now historical context.

## Context

Claude Code 2.1.0 introduced significant features that overlap with Cyclist's planned and existing functionality. As a visual terminal for Claude Code, Cyclist should align with upstream patterns where appropriate while maintaining its unique value proposition.

Key upstream additions in 2.1.0:
- Real-time steering (send messages while Claude works)
- Extended vim motions in editor
- Thinking block real-time display
- Unified backgrounding (Ctrl+B)
- Demo mode (IS_DEMO environment variable)
- Forked sub-agent context for skills
- Hooks in agent/skill frontmatter

Cyclist's Story 17-1 (Message Input Buffer) directly addresses the same problem as "real-time steering" but with a different architectural approach.

## Decision

### Alignment Strategy

We will adopt a **selective alignment** strategy:

1. **Validate our approach** where upstream confirms our direction
2. **Adopt patterns** that enhance Cyclist's value
3. **Diverge intentionally** where our UX goals differ
4. **Document differences** as deliberate choices, not limitations

### Specific Decisions

#### 1. Message Queueing vs Real-Time Steering

| Aspect | Claude Code (Steering) | Cyclist (Queue) |
|--------|------------------------|-----------------|
| Mechanism | Inject into active stream | FIFO queue after completion |
| User Experience | Immediate influence | Predictable, ordered |
| Complexity | Higher (stream manipulation) | Lower (state machine) |
| Mental Model | "Interrupt" | "Queue" |

**Decision:** Proceed with queue-based approach (Story 17-1).

**Rationale:**
- Simpler implementation and debugging
- More predictable user experience
- Aligns with visual "inbox" metaphor
- Can add steering later if needed

#### 2. Demo Mode Support

**Decision:** Adopt IS_DEMO pattern.

**Implementation:**
```javascript
// packages/cyclist/src/main.ts
const isDemoMode = process.env.IS_DEMO === 'true';
if (isDemoMode) {
  // Hide email/org from UI
  // Useful for streaming/recording
}
```

**Rationale:** Zero-cost feature that enables Cyclist demos and recordings.

#### 3. Thinking Block Display

**Decision:** Audit existing implementation.

**Action:** Verify Cyclist's thinking animation properly handles:
- Real-time streaming display
- Collapse/expand behavior
- Memory cleanup

#### 4. Background Task UI

**Decision:** Add visual backgrounding control.

**Implementation:**
- Add "Background" button alongside Stop button
- Maps to Ctrl+B functionality
- Show background task indicator in status bar

#### 5. Extended Vim Motions

**Decision:** Defer to future enhancement.

**Rationale:** TipTap editor would require significant work. Not aligned with current sprint priorities.

#### 6. Hooks in Frontmatter

**Decision:** Adopt for Cyclist personas/skills if we add custom skills.

**Rationale:** Enables lifecycle hooks scoped to Cyclist's agent workflows.

#### 7. Security Audit

**Decision:** Required audit based on upstream fixes.

**Action Items:**
| Fix | Cyclist Concern | Action |
|-----|-----------------|--------|
| Command injection | User input → bash | Audit all exec/spawn calls |
| Memory leak (tree-sitter) | Syntax highlighting? | Check if tree-sitter used |
| Sensitive data logging | Debug logs | Audit for token/key exposure |

### Feature Adoption Roadmap

| Priority | Feature | Target |
|----------|---------|--------|
| P0 | Message queue (17-1) | Current sprint |
| P1 | Demo mode (IS_DEMO) | Next sprint |
| P1 | Background task button | Next sprint |
| P2 | Security audit | Next sprint |
| P2 | Thinking block audit | Next sprint |
| P3 | Vim motions | Backlog |
| P3 | Forked skill context | Backlog |

## Consequences

### Positive

- **Validated architecture** - Upstream confirms message queuing is a legitimate approach
- **Clear roadmap** - Prioritized list of features to adopt
- **Security awareness** - Known vulnerabilities to audit against
- **Differentiation documented** - Queue vs steering is a feature, not a bug

### Negative

- **Divergence risk** - If Claude Code changes steering behavior, we may need to adapt
- **Feature gap perception** - Users familiar with Claude Code may expect steering
- **Audit effort** - Security review adds work

### Neutral

- Mental model difference is neither better nor worse, just different
- Some features (vim motions) may never be adopted and that's acceptable

## Alternatives Considered

### 1. Full Steering Implementation

**Rejected:** Would require significant IPC/stream manipulation changes. Queue approach is simpler and our tests are already written for it.

### 2. Ignore Upstream Entirely

**Rejected:** Missing opportunity to validate approach and adopt useful patterns.

### 3. Wait for Stability

**Considered:** Could wait for 2.2.0 to see if patterns stabilize. Decided against because:
- Story 17-1 is already in progress
- Demo mode and backgrounding are low-risk adoptions
- Security audit should happen regardless

## Implementation Notes

### For Story 17-1 (Message Queue)

The existing acceptance criteria and tests align with our architectural choice:
- AC1: Input active during processing ✓
- AC2: Messages queued (not steered) ✓
- AC3: Visual indicator (queue count) ✓
- AC4: FIFO delivery ✓
- AC5: Queue persistence ✓
- AC6: Clear queue option ✓

No changes needed to story scope.

### For Future Stories

Consider creating:
- **Story: Demo Mode** - IS_DEMO support (2 pts)
- **Story: Background Task Button** - Visual Ctrl+B (3 pts)
- **Story: Security Audit** - Command injection, logging review (3 pts)

## References

- [Claude Code 2.1.0 Changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#210)
- Story 17-1 Session: `.session/17-1-session.md`
- Cyclist Editor: `packages/cyclist/src/public/js/editor.js`
