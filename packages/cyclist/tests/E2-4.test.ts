/**
 * E2-4: Live Stats UI Tests
 *
 * NOTE: This test suite is SKIPPED because it tests stats.js which was
 * consolidated into stats-strip.js per B-22. The WebSocket stats functionality
 * now lives in stats-strip.js with a different architecture.
 *
 * Original ACs (for reference):
 * 1. Stats.js connects to /ws/stats on page load
 * 2. Stats update immediately on WebSocket message
 * 3. Visual feedback on value changes (pulse animation)
 * 4. Automatic reconnection on disconnect
 * 5. Fallback to polling if WebSocket fails
 *
 * These ACs are now covered by B-22-stats-strip.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';
import { WebSocket, Server as WSServer } from 'ws';
import { Server } from 'http';

import { app, createTerminalServer } from '../src/server.js';

describe.skip('E2-4: Live Stats UI', () => {
  let html: string;
  let css: string;
  let statsJs: string;
  let server: Server;
  let wsStatsUrl: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;

    // Fetch stats.js
    const jsResponse = await request(app).get('/js/stats.js');
    statsJs = jsResponse.text;

    // Start server for WebSocket tests
    server = createTerminalServer();
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          wsStatsUrl = `ws://localhost:${addr.port}/ws/stats`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('AC1: Stats.js connects to /ws/stats on page load', () => {
    it('should have WebSocket connection code in stats.js', () => {
      // stats.js should contain WebSocket instantiation
      const hasWebSocketConnection =
        statsJs.includes('new WebSocket') ||
        statsJs.includes('WebSocket(');
      expect(hasWebSocketConnection).toBe(true);
    });

    it('should connect to /ws/stats endpoint', () => {
      // stats.js should reference the /ws/stats path
      const connectsToStatsEndpoint =
        statsJs.includes('/ws/stats') ||
        statsJs.includes('ws/stats');
      expect(connectsToStatsEndpoint).toBe(true);
    });

    it('should initiate connection on page load', () => {
      // Connection should happen at module load, not deferred
      // Look for WebSocket creation outside of event handlers
      const hasAutoConnect =
        (statsJs.includes('new WebSocket') && !statsJs.includes('function connect')) ||
        statsJs.includes('connectStats()') ||
        statsJs.includes('initWebSocket');
      expect(hasAutoConnect).toBe(true);
    });

    it('should export connectStats function for testing', () => {
      // stats.js should expose connection function
      const exportsConnectFunction =
        statsJs.includes('window.connectStats') ||
        statsJs.includes('window.initStatsWebSocket');
      expect(exportsConnectFunction).toBe(true);
    });
  });

  describe('AC2: Stats update immediately on WebSocket message', () => {
    it('should have WebSocket onmessage handler', () => {
      // stats.js should handle incoming messages
      const hasMessageHandler =
        statsJs.includes('.onmessage') ||
        statsJs.includes("on('message") ||
        statsJs.includes('addEventListener(\'message');
      expect(hasMessageHandler).toBe(true);
    });

    it('should parse JSON from WebSocket messages', () => {
      // stats.js should parse incoming JSON data
      const parsesJson =
        statsJs.includes('JSON.parse') &&
        (statsJs.includes('onmessage') || statsJs.includes('message'));
      expect(parsesJson).toBe(true);
    });

    it('should call updateStats with parsed message data', () => {
      // stats.js should invoke updateStats on message receipt
      const callsUpdateStats =
        statsJs.includes('updateStats(') &&
        (statsJs.includes('onmessage') || statsJs.includes('message'));
      expect(callsUpdateStats).toBe(true);
    });

    it('should handle stats messages with context, model, and status fields', () => {
      // Message handler should process standard stats fields
      const handlesStatsFields =
        (statsJs.includes('context') || statsJs.includes('model') || statsJs.includes('status')) &&
        statsJs.includes('JSON.parse');
      expect(handlesStatsFields).toBe(true);
    });
  });

  describe('AC3: Visual feedback on value changes (pulse animation)', () => {
    it('should have CSS pulse animation defined', () => {
      // CSS should include keyframes for pulse animation
      const hasPulseKeyframes =
        css.includes('@keyframes') &&
        (css.includes('pulse') || css.includes('updated') || css.includes('flash'));
      expect(hasPulseKeyframes).toBe(true);
    });

    it('should have .stat-value.updated CSS class', () => {
      // CSS should style the updated state
      const hasUpdatedClass =
        css.includes('.stat-value.updated') ||
        css.includes('.updated') ||
        css.includes('[data-stat].updated');
      expect(hasUpdatedClass).toBe(true);
    });

    it('should add updated class when value changes in stats.js', () => {
      // stats.js should toggle the updated class on change
      const addsUpdatedClass =
        statsJs.includes('classList.add') &&
        (statsJs.includes('updated') || statsJs.includes('pulse'));
      expect(addsUpdatedClass).toBe(true);
    });

    it('should remove updated class after animation completes', () => {
      // stats.js should clean up the animation class
      const removesUpdatedClass =
        statsJs.includes('classList.remove') ||
        statsJs.includes('setTimeout') ||
        statsJs.includes('animationend');
      expect(removesUpdatedClass).toBe(true);
    });
  });

  describe('AC4: Automatic reconnection on disconnect', () => {
    it('should have WebSocket onclose handler', () => {
      // stats.js should handle connection close
      const hasCloseHandler =
        statsJs.includes('.onclose') ||
        statsJs.includes("on('close") ||
        statsJs.includes('addEventListener(\'close');
      expect(hasCloseHandler).toBe(true);
    });

    it('should attempt reconnection after close', () => {
      // stats.js should have reconnection logic
      const hasReconnectLogic =
        statsJs.includes('reconnect') ||
        (statsJs.includes('setTimeout') && statsJs.includes('WebSocket'));
      expect(hasReconnectLogic).toBe(true);
    });

    it('should use exponential backoff for reconnection', () => {
      // Reconnect delay should increase with each attempt
      const hasBackoff =
        statsJs.includes('backoff') ||
        statsJs.includes('retryDelay') ||
        statsJs.includes('Math.min') ||
        statsJs.includes('* 2');
      expect(hasBackoff).toBe(true);
    });

    it('should cap reconnection delay at reasonable maximum', () => {
      // Max delay should be bounded (e.g., 30 seconds)
      const hasMaxDelay =
        statsJs.includes('Math.min') ||
        statsJs.includes('maxDelay') ||
        statsJs.includes('30000') ||
        statsJs.includes('MAX_RETRY');
      expect(hasMaxDelay).toBe(true);
    });

    it('should handle WebSocket onerror event', () => {
      // stats.js should handle connection errors
      const hasErrorHandler =
        statsJs.includes('.onerror') ||
        statsJs.includes("on('error") ||
        statsJs.includes('addEventListener(\'error');
      expect(hasErrorHandler).toBe(true);
    });
  });

  describe('AC5: Fallback to polling if WebSocket fails', () => {
    it('should track connection failure count', () => {
      // stats.js should count failed attempts
      const tracksFailures =
        statsJs.includes('retryCount') ||
        statsJs.includes('failCount') ||
        statsJs.includes('attempts') ||
        statsJs.includes('reconnectAttempts');
      expect(tracksFailures).toBe(true);
    });

    it('should fall back to HTTP polling after max retries', () => {
      // stats.js should use refreshStats polling as fallback
      const hasFallback =
        statsJs.includes('setInterval') ||
        (statsJs.includes('refreshStats') && statsJs.includes('retryCount'));
      expect(hasFallback).toBe(true);
    });

    it('should use reasonable polling interval (2-5 seconds)', () => {
      // Polling should not be too aggressive
      const hasPollingInterval =
        statsJs.includes('2000') ||
        statsJs.includes('3000') ||
        statsJs.includes('5000') ||
        statsJs.includes('pollingInterval');
      expect(hasPollingInterval).toBe(true);
    });

    it('should continue attempting WebSocket reconnection periodically', () => {
      // Even in polling mode, should try WebSocket occasionally
      const triesReconnect =
        statsJs.includes('retryWebSocket') ||
        (statsJs.includes('setInterval') && statsJs.includes('WebSocket'));
      expect(triesReconnect).toBe(true);
    });
  });

  describe('Integration: End-to-end stats flow', () => {
    it('should receive and display stats from WebSocket server', async () => {
      // Create DOM environment
      const window = new Window();
      window.document.write(html);
      const document = window.document;

      // Verify initial stats structure exists
      const contextElement = document.querySelector('[data-stat="context"]');
      const statusElement = document.querySelector('[data-stat="status"]');

      expect(contextElement).not.toBeNull();
      expect(statusElement).not.toBeNull();

      // The actual WebSocket integration would require running stats.js
      // in the browser context - this test validates the HTML structure
    });

    it('should connect to real WebSocket endpoint', async () => {
      // Verify the endpoint is available for client connection
      const ws = new WebSocket(wsStatsUrl);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', (err) => reject(err));
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });
});
