# TEA Agent Patterns

> Pennyfarthing-specific testing patterns

## RED State Protocol

1. Read acceptance criteria from session file
2. Design test cases covering each AC
3. Write tests that FAIL (no implementation yet)
4. Verify tests fail for the right reason

## TEA Assessment Format

```markdown
## TEA Assessment
**Tests:** X failing tests written (RED state confirmed)
**Coverage:** All acceptance criteria covered
**Files:**
- api/internal/service/component_test.go (new)
- ui/src/components/Component.test.tsx (new)

Ready for Dev to implement to GREEN.
```

## Test File Placement

### Go
```
internal/service/user.go
internal/service/user_test.go
```

### React
```
src/components/User.tsx
src/components/User.test.tsx
```

---

*Add testing patterns discovered during test development below*

---

## VS Code Extension TreeDataProvider Testing

**Story:** MSSCI-12048 (VS Code Sidebar)

### BDD with Gherkin + Vitest

For VS Code extensions using BDD workflow:

1. **Write Gherkin scenarios** in `tests/features/*.feature`
   - Human-readable specification
   - One scenario per behavior
   - Tag with AC reference (e.g., `@AC1`)

2. **Implement as Vitest tests** in `tests/*.test.ts`
   - Group by AC in `describe` blocks
   - One test per scenario assertion
   - Mock VS Code API comprehensively

### VS Code TreeDataProvider Mock Pattern

```typescript
// Mock VS Code TreeItemCollapsibleState
const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

// Mock TreeItem class
class MockTreeItem {
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  collapsibleState?: number;
  command?: { command: string; arguments?: any[] };
  accessibilityInformation?: { label: string };

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
  },
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState,
  EventEmitter: vi.fn(() => ({ fire: vi.fn(), event: vi.fn() })),
}));
```

### Testing TreeDataProvider Updates

```typescript
it('should fire onDidChangeTreeData when data updates', async () => {
  const provider = new AgentStatusTreeDataProvider();
  const mockListener = vi.fn();
  provider.onDidChangeTreeData(mockListener);

  provider.updatePersona({ character: 'Test', role: 'dev' });

  expect(mockListener).toHaveBeenCalled();
});
```

### Test Count Reference

For MSSCI-12048 (3-point story, 6 ACs):
- 22 Gherkin scenarios
- 43 Vitest tests
- Ratio: ~7 tests per AC average

## TypeScript Stub Pattern (MSSCI-12081)

For tests to confirm RED state properly, create a stub implementation that compiles but throws:

```typescript
export function myFunction(args: Type): Result {
  throw new Error('myFunction not implemented');
}
```

This allows:
1. Tests to import and compile
2. Tests to fail on assertion (not import error)
3. Clear "not implemented" message in test output

## Variable Resolver Test Categories

When testing variable resolution, cover these categories:
1. **Single source resolution** - Basic replacement works
2. **Priority chain** - Higher priority wins, fallback when missing
3. **Standard variables** - System defaults (date, paths)
4. **Unresolved tracking** - Variables left as-is, tracked in result
5. **Edge cases** - Type coercion, invalid syntax, empty values, null/undefined

## Sidebar Section Testing Pattern (MSSCI-12125)

When adding new sections to VS Code TreeDataProvider:

**Test Categories:**
1. **Section visibility** - Show when data present, hide when absent
2. **Data display** - Labels, descriptions, icons correct
3. **Child items** - Detail items rendered correctly
4. **Actions** - Command handlers wired correctly
5. **Updates** - `onDidChangeTreeData` fires on state change
6. **Edge cases** - null/undefined, empty state, invalid data
7. **Accessibility** - Screen reader labels present
8. **Ordering** - Section appears in correct position

**Test Count Reference (MSSCI-12125, 3 pts, 10 ACs):**
- 40 Vitest tests
- ~4 tests per AC average
- Tests fail with `TypeError: method is not a function` when not implemented

## WebviewViewProvider Testing Pattern (MSSCI-12148)

When testing VS Code WebviewViewProvider implementations:

**Test Categories:**
1. **Provider existence** - File exists, class exports, implements interface
2. **Package.json registration** - View defined with correct id, type, name
3. **Webview options** - enableScripts, localResourceRoots configured
4. **HTML content** - Required elements present (img, character-name, etc.)
5. **Message handling** - onDidReceiveMessage wired, handlers work
6. **WheelHub integration** - connectToWheelHub, updatePersona, stat forwarding
7. **Theme support** - detectVSCodeTheme, onDidChangeActiveColorTheme subscription
8. **CSP compliance** - Content-Security-Policy, nonce generation, webview.cspSource
9. **Resource URIs** - asWebviewUri called for local resources
10. **Disposal** - dispose method cleans up subscriptions

**Mock Pattern for WebviewView:**
```typescript
class MockWebviewView {
  webview: MockWebview;
  visible = true;
  viewType = 'your.viewType';
  onDidDispose = vi.fn();
  onDidChangeVisibility = vi.fn();
  show = vi.fn();
  constructor() {
    this.webview = new MockWebview();
  }
}

class MockWebview {
  options: any = {};
  html = '';
  cspSource = 'vscode-webview:';
  onDidReceiveMessage = vi.fn((handler) => {
    this._messageHandler = handler;
    return { dispose: vi.fn() };
  });
  postMessage = vi.fn();
  asWebviewUri = vi.fn((uri: any) => ({
    toString: () => `vscode-webview://mock/${uri.fsPath}`,
    fsPath: uri.fsPath,
  }));
  private _messageHandler?: (message: any) => void;
  simulateMessage(message: any) {
    if (this._messageHandler) this._messageHandler(message);
  }
}
```

**Test Count Reference (MSSCI-12148, 3 pts, 8 ACs):**
- 49 Vitest tests
- ~6 tests per AC average
- Tests fail with `Cannot find module` when not implemented
