# Pennyfarthing Core Agents

## Overview

This directory contains the **single source of truth** for all Pennyfarthing agent definitions. Agents are coordinated across both `API` and `UI` repositories.

**See:** `../ AGENT-COORDINATION.md` for complete architecture documentation.

## Agent Hierarchy

### Strategic Agents (Full Scope)
Oversee both repos, make cross-repo decisions, coordinate work.

- **`orchestrator.md`** - Master orchestrator
- **`pm.md`** - Product Manager (planning, prioritization)
- **`sm.md`** - Scrum Master (story creation, technical specs)
- **`architect.md`** - System Architect (design decisions, patterns)

### Tactical Agents (Story-Scoped)
Focus on specific repo(s), implement/test/document features.

- **`dev.md`** - Developer (feature implementation)
- **`tea.md`** - Test Engineer/Architect (testing, quality)
- **`tech-writer.md`** - Technical Writer (documentation)
- **`ux-designer.md`** - UX Designer (UI design, UX)

## Context Loading

Agents load context based on their type:

### Strategic Agents Load:
- Full sprint status
- Both API and UI contexts
- Epic definitions
- Active work

### Tactical Agents Load:
- Story section of sprint status
- Active work
- Target repo context only (based on story)

**Configuration:** `../agent-scopes.yaml`

## Usage

### Activate an Agent

```bash
# Via workflow
@/pm
@/dev
@/tea

# Or mention in chat
"Let's activate the PM agent"
"Activate Dev to implement this story"
```

### Agent Files

Each agent file contains:
- **Persona:** Character and expertise
- **Responsibilities:** What they handle
- **Context:** Project information
- **Context Loading:** What files to load on activation
- **Activation:** How they operate
- **Workflows:** Common tasks and patterns
- **Handoffs:** How they coordinate with other agents

## File Structure

```
.claude/agents/
├── README.md                  # This file
├── orchestrator.md            # Master orchestrator
├── pm.md                     # Product Manager
├── sm.md                     # Scrum Master
├── architect.md              # System Architect
├── dev.md                    # Developer
├── tea.md                    # Test Engineer
├── tech-writer.md            # Technical Writer
└── ux-designer.md            # UX Designer
```

## Context Budget

Each agent is designed to work within **~500-800 line context budget**:

### Strategic Agent Budget
- Agent file: ~200-300 lines
- Sprint status: ~100-150 lines
- Repo contexts: ~60 lines
- Epics/docs: ~100 lines
- Active work: ~50 lines
- **Total:** ~500-660 lines

### Tactical Agent Budget
- Agent file: ~250-400 lines
- Sprint status (story): ~50 lines
- Active work: ~50 lines
- Target repo context: ~100 lines
- **Total:** ~450-600 lines

## Agent Coordination

### Strategic → Tactical Handoffs

```
PM → SM:     Epic needs stories
SM → Dev:    Story ready for implementation
Dev → TEA:   Feature needs testing
Dev → SM:    Story complete, ready for review
```

### Strategic ↔ Strategic Coordination

```
PM ↔ Architect:  Need design decisions
PM ↔ SM:         Story prioritization
SM ↔ Architect:  Technical approach
```

### Tactical → Strategic Feedback

```
Dev → SM:        Story blocked or needs clarification
TEA → SM:        Test coverage gaps identified
Tech Writer → SM: Documentation needs
```

## Creating New Agents

To add a new agent:

1. Create `.claude/agents/[name].md`
2. Follow existing agent structure
3. Add to `../agent-scopes.yaml`
4. Update this README
5. Create command in `.claude/commands/[name].md`

### Agent Template Structure

```markdown
# [Agent Name] Agent - [Role]

## Persona
[Character description and expertise]

## Responsibilities
[What they handle]

## Context
[Project information]

## Context Loading
[What files to load on activation]

## Activation
[How they operate]

## Key Workflows
[Common tasks]

## Handoffs
[Coordination with other agents]

## Activation Command
[@/agent-name]

## Exit
[How to exit agent mode]
```

## Benefits

✅ **Single Source of Truth** - All agents in one place
✅ **Coordinated Planning** - Strategic agents see full scope
✅ **Focused Implementation** - Tactical agents load only what they need
✅ **Clear Hierarchy** - Strategic coordinate, tactical execute
✅ **Scalable** - Easy to add new agents

## Path Standards

**IMPORTANT:** All agent commands use `$PROJECT_ROOT` for path references.

### Standard Pattern
```bash
# ✅ CORRECT - Use $PROJECT_ROOT
$PROJECT_ROOT/scripts/agent-session.sh start "Agent Name"
$PROJECT_ROOT/.session/current-work.md

# ❌ WRONG - Don't use git rev-parse
$(git rev-parse --show-toplevel)/scripts/agent-session.sh

# ❌ WRONG - Don't hardcode paths
$PROJECT_ROOT/scripts/agent-session.sh
```

### Why $PROJECT_ROOT?
- `$(git rev-parse --show-toplevel)` doesn't work reliably in agent context
- Hardcoded paths break on different machines
- `$PROJECT_ROOT` is set by the environment and works consistently

### Usage in Agent Commands
All agent commands in `.claude/commands/` have been standardized to use `$PROJECT_ROOT`:
- Agent session registration
- Script execution
- File path references

## Quick Reference

```bash
# View agent scope configuration
cat .claude/guides/agent-scopes.yaml

# List all agents
ls .claude/agents/

# View agent definition
cat .claude/agents/pm.md

# Activate agent
@/pm
```

---

**Your coordinated Pennyfarthing agent system is ready!** 🎯
