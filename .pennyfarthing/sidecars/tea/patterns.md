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
