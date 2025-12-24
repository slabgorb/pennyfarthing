# Pennyfarthing Permissions Guide

This document explains the permission system used in Pennyfarthing's `settings.local.json` and how to configure it for your project.

## Overview

Claude Code uses an allowlist-based permission system configured in `.claude/settings.local.json`. Pennyfarthing provides a curated set of permissions that balance agent capability with security.

## Permission Syntax

Permissions follow these patterns:

| Pattern | Example | Meaning |
|---------|---------|---------|
| `ToolName` | `Read` | Allow tool globally |
| `ToolName(glob)` | `Edit(.claude/**)` | Allow tool for matching paths |
| `Skill(name)` | `Skill(sm)` | Allow specific skill |
| `SlashCommand(/cmd:*)` | `SlashCommand(/sm:*)` | Allow slash command patterns |

## Recommended Permissions

### Core Permissions (Always Include)

These permissions are essential for Pennyfarthing to function:

```json
"permissions": {
  "allow": [
    "Read",
    "Grep",
    "Glob",
    "Bash"
  ]
}
```

| Permission | Purpose | Security Impact |
|------------|---------|-----------------|
| `Read` | Read any file in the project | Low - read-only access |
| `Grep` | Search file contents | Low - read-only search |
| `Glob` | Find files by pattern | Low - file listing only |
| `Bash` | Execute shell commands | **Medium** - can run any command |

### Pennyfarthing Managed Directories

These permissions allow agents to modify Pennyfarthing's managed files:

```json
"Edit(.claude/**)",
"Edit(sprint/**)",
"Edit(.session/**)",
"Write(.claude/**)",
"Write(sprint/**)",
"Write(.session/**)"
```

| Permission | Purpose |
|------------|---------|
| `Edit(.claude/**)` | Modify agent configs, skills, commands |
| `Edit(sprint/**)` | Update sprint YAML, context files |
| `Edit(.session/**)` | Update session state during work |
| `Write(.claude/**)` | Create new files in .claude |
| `Write(sprint/**)` | Create sprint archives, summaries |
| `Write(.session/**)` | Create session files |

### Project Source Directories

Add permissions for your project's source directories:

```json
"Edit(src/**)",
"Edit(tests/**)",
"Write(src/**)",
"Write(tests/**)"
```

**Customize these** based on your project structure. Examples:

| Project Type | Suggested Permissions |
|--------------|----------------------|
| Monorepo | `Edit(packages/**/src/**)`, `Edit(packages/**/tests/**)` |
| Go Backend | `Edit(cmd/**)`, `Edit(internal/**)`, `Edit(pkg/**)` |
| React Frontend | `Edit(src/**)`, `Edit(components/**)` |
| Full-stack | `Edit(api/**)`, `Edit(ui/**)`, `Edit(shared/**)` |

### Skill Permissions

Allow specific workflow skills:

```json
"Skill(sm)",
"Skill(tea)",
"Skill(dev)",
"Skill(reviewer)"
```

| Permission | Purpose |
|------------|---------|
| `Skill(sm)` | Scrum Master workflow |
| `Skill(tea)` | Test Engineer workflow |
| `Skill(dev)` | Developer workflow |
| `Skill(reviewer)` | Code review workflow |

## Full Example Configuration

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "Glob",
      "Bash",
      "Edit(.claude/**)",
      "Edit(sprint/**)",
      "Edit(.session/**)",
      "Edit(src/**)",
      "Edit(tests/**)",
      "Write(.claude/**)",
      "Write(sprint/**)",
      "Write(.session/**)",
      "Write(src/**)",
      "Write(tests/**)",
      "Skill(sm)",
      "Skill(tea)",
      "Skill(dev)",
      "Skill(reviewer)"
    ]
  }
}
```

## Security Recommendations

### Principle of Least Privilege

1. **Start restrictive** - Begin with minimal permissions
2. **Add as needed** - Grant additional permissions when required
3. **Scope narrowly** - Use path patterns instead of global access

### Risk Assessment

| Risk Level | Permissions | Recommendation |
|------------|-------------|----------------|
| **Low** | `Read`, `Grep`, `Glob` | Always safe to include |
| **Medium** | `Bash` | Required for git, tests, builds |
| **Medium** | `Edit(path/**)` | Scope to specific directories |
| **Higher** | `Edit` (global) | Avoid - use scoped patterns |
| **Higher** | `Write` (global) | Avoid - use scoped patterns |

### Recommended Restrictions

**DO include:**
- Scoped `Edit` and `Write` to your source directories
- Pennyfarthing managed directories (`.claude/**`, `sprint/**`, `.session/**`)
- Core workflow skills

**DON'T include:**
- Global `Edit` or `Write` without path restrictions
- Permissions to sensitive directories (`.env`, `secrets/`, etc.)
- Skills you don't use

## Tightening Permissions

If security is a priority, consider these restrictions:

### Minimal Viable Permissions

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "Glob",
      "Edit(.claude/**)",
      "Edit(sprint/**)",
      "Edit(.session/**)",
      "Write(.claude/**)",
      "Write(sprint/**)",
      "Write(.session/**)",
      "Skill(sm)"
    ]
  }
}
```

This configuration:
- Removes `Bash` (manual command execution required)
- Limits skills to SM only
- No source code modifications

### When to Expand

Add permissions when:
- Agents need to modify source code → Add `Edit(src/**)`
- Running tests/builds → Add `Bash`
- Using TDD workflow → Add `Skill(tea)`, `Skill(dev)`
- Using code review → Add `Skill(reviewer)`

## Troubleshooting

### "Permission denied" Errors

If Claude Code reports permission errors:

1. Check the error message for the tool and path
2. Add the appropriate scoped permission
3. Restart Claude Code to apply changes

### Common Issues

| Error | Solution |
|-------|----------|
| Can't edit source files | Add `Edit(your-src-dir/**)` |
| Can't create new files | Add `Write(your-src-dir/**)` |
| Can't run tests | Add `Bash` permission |
| Skill not available | Add `Skill(skill-name)` |

## Related Documentation

- [CONFIGURATION.md](./CONFIGURATION.md) - Full settings.local.json reference
- [WORKFLOWS.md](./WORKFLOWS.md) - Agent workflow documentation
- [AGENTS.md](./AGENTS.md) - Agent capabilities and roles

---

**Last Updated:** 2025-12-24
