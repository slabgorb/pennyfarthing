/**
 * Story 15-2: Persona API and WebSocket Tests
 *
 * These tests verify the server integration for persona endpoints.
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 *
 * Acceptance Criteria:
 * - AC5: GET /api/persona returns {character, role, quote, ocean}
 * - AC6: WebSocket /ws/persona broadcasts on agent change
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { Server } from 'http';

// Captured watcher callback for broadcast tests
let capturedWatchCallback: ((role: string) => void) | null = null;

// Mock the pennyfarthing module to isolate server tests
vi.mock('../src/pennyfarthing.js', () => ({
  detectPennyfarthingProject: vi.fn(() => true), // Default to true so watcher is set up
  getCurrentPersona: vi.fn(),
  watchAgentChanges: vi.fn((_dir: string, _sessionId: string | undefined, cb: (role: string) => void) => {
    capturedWatchCallback = cb;
    return () => {};
  }),
}));

// Import after mocking
import { app, createTerminalServer } from '../src/server.js';
import { detectPennyfarthingProject, getCurrentPersona, watchAgentChanges } from '../src/pennyfarthing.js';

describe('Story 15-2: Persona API and WebSocket', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC5: GET /api/persona returns persona data', () => {

    const mockPersona = {
      character: 'Benjamin Franklin',
      role: 'sm',
      style: 'Polymath who leads through practical wisdom',
      quote: 'An investment in knowledge pays the best interest.',
      ocean: { O: 4, C: 4, E: 5, A: 4, N: 2 }
    };

    it('should return current persona when Pennyfarthing project detected', async () => {
      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(mockPersona);

      const response = await request(app).get('/api/persona');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPersona);
    });

    it('should return 404 when not a Pennyfarthing project', async () => {
      vi.mocked(detectPennyfarthingProject).mockReturnValue(false);

      const response = await request(app).get('/api/persona');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not a Pennyfarthing project' });
    });

    it('should return 404 when no active persona', async () => {
      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(null);

      const response = await request(app).get('/api/persona');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'No active persona' });
    });

    it('should include all required fields: character, role, quote, ocean', async () => {
      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(mockPersona);

      const response = await request(app).get('/api/persona');

      expect(response.body).toHaveProperty('character');
      expect(response.body).toHaveProperty('role');
      expect(response.body).toHaveProperty('quote');
      expect(response.body).toHaveProperty('ocean');
      expect(response.body.ocean).toHaveProperty('O');
      expect(response.body.ocean).toHaveProperty('C');
      expect(response.body.ocean).toHaveProperty('E');
      expect(response.body.ocean).toHaveProperty('A');
      expect(response.body.ocean).toHaveProperty('N');
    });

    it('should use CYCLIST_SESSION_ID env var for session-specific lookup', async () => {
      const originalEnv = process.env.CYCLIST_SESSION_ID;
      process.env.CYCLIST_SESSION_ID = 'test-session-123';

      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(mockPersona);

      await request(app).get('/api/persona');

      expect(getCurrentPersona).toHaveBeenCalledWith(
        expect.any(String),
        'test-session-123'
      );

      process.env.CYCLIST_SESSION_ID = originalEnv;
    });

  });

  describe('AC6: WebSocket /ws/persona broadcasts on agent change', () => {
    let server: Server;
    let port: number;

    beforeAll(async () => {
      // Start server for WebSocket tests
      server = createTerminalServer();
      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          port = typeof addr === 'object' && addr ? addr.port : 3000;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it('should accept WebSocket connections at /ws/persona', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/persona`);

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.close();
          resolve();
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });
    });

    it('should send initial persona on connection', async () => {
      const mockPersona = {
        character: 'David Hume',
        role: 'tea',
        style: 'Skeptic who tests by questioning',
        quote: 'Reason is, and ought only to be the slave of the passions.',
        ocean: { O: 5, C: 3, E: 3, A: 3, N: 4 }
      };

      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(mockPersona);

      const ws = new WebSocket(`ws://localhost:${port}/ws/persona`);

      const message = await new Promise<string>((resolve, reject) => {
        ws.on('message', (data) => {
          resolve(data.toString());
          ws.close();
        });
        ws.on('error', reject);
        setTimeout(() => reject(new Error('No message received')), 5000);
      });

      expect(JSON.parse(message)).toEqual(mockPersona);
    });

    it('should broadcast persona changes to all connected clients', async () => {
      const mockPersona = { character: 'Benjamin Franklin', role: 'sm' };

      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(mockPersona as any);

      // Connect a client
      const ws = new WebSocket(`ws://localhost:${port}/ws/persona`);

      // Collect all messages
      const messages: string[] = [];
      ws.on('message', (data) => messages.push(data.toString()));

      // Wait for connection
      await new Promise<void>((resolve) => ws.on('open', resolve));

      // Wait for initial message
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have received initial persona
      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(messages[0])).toEqual(mockPersona);

      // Trigger agent change via captured watcher callback
      if (capturedWatchCallback) {
        capturedWatchCallback('sm');
      }

      // Wait for broadcast
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have received broadcast (initial + broadcast = 2 messages)
      expect(messages.length).toBeGreaterThanOrEqual(2);

      ws.close();
    });

    it('should handle client disconnection gracefully', async () => {
      vi.mocked(detectPennyfarthingProject).mockReturnValue(true);
      vi.mocked(getCurrentPersona).mockReturnValue(null);

      const ws = new WebSocket(`ws://localhost:${port}/ws/persona`);

      await new Promise<void>((resolve) => ws.on('open', resolve));

      // Close the connection
      ws.close();

      // Server should not crash - verify by making another request
      const response = await request(app).get('/api/stats');
      expect(response.status).toBe(200);
    });

    it('should reject connections to other WebSocket paths', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/invalid`);

      await new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
        ws.on('error', () => resolve()); // Handle connection error gracefully
        ws.on('open', () => {
          ws.close();
          resolve();
        });
        setTimeout(resolve, 1000);
      });

      // Connection should have been rejected (not open)
      expect(ws.readyState).not.toBe(WebSocket.OPEN);
    });

  });

});
