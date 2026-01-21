# Epic 53: VS Code Extension UX/UI Pass - Technical Context

## Epic Overview

Polish the VS Code extension shipped in Epic 52. Focus on clearer onboarding, full skills/commands/workflows integration, improved chat UX, and visual polish.

**Priority:** P1
**Repos:** pennyfarthing (packages/vscode-extension)
**Stories:** 8 (18 total points)

## Technical Landscape

### Existing Extension Architecture

The VS Code extension follows established VS Code patterns:

| Component | Implementation | Location |
|-----------|----------------|----------|
| Activation | Lazy module loading | `src/extension.ts` |
| Sidebar | TreeDataProvider | `src/providers/sidebar.ts` |
| Webviews | WebviewViewProvider | `src/providers/cyclist-webview.ts` |
| Commands | Command registry | `src/commands/command-registry.ts` |
| Chat | Chat participant API | `src/chat/chat-participant.ts` |
| Server | WheelHub adapter | `src/server/wheelhub-adapter.ts` |

### Key Patterns

**Webview Implementation:**
- CSP-compliant with nonce-based security
- Message passing via `postMessage()`/`onDidReceiveMessage()`
- State persistence via `vscode.getState()/setState()`
- Theme integration via VS Code CSS variables
- External JS/CSS files (no inline scripts/styles)

**Sidebar Tree View:**
- `AgentStatusTreeDataProvider` extends `TreeDataProvider<SidebarTreeItem>`
- Hierarchical items: Agent → Sprint → Story → Actions
- Real-time updates via WheelHub WebSocket connection
- Event-driven refresh via `_onDidChangeTreeData`

**Command Registration:**
- Skills parsed from workspace YAML registry
- QuickPick UI with category grouping
- Commands execute via terminal integration

### Key Files

| File | Purpose |
|------|---------|
| `packages/vscode-extension/package.json` | Contributes: views, commands, menus, chat participant |
| `src/extension.ts` | Activation and module loading |
| `src/providers/sidebar.ts` | Agent status tree view |
| `src/providers/cyclist-webview.ts` | Cyclist panel webview |
| `src/webview/cyclist-adapter.js` | Webview frontend JavaScript |
| `src/webview/styles.css` | Webview styles (CSP-compliant) |
| `src/commands/command-registry.ts` | Skill command registration |

### Testing Patterns

Tests follow BDD naming: `tests/MSSCI-*-*.test.ts`
- Mock WebviewView and Webview objects
- Test HTML generation with CSP compliance
- Test message handling round-trips
- Test state persistence

## Dependencies

- VS Code API: `vscode.WebviewViewProvider`, `vscode.TreeDataProvider`
- WheelHub server for real-time updates
- Pennyfarthing skill registry for command discovery

## Implementation Patterns

### Adding a New Webview

1. Create provider class implementing `WebviewViewProvider`
2. Register view in `package.json` under `contributes.views.pennyfarthing`
3. Register provider in `extension.ts`
4. Create webview adapter JS and CSS files
5. Implement message passing protocol

### Adding Sidebar Sections

1. Add new tree item type to `TreeItemType`
2. Implement in `getChildren()` router
3. Add update method and connect to WheelHub channel
4. Test with mock WebSocket messages

### CSP Compliance Checklist

- [ ] Generate nonce per webview render
- [ ] Include nonce in CSP header
- [ ] Add nonce attribute to all `<script>` and `<style>` tags
- [ ] Use `webview.asWebviewUri()` for local resources
- [ ] No inline scripts or styles
