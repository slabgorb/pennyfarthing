# Story 38-8: Modernize Orchestrator Agent - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 38 - Agent File Modernization |
| Points | 2 |
| Priority | P2 |
| Repos | pennyfarthing |
| Workflow | `agent-docs` (SM → Orchestrator → Tech Writer) |

## Current State

**File:** `pennyfarthing-dist/agents/orchestrator.md` (123 lines)

The Orchestrator agent handles meta-level operations:
- Process improvement
- Agent coordination
- Workflow refinement
- Skill maintenance

**What's Missing:**
1. No `<reasoning-mode>` section (all modernized agents have this)
2. No Turn Efficiency guidance (parallel operations, subagent spawning)
3. Hardcoded character table at L96-109 (Discworld theme names)
4. No subagent delegation patterns (should use `testing-runner`, etc.)
5. No clear phase flow for `agent-docs` workflow participation

## Technical Approach

### 1. Add `<reasoning-mode>` Section

Pattern from `sm.md`:
```markdown
<reasoning-mode>
**Default:** Quiet mode - follow ReAct pattern internally, show only key decisions
**Toggle:** User says "verbose mode" to see explicit reasoning

When verbose, show:
THOUGHT: ...
ACTION: ...
OBSERVATION: ...
REFLECT: ...

**Orchestrator-Specific Reasoning:**
- When auditing agents: Reason about patterns, gaps, inconsistencies
- When proposing changes: Think through impact on workflows
- When delegating: Be explicit about expected outcomes
</reasoning-mode>
```

### 2. Add Turn Efficiency Patterns

```markdown
## Turn Efficiency

**Parallelize independent operations:**

| Parallel Safe | Not Parallel |
|---------------|--------------|
| Read multiple agent files | Write depends on analysis |
| Audit multiple agents simultaneously | Handoff after changes |
| Spawn testing-runner while reading | Sequential file updates |

**Batch bash commands:**
```bash
# Efficient: Check multiple files
wc -l agents/*.md && grep -l "reasoning-mode" agents/*.md
```
```

### 3. Remove Hardcoded Character References

Current L96-109 has:
```markdown
| Agent | Discworld Character |
|-------|---------------------|
| SM | Moist von Lipwig |
...
```

Replace with theme-agnostic reference:
```markdown
See `<crew>` block loaded from theme config for character mappings.
```

### 4. Add Subagent Delegation

Orchestrator should delegate mechanical work:
- `testing-runner` - Verify agent files parse, tests pass
- `sm-file-summary` - Summarize agent files for audit
- Task tool with `subagent_type: "Explore"` - Search for patterns across agents

### 5. Define `agent-docs` Workflow Participation

Orchestrator is the **implementation agent** in this workflow:
- Receives: session_file, story_context from SM
- Analyze phase: Audit files, propose changes (manual gate)
- Implement phase: Update files (validation gate)
- Hands off to: Tech Writer for quality review

## Files to Modify

| File | Changes |
|------|---------|
| `pennyfarthing-dist/agents/orchestrator.md` | Add reasoning-mode, turn efficiency, subagent delegation, remove hardcoded characters |

## Acceptance Criteria

- [ ] Orchestrator has `<reasoning-mode>` section
- [ ] Orchestrator has turn efficiency guidance
- [ ] Can audit and update agent files (clear process)
- [ ] No hardcoded theme references (use `<crew>` block)

## Testing Strategy

1. Verify file parses correctly (no broken XML tags)
2. Verify no hardcoded character names remain
3. Verify subagent patterns are documented
4. Manual review: Does the guidance make sense for agent-docs workflow?

## Dependencies & Risks

- **Dependency:** This story should be done first in Epic 38 so Orchestrator can guide remaining agent modernization
- **Risk:** Changes to Orchestrator affect how all agent-docs workflow stories are processed
- **Mitigation:** Tech Writer review gate ensures quality

## Reference Files

- Pattern source: `pennyfarthing-dist/agents/sm.md` (reasoning-mode, turn efficiency)
- Workflow definition: `pennyfarthing-dist/workflows/agent-docs.yaml`
- Current file: `pennyfarthing-dist/agents/orchestrator.md`
