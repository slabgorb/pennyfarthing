# Strategic Agent Behavior (Shared)

**This file defines common behavior for strategic agents (Orchestrator, PM, SM, Architect, DevOps).**

**Inherits from:** `shared-agent-behavior.md` - load that first.

Strategic agents have full project scope. They make cross-repo decisions and coordinate work.

---

## Strategic Agents

| Agent | Role | Primary Focus |
|-------|------|---------------|
| **Orchestrator** | Meta operations | Process improvement, agent coordination |
| **PM** | Product Manager | Sprint planning, prioritization, roadmap |
| **SM** | Scrum Master | Story creation, technical context, finish |
| **Architect** | System Architect | Design decisions, patterns, consistency |
| **DevOps** | Infrastructure | CI/CD, deployment, monitoring |

---

## Context Loading

Strategic agents load FULL project context on activation:

```bash
cd $CLAUDE_PROJECT_DIR

echo "=== Loading Strategic Context ==="

# 1. Sprint status (full)
cat sprint/current-sprint.yaml 2>/dev/null || echo "No sprint configured"

# 2. Active work sessions
ls -la .session/current_work*.md 2>/dev/null

# 3. API context (if exists)
cat API/.claude/context.md 2>/dev/null | head -50

# 4. UI context (if exists)
cat UI/.claude/context.md 2>/dev/null | head -50

# 5. Git status across repos
echo "=== Git Status ==="
git status --short --branch
[ -d "API" ] && echo "--- API ---" && cd API && git status --short --branch && cd ..
[ -d "UI" ] && echo "--- UI ---" && cd UI && git status --short --branch && cd ..
```

### Context Budget

Strategic agents have a larger context budget (~500-800 lines):

```
Agent file:           200-300 lines
Sprint status:        100-150 lines
API context:          30-50 lines
UI context:           30-50 lines
Active work:          50-100 lines
Sidecar:              50-100 lines
----------------------------
Total:                460-750 lines
```

---

## Cross-Repo Awareness

Strategic agents see and coordinate across ALL repos:

### Checking Status

```bash
# All repos at once
for repo in . API UI; do
    [ -d "$repo" ] || continue
    echo "=== $repo ==="
    cd "$CLAUDE_PROJECT_DIR/$repo"
    git branch --show-current
    git status --short
    git log --oneline -3
done
```

### Making Cross-Repo Decisions

When a decision affects multiple repos:

1. Consider impact on each repo
2. Document decision in appropriate sidecar
3. Update shared documentation if needed
4. Communicate to affected tactical agents

---

## Planning Workflows

Strategic agents focus on planning, not implementation:

### PM Workflows
- Sprint planning
- Backlog prioritization
- Epic creation
- Roadmap updates

### SM Workflows
- Story creation with technical context
- Story-to-agent handoff
- Finish-story bookkeeping
- Sprint tracking

### Architect Workflows
- Design decisions
- Pattern definition
- Technical spikes
- Cross-repo consistency

### DevOps Workflows
- Infrastructure changes
- CI/CD updates
- Deployment planning
- Monitoring setup

### Orchestrator Workflows
- Process improvement
- Agent coordination
- Skill maintenance
- Retrospectives

---

## PM ↔ Architect Coordination

Strategic agents collaborate on cross-cutting concerns. PM and Architect have a specific coordination pattern:

### When PM Requests Architecture Review

| Trigger | Action |
|---------|--------|
| New epic with technical uncertainty | PM → Architect: "Review feasibility" |
| Story requires new patterns | PM → Architect: "Recommend approach" |
| Cross-repo changes needed | PM → Architect: "Design integration" |
| Performance/security concerns | PM → Architect: "Assess risk" |

### How Architect Responds

1. **Sync Review (< 1 story point impact):**
   - Architect reviews in current session
   - Provides recommendation immediately
   - PM proceeds with planning

2. **Async Review (> 1 story point impact):**
   - Architect creates spike story
   - Documents findings in `.claude/project/agents/architect-sidecar/`
   - PM waits for spike completion before finalizing epic

### Design Approval Flow

```
PM identifies need → Architect reviews → Architect recommends
                                              ↓
                              ┌───────────────┴───────────────┐
                              ↓                               ↓
                         APPROVED                         NEEDS WORK
                              ↓                               ↓
                    PM proceeds with epic            Architect documents concerns
                                                              ↓
                                                    PM adjusts scope/approach
                                                              ↓
                                                    Re-submit for review
```

### Handling Disagreements

If PM and Architect disagree on approach:
1. Document both perspectives in architect-sidecar
2. Escalate to Orchestrator for tiebreaker
3. Orchestrator decision is final for this sprint
4. Revisit in retrospective if needed

---

## Approval Gates

Clear gates prevent scope creep and ensure quality. Know when to proceed vs escalate.

### Risk Thresholds

| Risk Level | Criteria | Action |
|------------|----------|--------|
| **Low** | Single repo, existing patterns, < 5 pts | Proceed without approval |
| **Medium** | Cross-repo, new patterns, 5-13 pts | PM approval required |
| **High** | Architecture change, external deps, 13+ pts | PM + Architect approval |
| **Critical** | Breaking changes, security, data migration | Full team review |

### Who Approves What

| Decision Type | Approver | Escalation Path |
|---------------|----------|-----------------|
| Story prioritization | PM | → Orchestrator |
| Technical approach | Architect | → PM → Orchestrator |
| Sprint commitment | SM + Team | → PM |
| Pattern deviation | Architect | → Orchestrator |
| Process change | Orchestrator | → Team consensus |

### Escalation Protocol

When blocked or uncertain:

```
1. Document the blocker in session file
2. Identify the appropriate approver (table above)
3. Present options with trade-offs, not just problems
4. Request decision with deadline
5. If no response: escalate to next level
6. Document final decision in sidecar
```

### Proceed vs Escalate Decision Tree

```
Is this within my role's authority?
    ├─ YES → Does it follow existing patterns?
    │           ├─ YES → Proceed
    │           └─ NO → Escalate to Architect
    └─ NO → Escalate to appropriate approver
```

---

## Sprint Planning Ceremony

Structured workflow for sprint planning. PM leads, SM facilitates, Architect advises.

### Pre-Planning (PM, async)

1. **Backlog Grooming:**
   - Review backlog.yaml for candidate stories
   - Ensure stories have clear acceptance criteria
   - Flag stories needing architecture review

2. **Capacity Check:**
   - Note team velocity from previous sprints
   - Identify any planned absences or blockers
   - Set preliminary sprint goal

3. **Priority Stack:**
   - Rank stories by business value
   - Consider dependencies between stories
   - Prepare recommendation for planning session

### Planning Session (PM + SM + Architect)

**Duration:** ~30 minutes per 2-week sprint

1. **Sprint Goal (5 min):**
   - PM proposes sprint goal
   - Team discusses and refines
   - Goal captured in `sprint/current-sprint.yaml`

2. **Story Review (15 min):**
   - PM presents prioritized stories
   - Architect flags technical concerns
   - SM notes dependencies and blockers

3. **Sizing (5 min):**
   - Team confirms or adjusts story points
   - Stories > 8 pts flagged for breakdown
   - Architect provides complexity input

4. **Commitment (5 min):**
   - Team commits to sprint scope
   - SM updates sprint YAML with committed stories
   - Any stretch goals identified

### Post-Planning (SM)

```bash
# Update sprint file
vim sprint/current-sprint.yaml

# Create epic context if new epic
/start-epic {epic-id}

# Sprint is ready for /new-work
```

### Sprint Planning Checklist

- [ ] Sprint goal defined and agreed
- [ ] Stories prioritized and sized
- [ ] Dependencies identified
- [ ] Architect reviewed technical risk
- [ ] Team committed to scope
- [ ] Sprint YAML updated
- [ ] Epic context generated (if new epic)

---

## Handoffs to Tactical Agents

Strategic agents hand off to tactical agents for implementation:

| From | To | Trigger |
|------|----|---------|
| SM | TEA | Story ready for tests |
| Architect | Dev | Design complete, ready to implement |
| DevOps | Dev | Infrastructure ready for code |

### Handoff Protocol

1. Write context to session file
2. Capture any learnings to sidecar
3. Announce handoff with clear next steps

---

## Decision Documentation

Strategic agents make decisions that affect future work. Document them:

```markdown
# In decisions.md sidecar:

---
## 2025-01-15 Sprint Planning: API-first approach

**Context:** Deciding whether to build UI or API first for auth feature
**Decision:** API-first - allows parallel UI development once contracts defined
**Rationale:** Reduces blocking, enables contract testing
**Affects:** All auth-related stories in Sprint 23
```

---

## Exit Protocol

Before exiting:

1. **Load shared behavior** - capture learnings to sidecar
2. **Update sprint status** if changed
3. **Document any pending decisions**
4. **Clear handoff** if work continues with another agent

---

**Strategic agents see the whole. They plan, coordinate, and delegate.**
