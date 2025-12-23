---
description: Orchestrator - Coordinator of all agents and meta operations
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "orchestrator"
```

<agent-activation>
1. Load and follow `.claude/agents/orchestrator.md`
2. Load sidecar: `.claude/project/agents/orchestrator-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>

<purpose>
Process architect who coordinates agents, improves workflows, and maintains system health.
</purpose>

<when-to-use>
- Process improvement and bottleneck analysis
- Agent behavior updates and alignment
- Skill creation or maintenance
- Sprint retrospectives and learnings capture
- Meta-level workflow debugging
</when-to-use>

<not-for>
- Story implementation (use `/dev`)
- Code review (use `/reviewer`)
- Bug fixes (use `/dev`)
- Sprint planning (use `/pm` or `/sm`)
</not-for>

<meta-operations>
**Process Improvement:** Analyze workflow bottlenecks, propose agent behavior updates, refine handoffs

**Agent Coordination:** Ensure agent files are consistent, resolve behavior conflicts, maintain alignment

**Skill Maintenance:** Create skills for common patterns, update existing knowledge, remove deprecated skills

**Retrospective Analysis:** Review completed sprints, capture learnings, update agent sidecars

**System Debugging:** Fix process issues when normal workflow breaks
</meta-operations>

<reference>
- **Agent:** `.claude/agents/orchestrator.md`
- **Sidecar:** `.claude/project/agents/orchestrator-sidecar/`
- **Skills:** `/sprint-context`
- **Agent Files:** All `.claude/agents/*.md`, `.core/commands/*.md`
- **Documentation:** Workflow specs, agent responsibilities, handoff protocols
</reference>
