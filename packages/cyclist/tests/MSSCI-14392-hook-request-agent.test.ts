/**
 * MSSCI-14392: Agent-level permission scoping — Hook request layer
 *
 * Tests that hook-request.ts threads agent identity through the request flow.
 * Separated from the main test file because this requires vi.mock on settings-store
 * which conflicts with Layer 1's real import.
 *
 * Acceptance Criteria:
 * - AC1: Agent name included in hook requests to WheelHub
 * - AC2: WheelHub passes agent identity to grant matching
 * - AC5 (partial): Agent included in WebSocket broadcast
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { checkGrant, addGrant } from '@pennyfarthing/core/dist/server/settings-store.js';

const mockCheckGrant = vi.mocked(checkGrant);
const mockAddGrant = vi.mocked(addGrant);

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/hook-request', createHookRequestRouter());
  return app;
}

function createMockWsClient(): WebSocket {
  return {
    readyState: 1,
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('MSSCI-14392 AC1/AC2: Agent in hook request flow', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    getHookClients().clear();
  });

  // ---------------------------------------------------------------------------
  // AC1: Agent name included in hook requests
  // ---------------------------------------------------------------------------

  describe('AC1: Agent field accepted in hook request', () => {
    it('should accept and process agent field in POST body', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-agent-field',
          input: { command: 'npm test' },
          agent: 'dev',
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
    });

    it('should work without agent field (backward compatible)', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      const res = await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-no-agent',
          input: { command: 'npm test' },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('allow');
    });
  });

  // ---------------------------------------------------------------------------
  // AC2: Agent passed to checkGrant
  // ---------------------------------------------------------------------------

  describe('AC2: Agent passed to grant matching', () => {
    it('should pass agent to checkGrant for auto-approval check', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-agent-grant-check',
          input: { command: 'npm test' },
          agent: 'dev',
        });

      // checkGrant should receive the agent parameter
      expect(mockCheckGrant).toHaveBeenCalledWith('Bash', 'npm test', 'dev');
    });

    it('should pass undefined agent to checkGrant when no agent provided', async () => {
      mockCheckGrant.mockReturnValueOnce(true);

      await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId: 'test-no-agent-grant-check',
          input: { command: 'npm test' },
        });

      // checkGrant should be called without agent (or with undefined)
      expect(mockCheckGrant).toHaveBeenCalledWith('Bash', 'npm test', undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // AC5 (partial): Agent included in WebSocket broadcast
  // ---------------------------------------------------------------------------

  describe('AC5: Agent in WebSocket broadcast', () => {
    it('should include agent in WebSocket broadcast to clients', async () => {
      mockCheckGrant.mockReturnValue(false);

      const sentMessages: string[] = [];
      const ws = createMockWsClient();
      (ws.send as ReturnType<typeof vi.fn>).mockImplementation((msg: string) => {
        sentMessages.push(msg);
      });
      addHookClient(ws);

      const toolId = 'test-agent-broadcast';
      setTimeout(() => resolveApproval(toolId, true), 50);

      await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId,
          input: { command: 'npm test' },
          agent: 'dev',
        });

      expect(sentMessages.length).toBeGreaterThan(0);
      const broadcastMsg = JSON.parse(sentMessages[0]);
      expect(broadcastMsg.type).toBe('hook-request');
      expect(broadcastMsg.agent).toBe('dev');
    });

    it('should omit agent from broadcast when not provided', async () => {
      mockCheckGrant.mockReturnValue(false);

      const sentMessages: string[] = [];
      const ws = createMockWsClient();
      (ws.send as ReturnType<typeof vi.fn>).mockImplementation((msg: string) => {
        sentMessages.push(msg);
      });
      addHookClient(ws);

      const toolId = 'test-no-agent-broadcast';
      setTimeout(() => resolveApproval(toolId, true), 50);

      await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId,
          input: { command: 'npm test' },
        });

      expect(sentMessages.length).toBeGreaterThan(0);
      const broadcastMsg = JSON.parse(sentMessages[0]);
      expect(broadcastMsg.agent).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Grant storage with agent identity
  // ---------------------------------------------------------------------------

  describe('Grant storage includes agent from pending approval', () => {
    it('should store agent in grant when user approves with grantScope', async () => {
      mockCheckGrant.mockReturnValue(false);

      const ws = createMockWsClient();
      addHookClient(ws);

      const toolId = 'test-agent-grant-store';

      // Schedule WebSocket approval response
      setTimeout(() => {
        handleHookWebSocketMessage(
          ws,
          JSON.stringify({
            type: 'hook-response',
            toolId,
            approved: true,
            data: { grantScope: 'session', agent: 'dev' },
          }),
        );
      }, 50);

      await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId,
          input: { command: 'npm test' },
          agent: 'dev',
        });

      // addGrant should include agent field
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'Bash',
          scope: 'npm test',
          grant_type: 'session',
          agent: 'dev',
        }),
      );
    });

    it('should store grant without agent when no agent in request', async () => {
      mockCheckGrant.mockReturnValue(false);

      const ws = createMockWsClient();
      addHookClient(ws);

      const toolId = 'test-no-agent-grant-store';

      setTimeout(() => {
        handleHookWebSocketMessage(
          ws,
          JSON.stringify({
            type: 'hook-response',
            toolId,
            approved: true,
            data: { grantScope: 'session' },
          }),
        );
      }, 50);

      await request(app)
        .post('/api/hook-request')
        .send({
          toolName: 'Bash',
          toolId,
          input: { command: 'npm test' },
        });

      // addGrant should NOT have agent field
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'Bash',
          scope: 'npm test',
          grant_type: 'session',
        }),
      );
      // Explicitly verify no agent
      const grantArg = mockAddGrant.mock.calls[0][0];
      expect(grantArg.agent).toBeUndefined();
    });
  });
});

// =============================================================================
// HookRequest type — agent field verification
// =============================================================================

describe('MSSCI-14392: HookRequest type includes agent', () => {
  it('should have agent field in HookRequest interface', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../core/src/server/api/hook-request.ts'),
      'utf-8',
    );

    // HookRequest interface should have agent field
    expect(source).toMatch(/interface HookRequest\s*\{[\s\S]*?agent\?:\s*string/);
  });

  it('should extract agent from request body in handler', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../core/src/server/api/hook-request.ts'),
      'utf-8',
    );

    // Handler should destructure agent from req.body
    expect(source).toMatch(/agent/);
    // Agent should be stored on PendingApproval for grant storage
    expect(source).toMatch(/interface PendingApproval\s*\{[\s\S]*?agent\?:\s*string/);
  });
});
