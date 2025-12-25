# Claude Code Architecture Patterns

> PM sidecar knowledge: How Claude Code implements agentic programming

## Skills Architecture

Skills are **model-invoked** capabilities (not user-invoked). Claude autonomously decides when to use them based on description matching.

### Storage Locations
- **Personal**: `~/.claude/skills/skill-name/SKILL.md`
- **Project**: `.claude/skills/skill-name/SKILL.md`
- **Plugin**: Bundled with installed plugins

### SKILL.md Structure
```yaml
---
name: skill-name
description: Brief description of what this does and WHEN to use it
allowed-tools: Read, Grep, Glob  # Optional - restrict tool access
---

# Your Skill Name

## Instructions
Clear, step-by-step guidance for Claude.

## Examples
Concrete examples showing the Skill in action.
```

### Description Best Practices
- Include specific trigger terms users would mention
- List concrete capabilities
- Be specific about file types/domains (not generic)

---

## Hooks System

Hooks are **deterministic** shell commands at specific lifecycle points. Ensure certain actions always happen.

### Hook Events (10 Total)

| Event | When | Use Cases |
|-------|------|-----------|
| **PreToolUse** | Before tool execution | Validation, approval, input modification |
| **PostToolUse** | After tool completes | Auto-formatting, logging |
| **PermissionRequest** | Permission dialog | Auto-allow/deny based on rules |
| **UserPromptSubmit** | Before processing prompt | Validation, context injection |
| **Notification** | Claude sends notifications | Custom alerting |
| **Stop** | Claude finishes responding | Intelligent continue/stop |
| **SubagentStop** | Subagent task completes | Evaluate completion |
| **SessionStart** | Session initialization | Load context, set env vars |
| **SessionEnd** | Session cleanup | Logging, cleanup |
| **PreCompact** | Before context compaction | Pre-compact operations |

### Hook Configuration
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "your-script.sh",
        "timeout": 60
      }]
    }]
  }
}
```

### Hook Types
1. **Bash Command** (`type: "command"`): Shell scripts for deterministic rules
2. **Prompt-Based** (`type: "prompt"`): Query LLM (Haiku) for context-aware decisions

### Communication
- **Exit 0**: Success
- **Exit 2**: Blocking error (stderr shown to Claude)
- **JSON output**: Structured control

---

## Subagents/Task Tools

Subagents are pre-configured AI personalities with own context window, system prompt, and tool access.

### Benefits
- **Context Preservation**: Own context window prevents pollution
- **Specialized Expertise**: Domain-specific instructions
- **Reusability**: Shared across projects
- **Flexible Permissions**: Different tool access per subagent

### Subagent File Format
```markdown
---
name: code-reviewer
description: Expert code review. Use immediately after code changes.
tools: Read, Grep, Glob, Bash
model: inherit  # inherit|sonnet|opus|haiku
permissionMode: default
skills: skill1, skill2
---

You are a senior code reviewer ensuring high standards.
```

### Storage Locations
- **Project**: `.claude/agents/`
- **User**: `~/.claude/agents/`
- **Plugin**: Provided by plugins

### Built-in Subagents
1. **General-purpose**: Complex multi-step tasks (Sonnet, all tools)
2. **Plan**: Plan mode research (Haiku, read-only)
3. **Explore**: Fast codebase searching (Haiku, optimized)

---

## Multi-Agent Coordination Patterns

### Pattern 1: Hierarchical Delegation
```
Strategic agents (PM, Architect) - Full project scope
        ↓
Tactical agents (SM, TEA, Dev) - Story-scoped execution
        ↓
Helper agents (Haiku) - Mechanical work
```

### Pattern 2: Automatic vs Instructional
- **Automatic (script-based)**: Critical behavior, must not skip
- **Instructional (markdown-based)**: Optional, context-dependent

```bash
# Script outputs directly - agent sees without following instructions
$PROJECT_ROOT/scripts/agent-session.sh start "sm"
# <persona agent="sm" theme="discworld">
# Character: Captain Carrot Ironfoundersson
# </persona>
```

### Pattern 3: Subagent Chaining
```
Use code-analyzer subagent → then use optimizer subagent
```

### Pattern 4: Prompt-Based Hooks for Workflow Control
```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "prompt",
        "prompt": "Should Claude stop? Check if all tasks complete..."
      }]
    }]
  }
}
```

### Pattern 5: MCP Integration
- Connect to remote MCP servers
- Load MCP resources in prompts
- Pattern match: `mcp__server__tool`

---

## Permission System

### Three-Tier Model

| Tool Type | Requires Approval | "Don't ask" Duration |
|-----------|-------------------|---------------------|
| **Read-only** (Read, Grep, Glob) | No | N/A |
| **Bash Commands** | Yes (first time) | Permanent per project |
| **File Modification** (Edit, Write) | Yes | Until session end |

### Permission Rule Format
```
Tool
Tool(specifier)
```

Examples:
- `Bash(npm run test:*)` - Commands matching pattern
- `Read(~/Documents/*.pdf)` - Files matching patterns
- `Edit(/src/**/*.ts)` - Paths relative to settings
- `WebFetch(domain:github.com)` - Domain filtering
- `mcp__puppeteer__navigate` - Specific MCP tool

### Path Patterns (Gitignore Style)
```
//path          # Absolute filesystem path
~/path          # Home directory path
/path           # Relative to settings file
./path or path  # Relative to current working directory
```

### Permission Modes
- `default` - Standard prompts
- `acceptEdits` - Auto-accepts file edits
- `plan` - Can analyze, not modify
- `bypassPermissions` - Skips all prompts (safe environments only)

### Configuration Hierarchy (Precedence Order)
1. Managed settings (Claude.ai admin)
2. File-based managed settings
3. Command line arguments
4. Local project settings (`.claude/settings.local.json`)
5. Shared project settings (`.claude/settings.json`)
6. User settings (`~/.claude/settings.json`)

---

## Context Budgeting

- Agents should load 500-800 lines max
- Just-in-time loading of supporting files
- Use subagents to prevent context pollution
- Leverage Skills for modular expertise

---

## Key Documentation

- Skills: https://code.claude.com/docs/en/skills.md
- Hooks: https://code.claude.com/docs/en/hooks.md
- Subagents: https://code.claude.com/docs/en/sub-agents.md
- IAM: https://code.claude.com/docs/en/iam.md
