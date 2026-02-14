# Permission Request Protocol

Defines how agents request runtime permissions and how grants are managed.

## Overview

Agents may need tool access that wasn't pre-configured. This protocol provides:
1. Structured format for permission requests
2. Grant types with different lifetimes
3. Integration points for UI prompts and persistence

## Permission Request Schema

```yaml
permission_request:
  tool: string        # Tool name (WebFetch, Bash, Read, Write, etc.)
  reason: string      # Human-readable explanation of why access is needed
  scope: string       # Scope pattern (URL pattern, command pattern, file glob)
  grant_type: string  # "once" | "session" | "always"
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `tool` | string | Claude Code tool name | `"WebFetch"`, `"Bash"` |
| `reason` | string | Why access is needed | `"Fetch API docs from GitHub"` |
| `scope` | string | What access is needed | `"*.github.com"`, `"npm test"` |
| `grant_type` | string | How long grant lasts | `"once"`, `"session"`, `"always"` |

### Grant Types

| Type | Behavior | Storage | Use Case |
|------|----------|---------|----------|
| `once` | Single use, cleared after tool call | Memory | One-time operations |
| `session` | Valid until session ends | Memory | Repeated access during story |
| `always` | Persisted across sessions | `settings.local.json` | Trusted patterns |

## Validation Rules

All fields are required and must be non-empty strings. Grant type must be exactly one of: `once`, `session`, `always`.

### Valid Request Example

```json
{
  "tool": "WebFetch",
  "reason": "Fetch React documentation for component implementation",
  "scope": "*.reactjs.org",
  "grant_type": "session"
}
```

### Invalid Request Examples

```json
// Missing required field
{ "tool": "WebFetch", "reason": "Need docs" }

// Invalid grant_type
{ "tool": "Bash", "reason": "Run tests", "scope": "npm", "grant_type": "forever" }

// Empty string
{ "tool": "", "reason": "Access", "scope": "*", "grant_type": "once" }
```

## Permission Grant Structure

When a request is approved, a grant is created:

```yaml
permission_grant:
  tool: string          # Tool name from request
  scope: string         # Scope pattern from request
  grant_type: string    # Grant type from request
  granted_at: string    # ISO timestamp when granted
  uses_remaining: number # Only for "once" type (starts at 1)
```

### Grant Lifecycle

```
Request → Validate → Prompt User → Create Grant → Tool Executes → Check/Decrement
```

For `once` grants:
1. Grant created with `uses_remaining: 1`
2. Tool executes successfully
3. `uses_remaining` decremented to 0
4. Grant expired, removed from cache

For `session` and `always` grants:
- No use limit, valid until session ends or revoked

## Integration Points

### TypeScript Types

Import from `@pennyfarthing/core`:

```typescript
import {
  validatePermissionRequest,
  createGrant,
  type PermissionRequest,
  type PermissionGrant,
  type GrantType,
  VALID_GRANT_TYPES,
} from '@pennyfarthing/core/permissions';
```

### Session File Tracking

Session files can track active grants:

```markdown
## Permissions
| Tool | Scope | Grant | Granted |
|------|-------|-------|---------|
| WebFetch | *.github.com | session | 2026-01-13T10:30:00Z |
| Bash | npm test | once | 2026-01-13T10:31:00Z |
```

### Settings Persistence

`always` grants persist in `.claude/settings.local.json`:

```json
{
  "permissions": {
    "grants": {
      "WebFetch": ["*.github.com", "*.npmjs.com"],
      "Bash": ["npm *", "git *"]
    }
  }
}
```

## Request Flow

```
┌─────────────────┐
│  Agent needs    │
│  tool access    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create request  │
│ with protocol   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Invalid
│   Validate      │────────────► Reject
│   request       │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐     Denied
│  Prompt user    │────────────► Block tool
│  for approval   │
└────────┬────────┘
         │ Approved
         ▼
┌─────────────────┐
│  Create grant   │
│  per grant_type │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tool executes  │
│  (grant cached) │
└─────────────────┘
```

## Related Stories

- **33-2**: `/pf-permissions` skill for viewing and managing grants
- **33-3**: Cyclist UI for permission prompts
- **33-4**: Spot permission grants (once/session/always implementation)
- **33-5**: Workflow permission presets

## See Also

- `AGENT-SCOPES.md` - Agent permission tiers
- `.claude/project/docs/agent-scopes.yaml` - Active scope configuration
