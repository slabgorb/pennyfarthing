---
name: permissions
description: Manage runtime permission grants - list active grants, add/revoke tool access, show grant details. Use when viewing current permissions, granting tool access, or revoking permissions.
---

# /pf-permissions - Permission Management Skill

<run>/permissions</run>
<output>List all active permission grants</output>

## Overview

Pennyfarthing uses a runtime permission system for tool access control. This skill provides commands to view and manage permission grants via the WheelHub Permissions API.

## Quick Reference

| Action | Command |
|--------|---------|
| List all grants | `/pf-permissions` |
| Grant tool access | `/pf-permissions grant <tool> "<scope>"` |
| Revoke tool access | `/pf-permissions revoke <tool>` |
| Show grant details | `/pf-permissions show <tool>` |

## Grant Types

Permissions support three duration types:

| Type | Duration | Storage |
|------|----------|---------|
| `once` | Single use | Memory only |
| `session` | Until session ends | Memory only |
| `always` | Persists forever | `~/.cyclist/grants.json` |

## List Active Grants

To see all currently active permission grants:

```bash
curl -s http://localhost:${WHEELHUB_PORT:-7173}/api/permissions | jq '.grants'
```

Output shows:
- Tool name
- Scope pattern
- Grant type
- When granted

If no grants exist, displays "No active permission grants."

## Grant Tool Access

Add a permission grant for a specific tool and scope:

```
/pf-permissions grant <tool> "<scope>" [--type <once|session|always>]
```

**Parameters:**
- `<tool>` - Tool name (e.g., `WebFetch`, `Bash`, `Read`)
- `"<scope>"` - Scope pattern in quotes (e.g., `"*.github.com"`, `"git *"`)
- `--type` - Grant duration (default: `session`)

**Examples:**

```bash
# Grant WebFetch access to GitHub
curl -s -X POST http://localhost:${WHEELHUB_PORT:-7173}/api/permissions/grant \
  -H 'Content-Type: application/json' \
  -d '{"tool":"WebFetch","scope":"*.github.com","grant_type":"session"}'

# Grant Bash git commands (always)
curl -s -X POST http://localhost:${WHEELHUB_PORT:-7173}/api/permissions/grant \
  -H 'Content-Type: application/json' \
  -d '{"tool":"Bash","scope":"git *","grant_type":"always"}'
```

**What happens:**
1. Validates the tool name and scope
2. Creates a `PermissionGrant` object with timestamp
3. Stores via settings-store (always-grants persisted to `~/.cyclist/grants.json`)
4. Reports success with grant details

## Revoke Tool Access

Remove all grants for a specific tool:

```
/pf-permissions revoke <tool>
```

**Examples:**

```bash
# Revoke all WebFetch grants
curl -s -X DELETE http://localhost:${WHEELHUB_PORT:-7173}/api/permissions/revoke/WebFetch

# Revoke a specific Bash scope
curl -s -X DELETE "http://localhost:${WHEELHUB_PORT:-7173}/api/permissions/revoke/Bash?scope=git%20*"
```

**What happens:**
1. Finds all grants matching the tool (and optional scope)
2. Removes each grant from settings-store
3. Always-grants removal triggers file persistence
4. Reports how many grants were removed

## Show Grant Details

Display detailed information about grants for a specific tool:

```
/pf-permissions show <tool>
```

```bash
curl -s http://localhost:${WHEELHUB_PORT:-7173}/api/permissions/show/Bash | jq '.grants'
```

**Output includes:**
- All grants for the specified tool
- Scope patterns
- Grant types
- Timestamps

## Storage

Grants are managed by Cyclist's settings-store:
- `once` and `session` grants live in memory only
- `always` grants are persisted to `~/.cyclist/grants.json`
- The WheelHub Permissions API at `/api/permissions` provides CRUD access

## Permission Schema

```typescript
interface PermissionGrant {
  tool: string;           // Tool name
  scope: string;          // Scope pattern
  grant_type: GrantType;  // 'once' | 'session' | 'always'
  granted_at: string;     // ISO timestamp
}
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing required field: tool" | Tool not provided | Include tool in request body |
| "Missing required field: scope" | Scope not provided | Include scope in request body |
| "Invalid grant_type" | Unknown type | Use once, session, or always |
| Connection refused | WheelHub not running | Start Cyclist first |

## Related

- **Story 33-1:** Permission Request Protocol (schema definitions)
- **Story 33-3:** Cyclist Permission UI (visual management)
- **Story 33-4:** Spot Permission Grants (inline approval)
- **Story 78-7:** Connect /permissions skill to grant store (this story)
