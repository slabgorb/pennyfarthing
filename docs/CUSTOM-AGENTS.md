# Custom Agent Creation Guide

Guide for creating project-specific custom agents in Pennyfarthing, including agent structure, handoff integration, command registration, and testing.

## Agent Types

Pennyfarthing uses two agent templates:

| Type | Purpose | Examples |
|------|---------|----------|
| **Tactical** | Part of TDD flow | SM, TEA, Dev, Reviewer |
| **Strategic** | Support/coordination | PM, Architect, DevOps, Tech-Writer |

Choose based on whether your agent participates in the story development cycle.

## Agent Structure

### File Locations

```
pennyfarthing-dist/
├── agents/
│   └── my-agent.md          # Agent definition
├── commands/
│   └── my-agent.md          # Slash command registration
└── guides/
    └── permission-protocol.md      # Permission request protocol
```

### Tactical Agent Template

For agents in the TDD flow (SM → TEA → Dev → Reviewer):

```markdown
# My Agent - Role Description

<persona>
Auto-loaded by `agent-session.sh start` from theme config.

**Fallback if not loaded:** Default personality description
</persona>

<role>
**Primary:** Main responsibility
**Scope:** What this agent handles
**In TDD Flow:** Where it fits (after TEA, before Reviewer, etc.)
</role>

<helpers>
From theme config. Model: haiku. Tasks: Mechanical work delegated to subagents

**Skills I Use:**
- `/testing` - Test execution
- `/dev-patterns` - Implementation patterns
</helpers>

<responsibilities>
- First responsibility
- Second responsibility
- Third responsibility
</responsibilities>

<skills>
- `/skill-name` - Description
</skills>

<context>
Context auto-loaded by `/prime --agent my-agent`:
- Shared context, shared behavior
- Agent sidecar: `.pennyfarthing/sidecars/my-agent/`
</context>

<on-activation>
1. Load sprint context
2. Check for active work
3. Assess current state
4. Present options
</on-activation>

## Workflow: [Primary Workflow]

**Input:** What triggers this workflow
**Output:** What it produces

### Steps
1. First step
2. Second step
3. Third step

## Assessment Template

```markdown
## My Agent Assessment

**Story:** {story-id}
**Date:** {date}

### Checklist
- [ ] Item one complete
- [ ] Item two complete
- [ ] Ready for handoff

**Verdict:** PASS | NEEDS_WORK | BLOCKED
```

<handoffs>
**From:**
- Previous Agent → me: Condition for receiving work

**To:**
- me → Next Agent: Condition for passing work
</handoffs>

<exit>
To exit: "Exit My Agent" or switch to another agent

On exit, run phase-check-end script to capture learnings
</exit>
```

### Strategic Agent Template

For support agents outside TDD flow:

```markdown
# My Agent - Role Description

<persona>
Auto-loaded by `agent-session.sh start` from theme config.

**Fallback if not loaded:** Default personality description
</persona>

<role>
**Primary:** Main responsibility
**Scope:** What this agent handles
</role>

<helpers>
From theme config. Model: haiku. Tasks: Mechanical work

**Skills I Use:**
- `/skill-name` - Description
</helpers>

<responsibilities>
- First responsibility
- Second responsibility
</responsibilities>

<skills>
- `/skill-name` - Description
</skills>

<constraints>
**This agent does NOT:**
- Thing it doesn't do
- Another thing it doesn't do
</constraints>

<context>
Context auto-loaded by `/prime --agent my-agent`:
- Shared context, shared behavior
- Agent sidecar: `.pennyfarthing/sidecars/my-agent/`
</context>

<on-activation>
1. Load sprint context
2. Check for active work
3. Present options
</on-activation>

## Key Workflows

### 1. First Workflow
**Input:** What triggers it
**Output:** What it produces

Steps:
1. First step
2. Second step

### 2. Second Workflow
[Similar structure]

<handoffs>
**From:**
- Other Agent → me: When and why

**To:**
- me → Other Agent: When and why
</handoffs>

<exit>
To exit: "Exit My Agent" or switch to another agent

On exit, run phase-check-end script to capture learnings
</exit>
```

## Command Registration

Create `pennyfarthing-dist/commands/my-agent.md`:

```markdown
---
description: My Agent - Brief role description
---

<agent-activation>
**FIRST:** Use Bash tool to run:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/run.sh" core/phase-check-start.sh "my-agent"
```
This finds the project root and loads your persona.

Then load and follow `.pennyfarthing/agents/my-agent.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run phase-check-end script
</agent-exit>

<purpose>
One-line description of agent purpose
</purpose>

<when-to-use>
- When to invoke this agent
- Another use case
- Third use case
</when-to-use>

<not-for>
- NOT for this (use Other Agent instead)
- NOT for that (use Another Agent instead)
</not-for>

<key-workflows>
**1. Workflow Name** - Brief description
**2. Another Workflow** - Brief description
</key-workflows>

<responsibilities>
- Responsibility one
- Responsibility two
</responsibilities>

<reference>
- **Agent:** `.pennyfarthing/agents/my-agent.md`
- **Sidecar:** `.pennyfarthing/sidecars/my-agent/`
- **Skills:** `/skill-name`
- **Handoffs:** From X, To Y
</reference>
```

## Handoff Integration

### How Handoffs Work

```
Agent 1 (Opus)
  ├── Completes work
  ├── Writes assessment to session file
  └── Spawns handoff subagent
       │
       └── Haiku subagent
           ├── Verifies preconditions
           ├── Updates session file
           └── Returns structured report
```

### Creating a Handoff Subagent

Create `pennyfarthing-dist/agents/my-agent-handoff.md`:

```markdown
---
name: my-agent-handoff
description: Transition from My Agent to next phase
tools: Bash, Read, Edit, Grep
model: haiku
---
You are a workflow handoff assistant for story {STORY_ID}.

## Handoff Details
- From: My Agent
- To: Next Agent
- Session file: .session/{STORY_ID}-session.md

## Execute Handoff Checklist

### Pre-Flight Verification
1. **Assessment exists:**
   ```bash
   grep -q "## My Agent Assessment" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```

2. **Checklist complete:**
   ```bash
   ! grep -q "\- \[ \]" $CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md
   ```

### If All Checks Pass
1. Read current session file
2. Update phase to `next-phase`
3. Mark workflow checkbox complete
4. Add handoff section with summary
5. Report: "Handoff complete. Ready for Next Agent."

## Error Recovery
If checks fail:
1. Report specific failure
2. Do NOT update session file
3. Return to calling agent for resolution
```

### Invoking Subagents

From the Opus agent:

```yaml
Task tool:
  subagent_type: "my-agent-handoff"
  description: "Handoff to next phase"
  prompt: |
    STORY_ID: 5-2
    ASSESSMENT_SUMMARY: "All items complete"
```

## Agent Scope Configuration

Add your agent to `.claude/project/docs/agent-scopes.yaml`:

```yaml
strategic_agents:
  - orchestrator
  - pm
  - sm
  - architect
  - devops
  - my-agent              # Add strategic agents here

tactical_agents:
  - dev
  - tea
  - reviewer
  - tech-writer
  - ux-designer
  - my-agent              # Or add tactical agents here
```

### Scope Tiers

| Tier | Scope | Agents |
|------|-------|--------|
| 1 - Strategic | Full project | Orchestrator, PM, SM, Architect, DevOps |
| 2 - Tactical | Story-focused | Dev, TEA, Reviewer, Tech-Writer, UX-Designer |
| 3 - Helper | Single task | Subagents (handoffs, runners) |

Strategic agents load:
- Full sprint status
- All repo contexts
- Epic definitions
- Active work

Tactical agents load:
- Story section only
- Active work
- Target repo context only

### Runtime Permissions

Agents request additional tool access at runtime using the permission protocol. See `pennyfarthing-dist/guides/permission-protocol.md` for details.

Permission requests use this format:

```yaml
permission_request:
  tool: "WebFetch"                    # Tool name
  reason: "Fetch API docs"            # Why access is needed
  scope: "*.github.com"               # What access pattern
  grant_type: "session"               # "once" | "session" | "always"
```

Common tools agents may request:
- `Read`, `Grep`, `Glob` - File operations
- `Bash` - Execute commands
- `Edit`, `Write` - File modifications
- `WebFetch` - Fetch external content
- `Skill` - Invoke skills
- `Task` - Spawn subagents

## Testing Your Agent

### 1. Verify Symlinks

```bash
# Check agent file accessible
ls -la .pennyfarthing/agents/my-agent.md

# Check command file accessible
ls -la .claude/commands/my-agent.md
```

### 2. Test Activation

```bash
# In Claude Code, invoke your agent
/my-agent
```

Verify:
- Persona loads correctly
- Agent file is read
- On-activation steps execute

### 3. Test Workflows

Execute each workflow and verify:
- Steps complete as documented
- Assessment template works
- Session file updates correctly

### 4. Test Handoffs

If your agent has handoffs:
- Verify preconditions check correctly
- Session file updates on success
- Error recovery works on failure

## Example: Security Auditor Agent

Complete example of a strategic agent:

### Agent File

`pennyfarthing-dist/agents/security-auditor.md`:

```markdown
# Security Auditor - Security & Compliance

<persona>
Auto-loaded by `agent-session.sh start` from theme config.

**Fallback if not loaded:** Security-focused analyst who seeks vulnerabilities
</persona>

<role>
**Primary:** Security auditing and vulnerability scanning
**Scope:** Code security review, dependency audits, compliance
</role>

<helpers>
From theme config. Model: haiku. Tasks: Dependency scanning, SAST analysis

**Skills I Use:**
- `/dev-patterns` - Security patterns
- `/code-review` - Analysis techniques
</helpers>

<responsibilities>
- Scan code for security vulnerabilities
- Audit dependencies for known CVEs
- Verify authentication/authorization patterns
- Check compliance with security standards
- Document security findings
</responsibilities>

<constraints>
**Security Auditor does NOT:**
- Write code (hands off to Dev)
- Run tests (TEA handles that)
- Make architecture decisions (Architect handles that)
</constraints>

<skills>
- `/dev-patterns` - Security patterns
- `/code-review` - Code analysis
</skills>

<context>
Context auto-loaded by `/prime --agent security-auditor`:
- Shared context, shared behavior
- Agent sidecar: `.pennyfarthing/sidecars/security-auditor/`
</context>

<on-activation>
1. Load sprint context
2. Check for approved stories ready for audit
3. Load recent PRs and changes
4. Present audit options
</on-activation>

## Key Workflows

### 1. Code Security Review
**Input:** Approved PR
**Output:** Security findings report

Steps:
1. Review authentication/authorization code
2. Check for injection vulnerabilities (SQL, XSS, CSRF)
3. Verify error handling doesn't leak info
4. Assess cryptography implementation
5. Document findings

### 2. Dependency Audit
**Input:** package.json, go.mod
**Output:** CVE report and remediation plan

Steps:
1. Scan dependency tree for known CVEs
2. Identify outdated packages
3. Check license compliance
4. Prioritize by severity
5. Recommend upgrades

## Security Audit Template

```markdown
## Security Audit Report

**Story:** {story-id}
**PR:** {pr-number}
**Date:** {date}

### Vulnerabilities Found
| Severity | Type | Location | Recommendation |
|----------|------|----------|----------------|

### Dependencies
| Package | Version | CVE | Action |
|---------|---------|-----|--------|

### Compliance
- [ ] Auth properly enforced
- [ ] Data encrypted
- [ ] Audit logging enabled
- [ ] Error handling safe

**Verdict:** PASS | CONDITIONAL | FAIL
```

<handoffs>
**From:**
- Reviewer → me: Code approved, ready for security audit
- SM → me: Pre-release security check needed

**To:**
- me → SM: Security audit complete, ready for release
</handoffs>

<exit>
To exit: "Exit Security Auditor" or switch to another agent

On exit, run phase-check-end script to capture learnings
</exit>
```

### Command File

`pennyfarthing-dist/commands/security-auditor.md`:

```markdown
---
description: Security Auditor - Code and dependency security auditing
---

<agent-activation>
**FIRST:** Use Bash tool to run:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/run.sh" core/phase-check-start.sh "security-auditor"
```

Then load and follow `.pennyfarthing/agents/security-auditor.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run phase-check-end script
</agent-exit>

<purpose>
Security-focused analyst who audits code, dependencies, and compliance
</purpose>

<when-to-use>
- Security code review before release
- Vulnerability scanning after development
- Dependency CVE audit
- Compliance verification
</when-to-use>

<not-for>
- NOT for functional testing (TEA handles that)
- NOT for architecture decisions (Architect handles that)
- NOT for writing code (Dev handles that)
</not-for>

<key-workflows>
**1. Code Security Review** - Scan for vulnerabilities
**2. Dependency Audit** - Check for CVEs
**3. Compliance Check** - Verify standards
</key-workflows>

<reference>
- **Agent:** `.pennyfarthing/agents/security-auditor.md`
- **Sidecar:** `.pennyfarthing/sidecars/security-auditor/`
- **Skills:** `/dev-patterns`, `/code-review`
</reference>
```

## Checklist

Before deploying your custom agent:

- [ ] Agent file follows appropriate template (tactical/strategic)
- [ ] Command file has correct activation block
- [ ] Agent added to `.claude/project/docs/agent-scopes.yaml`
- [ ] Handoff subagent created (if needed)
- [ ] Agent added to `pennyfarthing-dist/agents/README.md` inventory
- [ ] Tested activation, workflows, and handoffs
- [ ] Sidecar directory created at `.pennyfarthing/sidecars/my-agent/`

## See Also

- [Agents Reference](AGENTS.md) - Built-in agent inventory
- [Workflows](WORKFLOWS.md) - TDD flow documentation
- [Architecture](ARCHITECTURE.md) - System design
