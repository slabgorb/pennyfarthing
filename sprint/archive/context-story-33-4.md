# Story 33-4: Spot Permission Grants - Technical Context

## Story Overview
- **Epic:** 33 (Runtime Permission Management)
- **Points:** 2
- **Priority:** P1
- **Repos:** pennyfarthing, cyclist
- **Jira:** TBD (will be assigned during setup)

## Current State

### Existing Infrastructure

**settings-store.ts** (`packages/cyclist/src/settings-store.ts`):
- In-memory `allowlist: string[]` for Bash command patterns
- `addToAllowlist(pattern)` - adds pattern permanently (no scope)
- `isAllowlisted(command)` - checks if command matches any pattern
- No concept of grant types or expiration

**approval-gate.ts** (`packages/cyclist/src/approval-gate.ts`):
- `requestApproval(command, toolId)` - creates pending approval promise
- `resolveApproval(toolId, approved, alwaysAllow)` - resolves with binary always/not
- `alwaysAllow` flag calls `addToAllowlist()` - no "once" or "session" option

**/permissions command** (`pennyfarthing-dist/commands/permissions.md`):
- Stores grants in `.claude/settings.local.json` under `permissions.grants`
- Grant schema: `{ tool, scope, grant_type, granted_at }`
- Three grant_type values: `once`, `session`, `always`
- **Not yet integrated** with settings-store.ts runtime checks

### Gap Analysis

| Feature | Current | Target |
|---------|---------|--------|
| Grant types | Binary (always or not) | Three scopes (once/session/always) |
| Once grants | Not supported | Single use, auto-revoke |
| Session grants | Not supported | Memory only, clear on exit |
| Always grants | Works | Persist to settings.local.json |
| UI buttons | "Approve" / "Always Allow" | "Allow Once" / "Allow Session" / "Always Allow" |

## Technical Approach

### 1. Extend settings-store.ts

Add typed grant storage:

```typescript
interface PermissionGrant {
  tool: string;
  scope: string;
  grant_type: 'once' | 'session' | 'always';
  granted_at: string;
  uses_remaining?: number;  // For 'once' grants
}

// Session grants (memory only)
const sessionGrants: PermissionGrant[] = [];

// Add grant with type
function addGrant(grant: PermissionGrant): void

// Check grant (also handles 'once' auto-revocation)
function checkGrant(tool: string, scope: string): boolean

// Clear session grants (called on exit)
function clearSessionGrants(): void
```

### 2. Extend approval-gate.ts

Update `resolveApproval` signature:

```typescript
type GrantScope = 'once' | 'session' | 'always';

function resolveApproval(
  toolId: string,
  approved: boolean,
  grantScope?: GrantScope
): void
```

### 3. Update ApprovalModal.js

Replace current buttons with three options:

```html
<!-- Current -->
<button>Approve</button>
<button>Always Allow</button>

<!-- Target -->
<button>Allow Once</button>
<button>Allow Session</button>
<button>Always Allow</button>
```

IPC message updated to include `grantScope`:

```javascript
window.api.approvalResponse({
  toolId,
  approved: true,
  grantScope: 'session'
});
```

### 4. Persist "always" grants

When `grantScope === 'always'`:
1. Add to in-memory store (immediate use)
2. Write to `.claude/settings.local.json` (persistence)

### 5. Handle "once" auto-revocation

```typescript
function checkGrant(tool: string, scope: string): boolean {
  const grant = findMatchingGrant(tool, scope);
  if (!grant) return false;

  if (grant.grant_type === 'once') {
    // Remove after check (single use)
    removeGrant(grant);
  }

  return true;
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cyclist/src/settings-store.ts` | Add PermissionGrant type, sessionGrants array, addGrant/checkGrant/clearSessionGrants |
| `packages/cyclist/src/approval-gate.ts` | Update resolveApproval to accept GrantScope, call addGrant |
| `packages/cyclist/src/public/js/components/ApprovalModal.js` | Three buttons, updated IPC payload |
| `packages/cyclist/src/main.ts` or IPC handler | Handle new grantScope in approval response |

## Acceptance Criteria

- [ ] AC1: Three grant scopes implemented (once, session, always)
- [ ] AC2: UI reflects scope selection (three buttons)
- [ ] AC3: Session grants clear on exit (memory only)
- [ ] AC4: Persistent grants survive restart (settings.local.json)

## Testing Strategy

### Unit Tests
- `settings-store.test.ts`: Grant type storage and retrieval
- `settings-store.test.ts`: "Once" grant auto-revocation
- `settings-store.test.ts`: Session grant clearing

### Integration Tests
- `approval-gate.test.ts`: Full approval flow with each grant type
- IPC round-trip with grantScope parameter

### Manual Tests
- Cyclist modal shows three buttons
- "Allow Once" works for single command then requires re-approval
- "Allow Session" persists until restart
- "Always Allow" persists across restarts

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| IPC protocol change | Backwards compatible - grantScope optional |
| settings.local.json format | Already documented in 33-1/33-2 |
| Modal button layout | Simple CSS adjustment |

## Related Context

- **Epic context:** `sprint/context/epic-33-context.md`
- **33-1 summary:** Permission protocol schema
- **33-2 summary:** /permissions skill implementation
