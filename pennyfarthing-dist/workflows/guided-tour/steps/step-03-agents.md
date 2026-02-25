# Step 3: Agent Activation & Workflow Basics

<step-meta>
step: 3
name: agents
workflow: guided-tour
agent: orchestrator
gate: true
next: step-04-sprint
</step-meta>

<purpose>
Introduce the agent system and workflow patterns. Agents are specialized roles (Dev, TEA, Reviewer, SM, Architect, etc.) that collaborate through phased workflows. Each agent activates with its persona and toolset.
</purpose>

<prerequisites>
- Step 2 (Themes) completed
- A theme is set (agents use theme characters)
</prerequisites>

<instructions>
1. Explain the agent model: each agent has a specific role and expertise
2. Show the available agents and their slash commands
3. Explain the workflow concept: agents hand off to each other in sequence
4. Show workflow types: phased (TDD, trivial) vs stepped (architecture, this tour)
5. Demonstrate a workflow listing with `pf workflow list`
</instructions>

<actions>
- Run: `pf workflow list` to show all available workflows
- Run: `pf workflow show tdd` to display the TDD workflow phases
- Show: agent commands table (e.g., `/dev`, `/tea`, `/reviewer`, `/sm`)
</actions>

<output>
Present the agent and workflow overview:

```markdown
## Agents & Workflows

**Agents** are specialized roles activated via slash commands:

| Command | Agent | Role |
|---------|-------|------|
| `/sm` | Scrum Master | Story setup, completion |
| `/tea` | Test Engineer | Failing tests (RED) |
| `/dev` | Developer | Implementation (GREEN) |
| `/reviewer` | Code Reviewer | Adversarial review |
| `/architect` | System Architect | Technical design |

**Workflows** define how agents collaborate:
- **TDD** (phased): SM → TEA → Dev → Reviewer → SM
- **Trivial** (phased): SM → Dev → Reviewer → SM
- **Stepped** workflows guide you through interactive steps (like this tour)
```
</output>

<gate>
## Completion Criteria
- [ ] User understands the agent role model
- [ ] User has seen the workflow list
- [ ] User understands phased vs stepped workflow types
</gate>

<collaboration-menu>
- **[C] Continue** — Proceed to sprint commands
- **[T] Try It** — Run `pf workflow list` or `pf workflow show tdd`
- **[H] Help** — Deep dive on a specific agent or workflow
- **[S] Skip** — Move to sprint management
</collaboration-menu>
