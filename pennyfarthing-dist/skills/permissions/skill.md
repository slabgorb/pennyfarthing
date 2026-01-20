---
name: permissions
description: Manage runtime permission grants - list active grants, add/revoke tool access, show grant details. Use when viewing current permissions, granting tool access, or revoking permissions.
---

# Permission Management Skill

## Overview

Pennyfarthing uses a runtime permission system for tool access control. This skill provides commands to view and manage permission grants.

## Quick Reference

| Action | Command |
|--------|---------|
| List all grants | `/permissions` |
| Grant tool access | `/permissions grant <tool> "<scope>"` |
| Revoke tool access | `/permissions revoke <tool>` |
| Show grant details | `/permissions show <tool>` |

## Grant Types

Permissions support three duration types:

| Type | Duration | Storage |
|------|----------|---------|
| `once` | Single use | Memory only |
| `session` | Until session ends | Memory only |
| `always` | Persists forever | `.claude/settings.local.json` |

## List Active Grants

To see all currently active permission grants:

```bash
# Read grants from settings
cat .claude/settings.local.json 2>/dev/null | jq '.permissions.grants // []'
```

Output shows:
- Tool name
- Scope pattern
- Grant type
- When granted
- Uses remaining (for `once` type)

If no grants exist, displays "No active permission grants."

## Grant Tool Access

Add a permission grant for a specific tool and scope:

```
/permissions grant <tool> "<scope>" [--type <once|session|always>]
```

**Parameters:**
- `<tool>` - Tool name (e.g., `WebFetch`, `Bash`, `Read`)
- `"<scope>"` - Scope pattern in quotes (e.g., `"*.github.com"`, `"git *"`)
- `--type` - Grant duration (default: `session`)

**Examples:**

```bash
# Grant WebFetch access to GitHub
/permissions grant WebFetch "*.github.com"

# Grant Bash read-only git commands (session-only)
/permissions grant Bash "git status|git log|git diff"

# Grant Read access to src directory (always)
/permissions grant Read "src/**/*" --type always
```

**What happens:**
1. Validates the tool name and scope
2. Creates a `PermissionGrant` object with timestamp
3. Stores in `.claude/settings.local.json` under `permissions.grants`
4. Reports success with grant details

## Revoke Tool Access

Remove all grants for a specific tool:

```
/permissions revoke <tool>
```

**Examples:**

```bash
# Revoke all WebFetch grants
/permissions revoke WebFetch

# Revoke all Bash grants
/permissions revoke Bash
```

**What happens:**
1. Reads current grants from settings
2. Filters out grants matching the tool name
3. Writes updated grants back to settings
4. Reports how many grants were removed

## Show Grant Details

Display detailed information about grants for a specific tool:

```
/permissions show <tool>
```

**Output includes:**
- All grants for the specified tool
- Scope patterns
- Grant types
- Timestamps
- Remaining uses (for `once` type)

## Storage Format

Grants are stored in `.claude/settings.local.json`:

```json
{
  "permissions": {
    "grants": [
      {
        "tool": "WebFetch",
        "scope": "*.github.com",
        "grant_type": "session",
        "granted_at": "2026-01-13T15:00:00.000Z"
      },
      {
        "tool": "Bash",
        "scope": "git *",
        "grant_type": "always",
        "granted_at": "2026-01-13T14:30:00.000Z"
      }
    ]
  }
}
```

## Permission Schema

From `@pennyfarthing/core`:

```typescript
interface PermissionGrant {
  tool: string;           // Tool name
  scope: string;          // Scope pattern
  grant_type: GrantType;  // 'once' | 'session' | 'always'
  granted_at: string;     // ISO timestamp
  uses_remaining?: number; // For 'once' type
}
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid tool name" | Tool doesn't exist | Check available tools |
| "Invalid scope pattern" | Empty or malformed scope | Provide quoted scope string |
| "Settings file not found" | First-time use | File will be created |
| "No grants found for tool" | Tool has no active grants | Nothing to revoke |

## Related

- **Story 33-1:** Permission Request Protocol (schema definitions)
- **Story 33-3:** Cyclist Permission UI (visual management)
- **Story 33-4:** Spot Permission Grants (inline approval)
