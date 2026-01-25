/**
 * E2E Tests for Hook Request System (MSSCI-12409)
 *
 * Tests the WheelHub consolidation - all hooks communicate through
 * the central /api/hook-request endpoint and /ws/hooks WebSocket.
 *
 * Tests:
 * - Hook request endpoint accepts POST requests
 * - WebSocket broadcasts hook requests to connected clients
 * - Hook responses flow back through WebSocket
 * - Context information is included in requests
 * - Auto-approval for allowlisted commands
 */

import { test, expect, Page } from '@playwright/test';
import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://localhost:1900';
const WS_URL = BASE_URL.replace('http', 'ws');

/**
 * Helper to create a WebSocket connection to the hooks endpoint
 */
function connectToHooksWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws/hooks`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
  });
}

/**
 * Helper to wait for a WebSocket message
 */
function waitForMessage(ws: WebSocket, timeout = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), timeout);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

/**
 * Helper to wait for a WebSocket message matching a specific toolId.
 * Drains any stale messages from previous tests.
 */
function waitForMessageWithToolId(ws: WebSocket, expectedToolId: string, timeout = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Message timeout waiting for toolId: ${expectedToolId}`)), timeout);

    const handler = (data: Buffer) => {
      const message = JSON.parse(data.toString());
      if (message.toolId === expectedToolId) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(message);
      }
      // If toolId doesn't match, ignore (drain stale messages)
    };

    ws.on('message', handler);
  });
}

/**
 * Helper to send a hook request via HTTP
 */
async function sendHookRequest(data: {
  toolName: string;
  toolId: string;
  input?: Record<string, unknown>;
  context?: { percentage: number; isHigh: boolean; isCritical: boolean };
}): Promise<Response> {
  return fetch(`${BASE_URL}/api/hook-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

test.describe('Hook Request API', () => {
  // Run these tests serially to avoid race conditions
  test.describe.configure({ mode: 'serial' });

  test('POST /api/hook-request returns 400 for missing fields', async () => {
    const response = await fetch(`${BASE_URL}/api/hook-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing required fields');
  });

  test('GET /api/hook-request/pending returns array', async () => {
    const response = await fetch(`${BASE_URL}/api/hook-request/pending`);

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(Array.isArray(body.pending)).toBe(true);
  });

  test('auto-approves allowlisted commands (ls)', async () => {
    const response = await sendHookRequest({
      toolName: 'Bash',
      toolId: 'test-001',
      input: { command: 'ls -la' },
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.decision).toBe('allow');
    expect(body.reason).toContain('allowlist');
  });

  test('auto-approves allowlisted commands (git status)', async () => {
    const response = await sendHookRequest({
      toolName: 'Bash',
      toolId: 'test-002',
      input: { command: 'git status' },
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.decision).toBe('allow');
  });

  // NOTE: This test is skipped because the browser page opened by Playwright
  // connects to /ws/hooks automatically, so there's always at least one client.
  // The behavior is correctly tested in integration scenarios without Playwright.
  test.skip('defers to Claude Code when no WebSocket clients', async () => {
    // Non-allowlisted command with no clients should return 'ask'
    const response = await sendHookRequest({
      toolName: 'Bash',
      toolId: 'test-003',
      input: { command: 'rm -rf /dangerous' },
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.decision).toBe('ask');
    expect(body.reason).toContain('No Cyclist clients');
  });

});

test.describe('Hook WebSocket Communication', () => {
  // Run serially to avoid message confusion between tests
  test.describe.configure({ mode: 'serial' });

  test('WebSocket connection to /ws/hooks succeeds', async () => {
    const ws = await connectToHooksWebSocket();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  test('WebSocket receives broadcast when hook request needs approval', async () => {
    // Connect WebSocket first
    const ws = await connectToHooksWebSocket();

    try {
      // Wait for WS to be fully ready
      await new Promise(resolve => setTimeout(resolve, 200));

      const toolId = `test-ws-${Date.now()}`;

      // Set up message listener that filters by toolId (drains stale messages)
      const messagePromise = waitForMessageWithToolId(ws, toolId);

      // Send request in background (it will wait for approval)
      const requestPromise = sendHookRequest({
        toolName: 'Bash',
        toolId,
        input: { command: 'npm install malicious-package' },
        context: { percentage: 45, isHigh: false, isCritical: false },
      });

      // Wait for WebSocket message matching our toolId
      const message = await messagePromise as {
        type: string;
        toolId: string;
        toolName: string;
        input: Record<string, unknown>;
        context?: { percentage: number };
      };

      expect(message.type).toBe('hook-request');
      expect(message.toolId).toBe(toolId);
      expect(message.toolName).toBe('Bash');
      expect(message.input.command).toBe('npm install malicious-package');
      expect(message.context?.percentage).toBe(45);

      // Send approval response
      ws.send(JSON.stringify({
        type: 'hook-response',
        toolId,
        approved: true,
      }));

      // Wait for HTTP response
      const response = await requestPromise;
      const body = await response.json();

      expect(body.decision).toBe('allow');
      expect(body.reason).toContain('Approved by user');

    } finally {
      ws.close();
    }
  });

  test('WebSocket can deny hook request', async () => {
    const ws = await connectToHooksWebSocket();

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const toolId = `test-deny-${Date.now()}`;
      const messagePromise = waitForMessage(ws, 10000);

      const requestPromise = sendHookRequest({
        toolName: 'Bash',
        toolId,
        input: { command: 'sudo rm -rf /' },
      });

      // Wait for broadcast
      await messagePromise;

      // Send denial
      ws.send(JSON.stringify({
        type: 'hook-response',
        toolId,
        approved: false,
      }));

      const response = await requestPromise;
      const body = await response.json();

      expect(body.decision).toBe('deny');
      expect(body.reason).toContain('Rejected');

    } finally {
      ws.close();
    }
  });

  test('WebSocket can include data in approval response', async () => {
    const ws = await connectToHooksWebSocket();

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const toolId = `test-data-${Date.now()}`;
      const messagePromise = waitForMessage(ws, 10000);

      const requestPromise = sendHookRequest({
        toolName: 'AskUserQuestion',
        toolId,
        input: { questions: [{ question: 'Choose option' }] },
      });

      await messagePromise;

      // Send approval with data (simulating user answering question)
      ws.send(JSON.stringify({
        type: 'hook-response',
        toolId,
        approved: true,
        data: { answers: { '0': 'Option A' } },
      }));

      const response = await requestPromise;
      const body = await response.json();

      expect(body.decision).toBe('allow');
      expect(body.data).toEqual({ answers: { '0': 'Option A' } });

    } finally {
      ws.close();
    }
  });

});

test.describe('Context Integration', () => {
  // Run serially to avoid message confusion between tests
  test.describe.configure({ mode: 'serial' });

  test('context info is included in WebSocket broadcast', async () => {
    const ws = await connectToHooksWebSocket();

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const toolId = `test-context-${Date.now()}`;
      const messagePromise = waitForMessage(ws, 10000);

      // Request with high context (use non-allowlisted command)
      sendHookRequest({
        toolName: 'Bash',
        toolId,
        input: { command: 'npm run dangerous-script' },
        context: { percentage: 75, isHigh: true, isCritical: false },
      });

      const message = await messagePromise as {
        context?: { percentage: number; isHigh: boolean; isCritical: boolean };
      };

      expect(message.context).toBeDefined();
      expect(message.context?.percentage).toBe(75);
      expect(message.context?.isHigh).toBe(true);
      expect(message.context?.isCritical).toBe(false);

      // Clean up - approve the request
      ws.send(JSON.stringify({
        type: 'hook-response',
        toolId,
        approved: true,
      }));

    } finally {
      ws.close();
    }
  });

  test('critical context is flagged in broadcast', async () => {
    const ws = await connectToHooksWebSocket();

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const toolId = `test-critical-${Date.now()}`;
      const messagePromise = waitForMessage(ws, 10000);

      sendHookRequest({
        toolName: 'Bash',
        toolId,
        input: { command: 'npm run critical-operation' },
        context: { percentage: 85, isHigh: true, isCritical: true },
      });

      const message = await messagePromise as {
        context?: { isCritical: boolean };
      };

      expect(message.context?.isCritical).toBe(true);

      ws.send(JSON.stringify({
        type: 'hook-response',
        toolId,
        approved: true,
      }));

    } finally {
      ws.close();
    }
  });

});
