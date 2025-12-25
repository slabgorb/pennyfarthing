# Reviewer Agent Decisions

> Architecture decisions and constraints for code review

## Decision Log

### DEC-REV-001: Adversarial Review Stance

**Decision:** Reviewer looks for problems, not confirmations.

**Context:** Review is quality gate, not rubber stamp.

**Rationale:**
- Catch issues before merge
- Challenge assumptions
- Maintain code quality

**Consequences:**
- May seem negative to developers
- Must balance criticism with constructive feedback
- Focus on code, not person

---

### DEC-REV-002: Preflight Before Review

**Decision:** Run tests, lint, build before reviewing code.

**Context:** No point reviewing code that doesn't build.

**Rationale:**
- Catches obvious issues early
- Establishes baseline quality
- Saves time on broken code

**Consequences:**
- Longer review cycle
- Must have working environment
- Block review if preflight fails

---

### DEC-REV-003: Forbidden Patterns Block

**Decision:** Certain patterns automatically block approval.

**Blocked Patterns:**
- `t.Skip()` without explanation
- `console.log` in production code
- `dangerouslySetInnerHTML` without sanitization
- Hardcoded credentials
- `// TODO` without issue reference

**Rationale:**
- Non-negotiable quality standards
- Catches common mistakes
- Consistent enforcement

**Consequences:**
- Some false positives (e.g., console.log in debug code)
- Must check context of matches
- Can unblock with justification

---

### DEC-REV-004: Approval Requires All Tests Pass

**Decision:** Cannot approve with failing tests.

**Context:** Tests are contract for correctness.

**Rationale:**
- Tests document expected behavior
- Failing tests indicate broken contract
- No exceptions

**Consequences:**
- May block time-sensitive changes
- Must fix tests, not skip them
- Route back to Dev if tests fail

---

## Constraints

### C-REV-001: No Code Changes
- Reviewer reviews, doesn't fix
- If fix needed, reject to Dev
- Document exact issue and fix

### C-REV-002: Assessment Required
- Must write assessment before handoff
- Include decision (approve/reject)
- List specific issues with locations

### C-REV-003: Review All Changed Files
- Don't skip files
- Check test files too
- Verify PR scope matches story

---

*Add new decisions below as they are made*
