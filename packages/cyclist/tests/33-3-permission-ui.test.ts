/**
 * 33-3: Cyclist Permission UI
 *
 * Tests for generic permission approval modal that handles ANY tool,
 * not just Bash commands. Extends the existing ApprovalModal to be tool-agnostic.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Modal displays on permission request (any tool, not just Bash)
 * - AC2: One-click approve/deny buttons (inherited from 22-3)
 * - AC3: Shows tool name and reason for request
 * - AC4: Status indicator in UI (shows pending permission requests)
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// SDK message types matching claude-service.ts
interface SDKToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: Record<string, unknown>;
}

// Factory functions for various tool types
const createToolUse = (
  toolName: string,
  input: Record<string, unknown>,
  toolId?: string
): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: toolName,
  tool_id: toolId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input,
});

const createBashToolUse = (command: string, toolId?: string) =>
  createToolUse('Bash', { command }, toolId);

const createWebFetchToolUse = (url: string, prompt: string, toolId?: string) =>
  createToolUse('WebFetch', { url, prompt }, toolId);

const createEditToolUse = (filePath: string, oldString: string, newString: string, toolId?: string) =>
  createToolUse('Edit', { file_path: filePath, old_string: oldString, new_string: newString }, toolId);

const createWriteToolUse = (filePath: string, content: string, toolId?: string) =>
  createToolUse('Write', { file_path: filePath, content }, toolId);

// =============================================================================
// AC1: Modal displays on permission request (any tool, not just Bash)
// =============================================================================
describe('AC1: Modal displays on permission request (any tool)', () => {
  let html: string;
  let document: Document;

  beforeAll(async () => {
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    const window = new Window();
    window.document.write(html);
    document = window.document;
  });

  beforeEach(async () => {
    vi.resetModules();
  });

  describe('Generic tool detection', () => {
    it('should export isToolUseMessage function for any tool type', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.isToolUseMessage).toBeDefined();
      expect(typeof approvalModal.isToolUseMessage).toBe('function');
    });

    it('should detect WebFetch tool_use messages', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const webFetchMsg = createWebFetchToolUse('https://api.example.com', 'Get data');
      expect(approvalModal.isToolUseMessage(webFetchMsg)).toBe(true);
    });

    it('should detect Edit tool_use messages', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const editMsg = createEditToolUse('/path/to/file.ts', 'old', 'new');
      expect(approvalModal.isToolUseMessage(editMsg)).toBe(true);
    });

    it('should detect Write tool_use messages', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const writeMsg = createWriteToolUse('/path/to/file.ts', 'content');
      expect(approvalModal.isToolUseMessage(writeMsg)).toBe(true);
    });

    it('should still detect Bash tool_use messages', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const bashMsg = createBashToolUse('npm install');
      expect(approvalModal.isToolUseMessage(bashMsg)).toBe(true);
    });

    it('should reject non-tool_use messages', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const textMsg = { type: 'text', text: 'Hello' };
      expect(approvalModal.isToolUseMessage(textMsg)).toBe(false);
    });
  });

  describe('showPermissionModal function', () => {
    it('should export showPermissionModal function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.showPermissionModal).toBeDefined();
      expect(typeof approvalModal.showPermissionModal).toBe('function');
    });

    it('should accept tool name and context parameters', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      // Function signature: showPermissionModal(toolName, toolId, context, reason?)
      // Should not throw
      approvalModal.showPermissionModal('WebFetch', 'tool-1', { url: 'https://api.example.com' });
      expect(approvalModal.isModalVisible()).toBe(true);

      approvalModal.hideApprovalModal();
    });

    it('should show modal for WebFetch tool', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('WebFetch', 'tool-fetch-1', {
        url: 'https://github.com/api',
        prompt: 'Fetch repository info',
      });

      expect(approvalModal.isModalVisible()).toBe(true);
      approvalModal.hideApprovalModal();
    });

    it('should show modal for Edit tool', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('Edit', 'tool-edit-1', {
        file_path: '/src/index.ts',
        old_string: 'const x = 1',
        new_string: 'const x = 2',
      });

      expect(approvalModal.isModalVisible()).toBe(true);
      approvalModal.hideApprovalModal();
    });

    it('should show modal for Write tool', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('Write', 'tool-write-1', {
        file_path: '/src/new-file.ts',
        content: 'export const x = 1;',
      });

      expect(approvalModal.isModalVisible()).toBe(true);
      approvalModal.hideApprovalModal();
    });
  });

  describe('Generic IPC channels', () => {
    it('should have permission:request IPC channel for any tool', async () => {
      const preload = await import('../src/preload.js');

      expect(preload.electronAPI?.permission?.onRequest).toBeDefined();
      expect(typeof preload.electronAPI?.permission?.onRequest).toBe('function');
    });

    it('should have permission:response IPC channel for any tool', async () => {
      const preload = await import('../src/preload.js');

      expect(preload.electronAPI?.permission?.sendResponse).toBeDefined();
      expect(typeof preload.electronAPI?.permission?.sendResponse).toBe('function');
    });
  });

  describe('Generic approval gate', () => {
    it('should export interceptToolUse function', async () => {
      const approvalGate = await import('../src/approval-gate.js');

      expect(approvalGate.interceptToolUse).toBeDefined();
      expect(typeof approvalGate.interceptToolUse).toBe('function');
    });

    it('should intercept WebFetch tool when approval required', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      // Enable a generic permission gate (or use existing pattern)
      settingsStore.setBashApprovalGate(true); // Reusing Bash gate for now

      const result = approvalGate.interceptToolUse({
        type: 'tool_use',
        tool_name: 'WebFetch',
        tool_id: 'test-fetch-1',
        input: { url: 'https://api.example.com', prompt: 'Fetch data' },
      });

      // Should identify tool type and context
      expect(result.toolName).toBe('WebFetch');
      expect(result.toolId).toBe('test-fetch-1');

      settingsStore.setBashApprovalGate(false);
    });

    it('should intercept Edit tool when approval required', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const result = approvalGate.interceptToolUse({
        type: 'tool_use',
        tool_name: 'Edit',
        tool_id: 'test-edit-1',
        input: { file_path: '/src/file.ts', old_string: 'a', new_string: 'b' },
      });

      expect(result.toolName).toBe('Edit');
      expect(result.toolId).toBe('test-edit-1');

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC2: One-click approve/deny buttons (inherited from 22-3)
// =============================================================================
describe('AC2: One-click approve/deny buttons', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should approve generic tool permission with one click', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    const mockSendResponse = vi.fn();
    approvalModal.setResponseCallback(mockSendResponse);

    const toolId = 'test-generic-approve';
    approvalModal.showPermissionModal('WebFetch', toolId, { url: 'https://api.example.com' });
    approvalModal.handleAllowOnce();

    expect(mockSendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: toolId,
        approved: true,
        grantScope: 'once',
      })
    );
  });

  it('should deny generic tool permission with one click', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    const mockSendResponse = vi.fn();
    approvalModal.setResponseCallback(mockSendResponse);

    const toolId = 'test-generic-deny';
    approvalModal.showPermissionModal('WebFetch', toolId, { url: 'https://api.example.com' });
    approvalModal.handleReject();

    expect(mockSendResponse).toHaveBeenCalledWith({
      toolId: toolId,
      approved: false,
    });
  });

  it('should support all three grant scopes for generic tools', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    const mockSendResponse = vi.fn();
    approvalModal.setResponseCallback(mockSendResponse);

    // Test session scope
    approvalModal.showPermissionModal('Edit', 'test-session', { file_path: '/src/file.ts' });
    approvalModal.handleAllowSession();

    expect(mockSendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: true,
        grantScope: 'session',
      })
    );

    // Test always scope
    approvalModal.showPermissionModal('Write', 'test-always', { file_path: '/src/file.ts' });
    approvalModal.handleAlwaysAllow();

    expect(mockSendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        approved: true,
        grantScope: 'always',
      })
    );
  });
});

// =============================================================================
// AC3: Shows tool name and reason for request
// =============================================================================
describe('AC3: Shows tool name and reason for request', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    const window = new Window();
    window.document.write(html);
    document = window.document;

    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  beforeEach(async () => {
    vi.resetModules();
  });

  describe('Tool name display', () => {
    it('should have tool-name element in modal', () => {
      const toolNameEl = document.querySelector('#approval-modal .tool-name, .approval-modal .tool-name');
      expect(toolNameEl).not.toBeNull();
    });

    it('should export getDisplayedToolName function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getDisplayedToolName).toBeDefined();
      expect(typeof approvalModal.getDisplayedToolName).toBe('function');
    });

    it('should display tool name for WebFetch', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('WebFetch', 'tool-1', { url: 'https://api.example.com' });

      expect(approvalModal.getDisplayedToolName()).toBe('WebFetch');
      approvalModal.hideApprovalModal();
    });

    it('should display tool name for Edit', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('Edit', 'tool-1', { file_path: '/src/file.ts' });

      expect(approvalModal.getDisplayedToolName()).toBe('Edit');
      approvalModal.hideApprovalModal();
    });

    it('should display tool name for Write', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('Write', 'tool-1', { file_path: '/src/file.ts' });

      expect(approvalModal.getDisplayedToolName()).toBe('Write');
      approvalModal.hideApprovalModal();
    });

    it('should display tool name for Bash', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('Bash', 'tool-1', { command: 'npm install' });

      expect(approvalModal.getDisplayedToolName()).toBe('Bash');
      approvalModal.hideApprovalModal();
    });

    it('should have CSS styling for tool name', () => {
      expect(css).toMatch(/\.tool-name/);
    });
  });

  describe('Reason display', () => {
    it('should have reason-display element in modal', () => {
      const reasonEl = document.querySelector('#approval-modal .reason-display, .approval-modal .reason-display');
      expect(reasonEl).not.toBeNull();
    });

    it('should export getDisplayedReason function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getDisplayedReason).toBeDefined();
      expect(typeof approvalModal.getDisplayedReason).toBe('function');
    });

    it('should display reason when provided', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const reason = 'Fetching package documentation';
      approvalModal.showPermissionModal(
        'WebFetch',
        'tool-1',
        { url: 'https://docs.example.com' },
        reason
      );

      expect(approvalModal.getDisplayedReason()).toBe(reason);
      approvalModal.hideApprovalModal();
    });

    it('should show empty reason when not provided', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('WebFetch', 'tool-1', { url: 'https://api.example.com' });

      // Should handle missing reason gracefully
      const reason = approvalModal.getDisplayedReason();
      expect(reason === '' || reason === null || reason === undefined).toBe(true);
      approvalModal.hideApprovalModal();
    });
  });

  describe('Context display', () => {
    it('should have context-display element in modal', () => {
      const contextEl = document.querySelector('#approval-modal .context-display, .approval-modal .context-display');
      expect(contextEl).not.toBeNull();
    });

    it('should export getDisplayedContext function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getDisplayedContext).toBeDefined();
      expect(typeof approvalModal.getDisplayedContext).toBe('function');
    });

    it('should display URL for WebFetch', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const url = 'https://api.github.com/repos/test/info';
      approvalModal.showPermissionModal('WebFetch', 'tool-1', { url, prompt: 'Get repo info' });

      const context = approvalModal.getDisplayedContext();
      expect(context).toContain(url);
      approvalModal.hideApprovalModal();
    });

    it('should display file path for Edit', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const filePath = '/src/components/Button.tsx';
      approvalModal.showPermissionModal('Edit', 'tool-1', {
        file_path: filePath,
        old_string: 'old',
        new_string: 'new',
      });

      const context = approvalModal.getDisplayedContext();
      expect(context).toContain(filePath);
      approvalModal.hideApprovalModal();
    });

    it('should display file path for Write', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const filePath = '/src/new-file.ts';
      approvalModal.showPermissionModal('Write', 'tool-1', {
        file_path: filePath,
        content: 'export const x = 1;',
      });

      const context = approvalModal.getDisplayedContext();
      expect(context).toContain(filePath);
      approvalModal.hideApprovalModal();
    });

    it('should display command for Bash (preserving existing behavior)', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const command = 'npm install lodash';
      approvalModal.showPermissionModal('Bash', 'tool-1', { command });

      const context = approvalModal.getDisplayedContext();
      expect(context).toContain(command);
      approvalModal.hideApprovalModal();
    });
  });

  describe('Tool-specific safety analysis', () => {
    it('should export getToolSafetyLevel function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getToolSafetyLevel).toBeDefined();
      expect(typeof approvalModal.getToolSafetyLevel).toBe('function');
    });

    it('should classify WebFetch as safe for known domains', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getToolSafetyLevel('WebFetch', { url: 'https://github.com/api' })).toBe('safe');
      expect(approvalModal.getToolSafetyLevel('WebFetch', { url: 'https://npmjs.com/package/test' })).toBe('safe');
    });

    it('should classify WebFetch as caution for unknown domains', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getToolSafetyLevel('WebFetch', { url: 'https://unknown-domain.xyz' })).toBe('caution');
    });

    it('should classify Edit as caution', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getToolSafetyLevel('Edit', { file_path: '/src/file.ts' })).toBe('caution');
    });

    it('should classify Write as caution', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getToolSafetyLevel('Write', { file_path: '/src/file.ts' })).toBe('caution');
    });

    it('should still use existing safety analysis for Bash', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getToolSafetyLevel('Bash', { command: 'ls -la' })).toBe('safe');
      expect(approvalModal.getToolSafetyLevel('Bash', { command: 'rm file.txt' })).toBe('caution');
      expect(approvalModal.getToolSafetyLevel('Bash', { command: 'rm -rf /' })).toBe('danger');
    });
  });
});

// =============================================================================
// AC4: Status indicator in UI (shows pending permission requests)
// =============================================================================
describe('AC4: Status indicator in UI', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    const window = new Window();
    window.document.write(html);
    document = window.document;

    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  beforeEach(async () => {
    vi.resetModules();
  });

  describe('Pending permission indicator element', () => {
    it('should have permission-status element in UI', () => {
      const statusEl = document.querySelector(
        '#permission-status, .permission-status, [data-testid="permission-status"]'
      );
      expect(statusEl).not.toBeNull();
    });

    it('should have CSS for permission status indicator', () => {
      expect(css).toMatch(/\.permission-status|#permission-status/);
    });
  });

  describe('Permission status exports', () => {
    it('should export getPendingCount function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getPendingCount).toBeDefined();
      expect(typeof approvalModal.getPendingCount).toBe('function');
    });

    it('should export updateStatusIndicator function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.updateStatusIndicator).toBeDefined();
      expect(typeof approvalModal.updateStatusIndicator).toBe('function');
    });
  });

  describe('Status indicator behavior', () => {
    it('should show 0 pending when no permissions requested', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      // Ensure clean state
      approvalModal.hideApprovalModal();

      expect(approvalModal.getPendingCount()).toBe(0);
    });

    it('should increment pending count when permission requested', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');
      const approvalGate = await import('../src/approval-gate.js');

      // Clear any existing state
      approvalGate.clearPendingApprovals();

      // Request approval
      approvalGate.requestApproval('npm install', 'tool-pending-1');

      expect(approvalGate.getQueueLength()).toBe(1);
    });

    it('should decrement pending count when permission resolved', async () => {
      const approvalGate = await import('../src/approval-gate.js');

      // Clear and add one
      approvalGate.clearPendingApprovals();
      approvalGate.requestApproval('npm install', 'tool-resolve-1');

      expect(approvalGate.getQueueLength()).toBe(1);

      // Resolve it
      approvalGate.resolveApproval('tool-resolve-1', true);

      expect(approvalGate.getQueueLength()).toBe(0);
    });

    it('should track multiple pending permissions', async () => {
      const approvalGate = await import('../src/approval-gate.js');

      // Clear and add multiple
      approvalGate.clearPendingApprovals();

      approvalGate.requestApproval('cmd1', 'tool-multi-1');
      approvalGate.requestApproval('cmd2', 'tool-multi-2');
      approvalGate.requestApproval('cmd3', 'tool-multi-3');

      expect(approvalGate.getQueueLength()).toBe(3);

      // Resolve one
      approvalGate.resolveApproval('tool-multi-2', true);

      expect(approvalGate.getQueueLength()).toBe(2);

      // Cleanup
      approvalGate.resolveApproval('tool-multi-1', true);
      approvalGate.resolveApproval('tool-multi-3', true);
    });
  });

  describe('Visual indicator states', () => {
    it('should be hidden when no pending permissions', () => {
      // Status indicator should not be visible when count is 0
      // This will be verified by CSS class or hidden attribute
      expect(css).toMatch(/\.permission-status.*hidden|\.permission-status:empty/);
    });

    it('should have badge styling for pending count', () => {
      expect(css).toMatch(/\.permission-badge|\.permission-count/);
    });

    it('should have animation/highlight for new permission requests', () => {
      expect(css).toMatch(/\.permission-status.*animation|@keyframes.*permission/);
    });
  });
});

// =============================================================================
// Integration: Grant storage for generic tools
// =============================================================================
describe('Integration: Grant storage for generic tools', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should store grants for WebFetch tool', async () => {
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.clearAllGrants();

    settingsStore.addGrant({
      tool: 'WebFetch',
      scope: '*.github.com',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    const grants = settingsStore.getGrants();
    const webFetchGrant = grants.find((g) => g.tool === 'WebFetch');
    expect(webFetchGrant).toBeDefined();
    expect(webFetchGrant?.scope).toBe('*.github.com');
  });

  it('should store grants for Edit tool', async () => {
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.clearAllGrants();

    settingsStore.addGrant({
      tool: 'Edit',
      scope: '/src/*',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    const grants = settingsStore.getGrants();
    const editGrant = grants.find((g) => g.tool === 'Edit');
    expect(editGrant).toBeDefined();
    expect(editGrant?.scope).toBe('/src/*');
  });

  it('should check grants by tool name', async () => {
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.clearAllGrants();

    // Add grant for WebFetch
    settingsStore.addGrant({
      tool: 'WebFetch',
      scope: '*.github.com',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    // Check should match tool name
    expect(settingsStore.checkGrant('WebFetch', 'https://github.com/api')).toBe(true);
    expect(settingsStore.checkGrant('Edit', 'https://github.com/api')).toBe(false);
  });

  it('should extract scope pattern from WebFetch URL', async () => {
    const settingsStore = await import('../src/settings-store.js');

    // extractPattern should work for URLs too
    const pattern = settingsStore.extractPattern('https://api.github.com/repos');
    expect(pattern).toMatch(/github\.com|https/);
  });
});

// =============================================================================
// Backward Compatibility: Existing Bash behavior preserved
// =============================================================================
describe('Backward Compatibility: Bash behavior preserved', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should still use showApprovalModal for Bash commands', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    // Legacy function should still work
    approvalModal.showApprovalModal('npm install', 'tool-legacy-1');
    expect(approvalModal.isModalVisible()).toBe(true);

    approvalModal.hideApprovalModal();
  });

  it('should still have isBashCommand function', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    expect(approvalModal.isBashCommand).toBeDefined();

    const bashMsg = createBashToolUse('npm install');
    expect(approvalModal.isBashCommand(bashMsg)).toBe(true);
  });

  it('should still use interceptBashToolUse for Bash-specific checks', async () => {
    const approvalGate = await import('../src/approval-gate.js');
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.setBashApprovalGate(true);

    const result = approvalGate.interceptBashToolUse({
      type: 'tool_use',
      tool_name: 'Bash',
      tool_id: 'test-bash-1',
      input: { command: 'npm install' },
    });

    expect(result).toBeDefined();
    expect(typeof result.shouldApprove).toBe('boolean');

    settingsStore.setBashApprovalGate(false);
  });

  it('should still apply Bash-specific syntax highlighting', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    const command = 'if [ -f file.txt ]; then cat file.txt; fi';
    const highlighted = approvalModal.highlightBashSyntax(command);

    // Should still highlight bash keywords
    expect(highlighted).toMatch(/<span[^>]*class="[^"]*keyword[^"]*"/);
  });

  it('should still apply Bash-specific safety analysis', async () => {
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

    expect(approvalModal.getCommandSafetyLevel('ls -la')).toBe('safe');
    expect(approvalModal.getCommandSafetyLevel('rm -rf /')).toBe('danger');
  });
});
