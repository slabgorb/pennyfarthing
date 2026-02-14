/**
 * MSSCI-14321: Integrate grant checking into WheelHub hook router
 *
 * Tests that hook-request.ts uses the settings-store grant system
 * instead of hardcoded SAFE_COMMAND_PATTERNS for auto-approval.
 *
 * Acceptance Criteria:
 * - AC1: Grant-based auto-approval for all tool types
 * - AC2: Allowlist fallback for Bash commands
 * - AC3: Once grant lifecycle (auto-revoke after first use)
 * - AC4: Session grant lifecycle (persists for session)
 * - AC5: Always grant lifecycle (persists to file)
 * - AC6: WebSocket broadcast when no grant matches
 * - AC7: Ask fallback when no WebSocket clients connected
 * - AC8: Grant storage when user approves with grantScope
 * - AC9: SAFE_COMMAND_PATTERNS removed from hook-request.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { WebSocket } from 'ws';

// Mock settings-store BEFORE importing hook-request
vi.mock('@pennyfarthing/core/dist/server/settings-store.js', () => ({
  checkGrant: vi.fn().mockReturnValue(false),
  isAllowlisted: vi.fn().mockReturnValue(false),
  getBashApprovalGate: vi.fn().mockReturnValue(true),
  addGrant: vi.fn(),
  GrantType: { ONCE: 'once', SESSION: 'session', ALWAYS: 'always' },
}));

import {
  createHookRequestRouter,
  addHookClient,
  getHookClients,
  resolveApproval,
  handleHookWebSocketMessage,
} from '../src/api/hook-request.js';
import { checkGrant, isAllowlisted, addGrant } from '@pennyfarthing/core/dist/server/settings-store.js';

// Type the mocked functions
const mockCheckGrant = vi.mocked(checkGrant);
const mockIsAllowlisted = vi.mocked(isAllowlisted);
const mockAddGrant = vi.mocked(addGrant);

/**
 * Create a test Express app with the hook-request router mounted
 */
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/hook-request', createHookRequestRouter());
  return app;
}

/**
 * Create a mock WebSocket client for testing broadcasts
 */
function createMockWsClient(): WebSocket {
  const ws = {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
  return ws;
}

describe('MSSCI-14321: Hook request grant integration', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Clear hook clients between tests
    const clients = getHookClients();
    clients.clear();
  });

  // ===========================================================================
  // AC1: Grant-based auto-approval for all tool types
  // ===========================================================================

  describe('AC1: Grant-based auto-approval', () => {
    it('should auto-approve Bash command when grant matches', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-bash-grant',
          input: { command: 'npm install express' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
      expect(mockCheckGrant).toHaveBeenCalledWith('Bash', 'npm install express', undefined);
    });

    it('should auto-approve WebFetch when grant matches', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'WebFetch',
          toolId: 'test-webfetch-grant',
          input: { url: 'https://api.github.com/repos' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
      expect(mockCheckGrant).toHaveBeenCalledWith('WebFetch', 'https://api.github.com/repos', undefined);
    });

    it('should auto-approve Edit when grant matches', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Edit',
          toolId: 'test-edit-grant',
          input: { file_path: '/src/index.ts' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
      expect(mockCheckGrant).toHaveBeenCalledWith('Edit', '/src/index.ts', undefined);
    });

    it('should auto-approve unknown tool with JSON-stringified scope when grant matches', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      const input = { question: 'Choose option', answers: ['a', 'b'] };
      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'AskUserQuestion',
          toolId: 'test-unknown-grant',
          input,
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
      // For unknown tools, scope should be JSON.stringify(input)
      expect(mockCheckGrant).toHaveBeenCalledWith('AskUserQuestion', JSON.stringify(input), undefined);
    });
  });

  // ===========================================================================
  // AC2: Allowlist fallback for Bash
  // ===========================================================================

  describe('AC2: Allowlist fallback for Bash', () => {
    it('should auto-approve Bash command matching settings-store allowlist', async () => {
      mockCheckGrant.mockReturnValue(false);
      mockIsAllowlisted.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-allowlist',
          input: { command: 'git status' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
      expect(mockIsAllowlisted).toHaveBeenCalledWith('git status');
    });

    it('should NOT check allowlist for non-Bash tools', async () => {
      mockCheckGrant.mockReturnValue(false);

      // Add a WS client so request goes to broadcast instead of 'ask'
      const ws = createMockWsClient();
      addHookClient(ws);

      // Send non-Bash request - don't await since it will wait for WS response
      const reqPromise = request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'WebFetch',
          toolId: 'test-no-allowlist',
          input: { url: 'https://example.com' },
        });

      // Resolve the pending approval so the request completes
      setTimeout(() => resolveApproval('test-no-allowlist', true), 50);
      await reqPromise;

      // isAllowlisted should NOT have been called for WebFetch
      expect(mockIsAllowlisted).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC3: Once grant lifecycle (auto-revoke)
  // ===========================================================================

  describe('AC3: Once grant lifecycle', () => {
    it('should consume once grant on first use (checkGrant handles revocation)', async () => {
      // First call: grant exists, checkGrant returns true (and internally revokes)
      mockCheckGrant.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-once-1',
          input: { command: 'npm test' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');

      // Second call: grant was auto-revoked, checkGrant returns false
      mockCheckGrant.mockReturnValueOnce(false);
      mockIsAllowlisted.mockReturnValue(false);

      // No WS clients → should get 'ask'
      const res2 = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-once-2',
          input: { command: 'npm test' },
        });

      expect(res2.body.decision).toBe('ask');
    });
  });

  // ===========================================================================
  // AC4: Session grant lifecycle
  // ===========================================================================

  describe('AC4: Session grant lifecycle', () => {
    it('should continue to approve when session grant exists across requests', async () => {
      // Session grants persist for the session - checkGrant returns true each time
      mockCheckGrant.mockReturnValue(true);

      const res1 = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-session-1',
          input: { command: 'npm test' },
        });
      expect(res1.body.decision).toBe('allow');

      const res2 = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-session-2',
          input: { command: 'npm test' },
        });
      expect(res2.body.decision).toBe('allow');

      expect(mockCheckGrant).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // AC5: Always grant lifecycle
  // ===========================================================================

  describe('AC5: Always grant lifecycle', () => {
    it('should auto-approve when always grant matches (persisted grants)', async () => {
      // Always grants are loaded from file and persist across restarts
      mockCheckGrant.mockReturnValue(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Write',
          toolId: 'test-always',
          input: { file_path: '/src/config.ts' },
        });

      expect(res.body.decision).toBe('allow');
      expect(mockCheckGrant).toHaveBeenCalledWith('Write', '/src/config.ts', undefined);
    });
  });

  // ===========================================================================
  // AC6: WebSocket broadcast when no grant matches
  // ===========================================================================

  describe('AC6: WebSocket broadcast on no match', () => {
    it('should broadcast to WebSocket clients when no grant matches', async () => {
      mockCheckGrant.mockReturnValue(false);
      mockIsAllowlisted.mockReturnValue(false);

      // Track broadcast messages via send mock
      const sentMessages: string[] = [];
      const ws = createMockWsClient();
      (ws.send as ReturnType<typeof vi.fn>).mockImplementation((msg: string) => {
        sentMessages.push(msg);
      });
      addHookClient(ws);

      const toolId = 'test-broadcast';

      // Schedule approval resolution before starting request
      // The request handler will create a pending approval synchronously,
      // then broadcast, then await the promise. We resolve after a delay.
      setTimeout(() => resolveApproval(toolId, true), 100);

      // Send request (supertest dispatches on await)
      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId,
          input: { command: 'rm -rf /tmp/test' },
        });

      // Verify the request was approved via user
      expect(res.body.decision).toBe('allow');

      // Verify a broadcast was sent to the WS client
      expect(sentMessages.length).toBeGreaterThan(0);
      const broadcastMsg = JSON.parse(sentMessages[0]);
      expect(broadcastMsg.type).toBe('hook-request');
      expect(broadcastMsg.toolId).toBe(toolId);
      expect(broadcastMsg.toolName).toBe('Bash');
    });
  });

  // ===========================================================================
  // AC7: Ask fallback when no WebSocket clients
  // ===========================================================================

  describe('AC7: Ask fallback', () => {
    it('should return ask when no WebSocket clients are connected', async () => {
      mockCheckGrant.mockReturnValue(false);
      mockIsAllowlisted.mockReturnValue(false);

      // Ensure no clients
      getHookClients().clear();

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-no-clients',
          input: { command: 'dangerous-command' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ask');
    });
  });

  // ===========================================================================
  // AC8: Grant storage on approval with grantScope
  // ===========================================================================

  describe('AC8: Grant storage on approval', () => {
    it('should store grant via addGrant when resolveApproval receives grantScope', () => {
      // Test that when a hook-response contains grantScope, the approval
      // resolution path calls addGrant to persist the grant.
      //
      // In the target implementation, handleHookWebSocketMessage should:
      // 1. Look up the pending approval by toolId
      // 2. If approved && data.grantScope, call addGrant()
      // 3. Then resolve the pending approval
      //
      // We test this by calling handleHookWebSocketMessage directly and
      // verifying addGrant was called.

      // First, we need a pending approval in the map. We can't easily create one
      // without going through the HTTP handler, so we test the contract:
      // handleHookWebSocketMessage should call addGrant when grantScope is present.

      // Call handleHookWebSocketMessage with grantScope data
      handleHookWebSocketMessage(
        createMockWsClient(),
        JSON.stringify({
          type: 'hook-response',
          toolId: 'test-grant-store',
          approved: true,
          data: { grantScope: 'session' },
        }),
      );

      // In target state, addGrant should be called when grantScope is present.
      // Currently, the handler doesn't call addGrant at all.
      expect(mockAddGrant).toHaveBeenCalled();
    });

    it('should NOT store grant when resolveApproval has no grantScope', () => {
      mockAddGrant.mockClear();

      // Call handleHookWebSocketMessage without grantScope
      handleHookWebSocketMessage(
        createMockWsClient(),
        JSON.stringify({
          type: 'hook-response',
          toolId: 'test-no-grant-store',
          approved: true,
        }),
      );

      // addGrant should NOT have been called
      expect(mockAddGrant).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC9: SAFE_COMMAND_PATTERNS removed
  // ===========================================================================

  describe('AC9: Hardcoded patterns removed', () => {
    it('should NOT auto-approve ls command via hardcoded patterns (must use grants)', async () => {
      // With grants/allowlist returning false, even "safe" commands should not be auto-approved
      mockCheckGrant.mockReturnValue(false);
      mockIsAllowlisted.mockReturnValue(false);

      // No WS clients → should get 'ask' (not 'allow' from hardcoded patterns)
      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-no-hardcoded',
          input: { command: 'ls -la' },
        });

      expect(res.body.decision).toBe('ask');
      // Verify it went through checkGrant, not SAFE_COMMAND_PATTERNS
      expect(mockCheckGrant).toHaveBeenCalledWith('Bash', 'ls -la', undefined);
    });
  });
});

// ===========================================================================
// Server grant initialization (server.ts)
// ===========================================================================

describe('MSSCI-14321: Server grant initialization', () => {
  it('should initialize grants in standalone server mode', async () => {
    // This test verifies that server.ts calls initializeGrants() and
    // setGrantsPersistCallback() so grants are available outside Electron mode.
    //
    // We check by importing server.ts and verifying the settings-store
    // grant functions were called during module initialization.
    //
    // NOTE: This test will fail until server.ts is updated to call
    // initializeGrants() and setGrantsPersistCallback().

    // Read core's server.ts source and verify it imports and calls grant init functions
    const fs = await import('fs');
    const path = await import('path');
    const serverSource = fs.readFileSync(
      path.resolve(__dirname, '../../core/src/server/server.ts'),
      'utf-8',
    );

    // Verify core's server.ts imports grant initialization functions
    expect(serverSource).toContain('initializeGrants');
    expect(serverSource).toContain('setGrantsPersistCallback');
    expect(serverSource).toContain('loadGrants');
  });
});
