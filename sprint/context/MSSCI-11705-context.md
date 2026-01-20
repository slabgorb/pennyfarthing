# MSSCI-11705: Runtime Permission Management - Technical Context

## Epic Overview
- **Points:** 12 (5 stories)
- **Priority:** P1
- **Marker:** UX
- **Repos:** pennyfarthing, cyclist
- **Status:** in_progress

## Problem Statement

Agents currently cannot request tool permissions at runtime. Permissions must be:
1. Pre-configured in `.claude/settings.local.json`
2. Manually granted when Claude Code prompts

This creates friction when agents need tools like `WebFetch` for research mid-story. Users must either:
- Pre-grant all possible tools (security risk)
- Manually approve each prompt (interrupts flow)

## Existing Infrastructure (What We Have)

### 1. Three-Tier Permission Model
**File:** `pennyfarthing-dist/guides/AGENT-SCOPES.md`
- Strategic agents (Orchestrator, PM, Architect): Full access
- Tactical agents (SM, TEA, Dev, Reviewer): Scoped access
- Helper agents: Minimal, task-specific access

**File:** `.claude/project/docs/agent-scopes.yaml`
- Active permission configuration per agent type
- Pattern-based `Edit()`, `Write()`, `Skill()`, `Task()` permissions

### 2. Claude Code Settings
**File:** `.claude/settings.local.json`
- `permissions.allow` array with tool patterns
- Hook configurations for PreToolUse, SessionStart, UserPromptSubmit

### 3. Bash Approval Gate (Cyclist)
**Files:**
- `packages/cyclist/src/approval-gate.ts` - IPC-based approval flow
- `packages/cyclist/src/settings-store.ts` - Allowlist persistence
- `packages/cyclist/src/public/js/components/ApprovalModal.js` - UI modal

**Pattern:** Command → Intercept → Modal → Approve/Reject → Allowlist

### 4. File Protection Hooks
**File:** `pennyfarthing-dist/scripts/hooks/pre-edit-check.sh`
- Blocks edits to `*.env`, `*.pem`, `*.key`, `*credentials*`
- Exit code 2 = block, 0 = allow

### 5. Session File Structure
**File:** `pennyfarthing-dist/guides/SESSION-ARTIFACTS.md`
- `{STORY_ID}-session.md` already tracks workflow state
- Ready for permission metadata section

## Technical Approach

### Story 33-1: Permission Request Protocol (3 pts, P0)
Define the structured format for permission requests:

```yaml
permission_request:
  tool: string        # "WebFetch", "Bash", etc.
  reason: string      # Why access is needed
  scope: string       # URL pattern, command type, file pattern
  grant_type: string  # "once" | "session" | "always"
```

**Deliverables:**
- `pennyfarthing-dist/guides/permission-protocol.md` - Protocol documentation
- TypeScript types in `packages/core/src/permissions/`

### Story 33-2: /permissions Skill (2 pts, P0)
Skill for viewing and managing permissions:

```bash
/permissions           # List active grants
/permissions grant WebFetch "*.github.com"
/permissions revoke WebFetch
```

**Deliverables:**
- `pennyfarthing-dist/skills/permissions/skill.md`
- Grant/revoke commands with scope patterns

### Story 33-3: Cyclist Permission UI (3 pts, P1)
Extend existing ApprovalModal for generic tool permissions:

**Current:** `ApprovalModal.js` handles Bash commands only
**Target:** Generic modal for any tool permission request

**Deliverables:**
- `packages/cyclist/src/public/js/components/PermissionModal.js`
- IPC extension for tool permission requests (not just Bash)

### Story 33-4: Spot Permission Grants (2 pts, P1)
Implement three grant scopes:

| Scope | Behavior |
|-------|----------|
| `once` | Single use, cleared after tool call |
| `session` | Valid until session ends |
| `always` | Persisted in settings.local.json |

**Deliverables:**
- Grant scope logic in approval flow
- UI buttons: "Allow Once", "Allow Session", "Always Allow"
- Storage: session grants in memory, always grants in settings.local.json

### Story 33-5: Permission Presets by Workflow (2 pts, P2)
Workflows declare required permissions:

```yaml
# In tdd.yaml
permissions:
  - tool: Bash
    scope: "npm test"
  - tool: WebFetch
    scope: "*.github.com"
```

**Deliverables:**
- Workflow schema extension for `permissions` field
- Auto-prompt on workflow start for missing permissions

## Integration Points

### Session File Format
Add permissions section to session files:

```markdown
## Permissions
| Tool | Scope | Grant | Granted |
|------|-------|-------|---------|
| WebFetch | github.com/* | session | 2026-01-13T10:30:00Z |
```

### Cyclist IPC Protocol
Extend `approval-gate.ts` pattern:

```typescript
// Current: Bash only
interceptBashToolUse(message: ToolUseMessage)

// Target: Generic tool permissions
interceptToolUse(message: ToolUseMessage, tool: string)
```

### Settings Persistence
```json
// .claude/settings.local.json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep"],
    "grants": {
      "WebFetch": ["*.github.com", "*.npmjs.com"],
      "Bash": ["npm *", "git *"]
    }
  }
}
```

## Story Dependency Graph

```
33-1 (Protocol) ─┬─► 33-2 (Skill)
                 │
                 ├─► 33-3 (UI) ──► 33-4 (Spot Grants)
                 │
                 └─► 33-5 (Workflow Presets)
```

All stories depend on 33-1 defining the protocol schema.

## Testing Strategy

### Unit Tests
- Schema validation (valid/invalid requests)
- Grant scope logic (once/session/always)
- Allowlist pattern matching

### Integration Tests
- IPC approval flow
- Session file permission tracking
- Settings persistence

### Manual Tests
- Cyclist modal UX
- End-to-end permission request flow

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Schema changes mid-epic | Keep 33-1 schema minimal, extend in later stories |
| Cyclist IPC complexity | Build on existing approval-gate.ts pattern |
| Grant scope confusion | Clear UI labels, documentation |

## Key Files Reference

| Category | Files |
|----------|-------|
| Existing Permissions | `.claude/project/docs/agent-scopes.yaml`, `pennyfarthing-dist/guides/AGENT-SCOPES.md` |
| Approval Gate | `packages/cyclist/src/approval-gate.ts`, `settings-store.ts` |
| UI Components | `packages/cyclist/src/public/js/components/ApprovalModal.js` |
| Session Format | `pennyfarthing-dist/guides/SESSION-ARTIFACTS.md` |
| Hooks | `pennyfarthing-dist/scripts/hooks/pre-edit-check.sh` |
