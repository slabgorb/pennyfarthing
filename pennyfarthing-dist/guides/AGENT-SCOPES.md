# Agent Permission Scopes Guide

Pennyfarthing uses a three-tier permission model to control what each agent can access and modify.

## Three-Tier Model

| Tier | Agents | Scope | Model |
|------|--------|-------|-------|
| **Strategic** | Orchestrator, PM, SM, Architect, DevOps | Full project | Opus |
| **Tactical** | Dev, TEA, Reviewer, Tech-Writer, UX | Story-focused | Opus |
| **Helper** | Subagents (testing-runner, handoffs, etc.) | Single task | Haiku |

## Strategic Agents

Strategic agents have broad project visibility and coordination responsibilities.

### Capabilities
- See entire project scope (sprint, all sessions, architecture)
- Coordinate between agents and stories
- Make cross-cutting decisions
- Modify sprint and session files

### Example: Scrum Master (SM)
```yaml
sm:
  scope: full
  permissions:
    - Read
    - Grep
    - Glob
    - Bash
    - Edit(sprint/**)
    - Edit(.session/**)
    - Write(sprint/**)
    - Write(.session/**)
    - Skill(tea)
    - Skill(dev)
    - Skill(reviewer)
```

## Tactical Agents

Tactical agents focus on the current story and have permissions scoped to their role.

### Capabilities
- See current session and shared context
- Modify files relevant to their specialty
- Spawn helper subagents for mechanical tasks
- Hand off to next agent in workflow

### Example: Developer (Dev)
```yaml
dev:
  scope: story
  permissions:
    - Read
    - Grep
    - Glob
    - Bash
    - Edit(src/**)
    - Edit(tests/**)
    - Edit(.session/**)
    - Write(src/**)
    - Write(tests/**)
    - Task(testing-runner)
    - Task(dev-handoff)
```

### Example: Test Engineer (TEA)
```yaml
tea:
  scope: story
  permissions:
    - Read
    - Grep
    - Glob
    - Bash
    - Edit(tests/**)
    - Edit(.session/**)
    - Write(tests/**)
    - Task(testing-runner)
    - Task(tea-handoff)
```

### Example: Reviewer
```yaml
reviewer:
  scope: story
  permissions:
    - Read
    - Grep
    - Glob
    - Bash                  # For git diff
    - Edit(.session/**)     # Assessment only
    - Task(reviewer-preflight)
    - Task(reviewer-handoff-*)
```

Note: Reviewer has no Edit permissions for source code - they can only read and assess.

## Helper Subagents

Helpers are Haiku-powered agents with minimal permissions for specific tasks.

### Capabilities
- Execute single mechanical task
- Limited to essential permissions
- Report results back to parent agent
- No cross-agent invocation

### Example: Testing Runner
```yaml
testing-runner:
  scope: task
  model: haiku
  permissions:
    - Read
    - Bash
    - Grep
```

### Example: Dev Handoff
```yaml
dev-handoff:
  scope: task
  model: haiku
  permissions:
    - Read
    - Bash
    - Edit(.session/**)
    - Grep
```

## Permission Pattern Reference

### Tool Permissions

| Permission | Description |
|------------|-------------|
| `Read` | Read any file |
| `Grep` | Search file contents |
| `Glob` | Find files by pattern |
| `Bash` | Execute shell commands |
| `Edit(pattern)` | Edit files matching pattern |
| `Write(pattern)` | Create files matching pattern |
| `Skill(name)` | Invoke named agent |
| `Task(type)` | Spawn subagent |

### Path Patterns

| Pattern | Matches |
|---------|---------|
| `src/**` | All files under src/ |
| `**/*.md` | All markdown files |
| `.session/**` | All session files |
| `sprint/**` | All sprint files |

### Wildcards

| Pattern | Meaning |
|---------|---------|
| `Skill(*)` | Any skill |
| `Task(sm-*)` | Any SM subagent |
| `Edit(**/*)` | Edit any file |

## Scope Inheritance

Agents inherit base permissions from their tier:

```
Strategic:  Full read access + tier-specific writes
Tactical:   Story read access + role-specific writes
Helper:     Task-specific access only
```

## Customizing Scopes

Edit `.claude/project/docs/agent-scopes.yaml` to customize:

1. **Add permissions** for project-specific needs
2. **Restrict paths** for sensitive directories
3. **Add subagents** for new automation tasks

Example: Allow Dev to edit database migrations:
```yaml
dev:
  permissions:
    - Edit(db/migrations/**)
```

## Security Considerations

- **Helpers cannot invoke other agents** - prevents privilege escalation
- **Tactical agents can only invoke their helpers** - maintains workflow
- **Only SM can invoke Dev/TEA/Reviewer** - enforces TDD flow
- **Edit permissions are path-scoped** - prevents accidental damage

## File Location

Configuration: `.claude/project/docs/agent-scopes.yaml`
Template: `pennyfarthing-dist/templates/agent-scopes.yaml.template`
