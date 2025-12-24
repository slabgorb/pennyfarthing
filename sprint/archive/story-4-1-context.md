# Story 4-1: Document current permissions - Technical Context

## Story Overview
- **Epic:** 4 - Configuration & Permissions Framework
- **Points:** 2
- **Priority:** P1
- **Repos:** pennyfarthing
- **Route:** SM → Dev → Reviewer (skip TEA - documentation story)

## Current State

### Pennyfarthing's Own Permissions (`.claude/settings.local.json`)

The project uses these permission patterns:

```json
"permissions": {
  "allow": [
    "Read",
    "Grep",
    "Glob",
    "Bash",
    "Edit(.claude/**)",
    "Edit(sprint/**)",
    "Edit(.session/**)",
    "Edit(conductor-api/**)",
    "Edit(conductor-ui/**)",
    "Write(.claude/**)",
    "Write(sprint/**)",
    "Write(.session/**)",
    "Skill(sm)",
    "Skill(tea)",
    "Skill(dev)",
    "Skill(reviewer)"
  ]
}
```

### Template for New Installs (`assets/templates/settings.local.json.template`)

**Issue Found:** The template does NOT include a permissions section at all. This means:
- New installations get default Claude Code permissions
- Users don't get the curated allowlist that Pennyfarthing uses internally
- The template only has `hooks` and `statusLine`

## Permission Categories Identified

| Category | Permissions | Purpose |
|----------|-------------|---------|
| **Read-Only** | `Read`, `Grep`, `Glob` | Safe codebase exploration |
| **Shell** | `Bash` | Command execution (broad) |
| **Scoped Edit** | `Edit(.claude/**)`, `Edit(sprint/**)`, `Edit(.session/**)` | Modify Pennyfarthing managed files |
| **Project Edit** | `Edit(conductor-api/**)`, `Edit(conductor-ui/**)` | Project-specific (should be templated) |
| **Scoped Write** | `Write(.claude/**)`, `Write(sprint/**)`, `Write(.session/**)` | Create files in managed dirs |
| **Skills** | `Skill(sm)`, `Skill(tea)`, `Skill(dev)`, `Skill(reviewer)` | Core workflow skills |

## Technical Approach

1. **Create `docs/PERMISSIONS.md`** documenting:
   - All permission patterns supported by Claude Code
   - Pennyfarthing's recommended permissions
   - Purpose of each permission entry
   - Security implications

2. **Update template** to include recommended permissions:
   - Add permissions section to `assets/templates/settings.local.json.template`
   - Use `${PROJECT_DIRS}` placeholder for project-specific paths
   - Document how users should customize

3. **Recommendations section** covering:
   - Minimum viable permissions
   - When to add broader permissions
   - Security best practices

## Files to Modify/Create

| File | Change |
|------|--------|
| `docs/PERMISSIONS.md` | **Create** - Full permissions documentation |
| `assets/templates/settings.local.json.template` | **Update** - Add permissions section |

## Acceptance Criteria
- [ ] PERMISSIONS.md documents all current permissions
- [ ] Each permission has clear purpose documented
- [ ] Recommendations for tightening if needed

## Dependencies & Risks

**Dependencies:**
- Knowledge of Claude Code permission syntax (documented in Claude Code docs)

**Risks:**
- **Low:** Template changes could affect new installs - test with `pennyfarthing init`
- **Low:** Overly restrictive defaults could break workflows

## Implementation Notes

The permission syntax follows patterns:
- `ToolName` - Allow tool globally
- `ToolName(pattern)` - Allow tool for paths matching glob
- `Skill(name)` - Allow specific skill invocation
- `SlashCommand(/cmd:*)` - Allow slash command patterns

Reference: Claude Code uses these in `settings.local.json` under `permissions.allow[]`
