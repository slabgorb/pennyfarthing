# Story 22-4: Dangerous Path Detection

## Story Summary
**Epic:** 22 - Verbose Mode - Tool Visibility & Intervention
**Points:** 2 | **Priority:** P2 | **Repos:** cyclist
**Layer:** 2 - Approval Gates (alongside 22-3 Bash approval)

Detect and warn when Claude attempts to modify sensitive paths regardless of tool type (Write, Edit, Bash with redirect). Trigger approval modal for user confirmation.

## Acceptance Criteria
- [ ] Sensitive path patterns defined and configurable
- [ ] Write/Edit to sensitive paths triggers warning
- [ ] Bash commands with redirects to sensitive paths detected
- [ ] User can approve or reject
- [ ] Allowlist persists for session

## Technical Context

### Architecture Position
```
Layer 3: Display Controls (22-5, 22-6)
        ↑ Optional verbosity & audit
Layer 2: Approval Gates (22-3, 22-4)  ← THIS STORY
        ↑ Pre-execution intervention
Layer 1: Activity Bar (22-1, 22-2)
        ↑ Real-time visibility & abort
```

### Dangerous Path Patterns
```javascript
const DANGEROUS_PATH_PATTERNS = [
  /^\.env(\..*)?$/,              // .env, .env.local, etc.
  /^\.git\//,                    // .git directory
  /^node_modules\//,             // dependencies
  /package-lock\.json$/,         // lockfiles
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /^~\/\.ssh\//,                 // SSH credentials
  /^~\/\.aws\//,                 // AWS credentials
  /^~\/\.config\//,              // User config
  /^\/etc\//,                    // System config
  /^\/usr\//,                    // System binaries
  /^\/var\//,                    // System data
  /^\/System\//,                 // macOS system
];
```

### Tool Coverage
| Tool | Path Source | Detection Method |
|------|-------------|------------------|
| Write | `input.file_path` | Direct extraction |
| Edit | `input.file_path` | Direct extraction |
| Bash | `input.command` | Parse for `>`, `>>`, `\|`, `tee` redirects |

### Message Flow & Interception Point
```
ClaudeService (tool_use message)
    ↓
main.ts setupClaudeIPCHandlers (L813-880)
    ↓
[22-3 Bash approval check] ← existing
    ↓
[22-4 Dangerous path check] ← ADD HERE
    ↓
broadcastToRenderer() → renderer displays
```

### Key Files to Modify

| File | Changes |
|------|---------|
| `src/settings-store.ts` | Add `getDangerousPathGate()`, `setDangerousPathGate()`, path allowlist |
| `src/dangerous-path.ts` | NEW - Path pattern matching, extraction from tools |
| `src/main.ts` | Integrate path check into message loop (after L844) |
| `src/preload.ts` | Add path approval API channels |
| `public/js/components/DangerousPathModal.js` | NEW - Approval UI component |
| `public/css/components/dangerous-path-modal.css` | NEW - Modal styling |

### Pattern from 22-3 (approval-gate.ts)
```typescript
// Template to follow for 22-4
export function interceptDangerousPath(message: SDKToolUseMessage): {
  shouldApprove: boolean;
  path: string;
  category: 'secrets' | 'git' | 'system' | 'dependencies';
  toolId: string;
} | null

export function requestPathApproval(path: string, toolId: string): Promise<boolean>

export function resolvePathApproval(toolId: string, approved: boolean, alwaysAllow: boolean): void
```

### Bash Redirect Detection
```javascript
// Parse bash commands for file redirects
const REDIRECT_PATTERNS = [
  />\s*([^\s|&;]+)/g,           // > file
  />>\s*([^\s|&;]+)/g,          // >> file (append)
  /\|\s*tee\s+(-a\s+)?([^\s|&;]+)/g,  // | tee file
  /\btee\s+(-a\s+)?([^\s|&;]+)/g,     // tee file
];

function extractBashTargetPaths(command: string): string[] {
  const paths: string[] = [];
  for (const pattern of REDIRECT_PATTERNS) {
    const matches = command.matchAll(pattern);
    for (const match of matches) {
      paths.push(match[match.length - 1]); // Last group is the path
    }
  }
  return paths;
}
```

### IPC Channels (following 22-3 pattern)
```typescript
// preload.ts additions
interface ElectronPathApprovalAPI {
  onPathApprovalRequest: (callback: (path: string, toolId: string, category: string) => void) => void;
  sendPathApprovalResponse: (toolId: string, approved: boolean, alwaysAllow: boolean) => void;
}

// Channels
'path:approval-request'   // main → renderer
'path:approval-response'  // renderer → main
```

### Safety Categories for UI Display
```javascript
const CATEGORY_LABELS = {
  secrets: { label: 'Secrets/Credentials', icon: '🔐', level: 'danger' },
  git: { label: 'Git Repository', icon: '📂', level: 'caution' },
  system: { label: 'System Path', icon: '⚠️', level: 'danger' },
  dependencies: { label: 'Dependencies', icon: '📦', level: 'caution' },
};
```

## Testing Strategy

### Unit Tests
- Path pattern matching for each category
- Bash redirect extraction (various command formats)
- Path normalization and symlink handling
- Allowlist matching

### Integration Tests
- Write to .env triggers modal
- Edit to .git/config triggers modal
- Bash `echo x > ~/.ssh/id_rsa` triggers modal
- Approved path continues execution
- Rejected path aborts/errors
- "Always Allow" adds to session allowlist

### Edge Cases
- Relative paths (./node_modules vs node_modules)
- Paths with spaces and special characters
- Symlinks pointing to dangerous locations
- Complex bash pipelines with multiple redirects

## Dependencies
- 22-3 Bash approval gate (complete) - provides pattern
- settings-store.ts infrastructure (exists)
- Electron IPC infrastructure (exists)

## Files to Reference
- `src/approval-gate.ts` (L94-126) - interceptBashToolUse pattern
- `public/js/components/ApprovalModal.js` (L228-272) - safety classification
- `src/file-browser.ts` (L45-68) - path validation patterns
- `src/main.ts` (L813-880) - message interception point
