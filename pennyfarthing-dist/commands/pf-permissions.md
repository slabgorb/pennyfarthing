---
description: View and manage runtime permission grants - list, grant, revoke, or show details
---

# Permission Management

Manage runtime permission grants for tool access control.

## Usage

```
/permissions              # List all active grants
/permissions grant <tool> "<scope>" [--type <type>]  # Add permission
/permissions revoke <tool>  # Remove all grants for tool
/permissions show <tool>    # Show details for tool
```

## Subcommands

### List Grants (default)

When invoked without arguments, list all active permission grants:

```bash
# Read grants from settings
cat .claude/settings.local.json 2>/dev/null | jq -r '
  if .permissions.grants then
    .permissions.grants[] |
    "  \(.tool): \(.scope) [\(.grant_type)] - granted \(.granted_at)"
  else
    empty
  end
' || echo "No grants found"
```

**Output format:**
```
Active Permission Grants:
  WebFetch: *.github.com [session] - granted 2026-01-13T15:00:00Z
  Bash: git * [always] - granted 2026-01-13T14:30:00Z
```

If no grants exist, display: "No active permission grants."

### Grant Tool Access

Add a permission grant:

```
/permissions grant <tool> "<scope>" [--type <once|session|always>]
```

**Parameters:**
- `<tool>` - Tool name (WebFetch, Bash, Read, Edit, Write, Grep, Glob, etc.)
- `"<scope>"` - Scope pattern in quotes (e.g., `"*.github.com"`, `"git *"`)
- `--type` - Grant duration: `once`, `session` (default), or `always`

**Implementation:**

1. Validate tool name is a known Claude Code tool
2. Create grant object with timestamp:
   ```json
   {
     "tool": "<tool>",
     "scope": "<scope>",
     "grant_type": "<type>",
     "granted_at": "<ISO timestamp>"
   }
   ```
3. Read existing settings, append to `permissions.grants` array
4. Write updated settings back to `.claude/settings.local.json`
5. Report success

**Example:**
```bash
# Create/update grant
jq --arg tool "WebFetch" \
   --arg scope "*.github.com" \
   --arg type "session" \
   --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.permissions.grants += [{"tool": $tool, "scope": $scope, "grant_type": $type, "granted_at": $time}]' \
   .claude/settings.local.json > .claude/settings.local.json.tmp \
   && mv .claude/settings.local.json.tmp .claude/settings.local.json
```

### Revoke Tool Access

Remove all grants for a specific tool:

```
/permissions revoke <tool>
```

**Implementation:**

1. Read current grants from settings
2. Filter out grants matching the tool name
3. Write updated grants back
4. Report how many grants were removed

**Example:**
```bash
# Remove grants for tool
jq --arg tool "WebFetch" \
   '.permissions.grants = (.permissions.grants // [] | map(select(.tool != $tool)))' \
   .claude/settings.local.json > .claude/settings.local.json.tmp \
   && mv .claude/settings.local.json.tmp .claude/settings.local.json
```

### Show Grant Details

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

**Example:**
```bash
cat .claude/settings.local.json | jq --arg tool "WebFetch" '
  .permissions.grants // [] | map(select(.tool == $tool))
'
```

## Grant Types

| Type | Duration | Persistence |
|------|----------|-------------|
| `once` | Single use, then removed | Memory only |
| `session` | Until conversation ends | Memory only |
| `always` | Persists forever | `.claude/settings.local.json` |

## Storage

Grants are stored in `.claude/settings.local.json` under `permissions.grants`:

```json
{
  "permissions": {
    "allow": ["Read", "Bash", ...],
    "grants": [
      {
        "tool": "WebFetch",
        "scope": "*.github.com",
        "grant_type": "session",
        "granted_at": "2026-01-13T15:00:00Z"
      }
    ]
  }
}
```

## Valid Tool Names

- `Read`, `Write`, `Edit`
- `Bash`
- `Glob`, `Grep`
- `WebFetch`, `WebSearch`
- `Task`
- `Skill`
- `NotebookEdit`

## Examples

```bash
# List all grants
/permissions

# Grant WebFetch access to GitHub (session-scoped)
/permissions grant WebFetch "*.github.com"

# Grant Bash access to git commands (permanent)
/permissions grant Bash "git *" --type always

# Show all WebFetch grants
/permissions show WebFetch

# Revoke all Bash grants
/permissions revoke Bash
```

## Reference

- **Skill:** `.claude/skills/permissions/skill.md`
- **Settings:** `.claude/settings.local.json`
- **Related:** Story 33-1 (Permission Request Protocol), Story 33-3 (Cyclist Permission UI)
