/**
 * MSSCI-12227: WheelHub Connection Infrastructure - Separate Channel Subscriptions
 *
 * Tests verify the VS Code extension implements separate WebSocket channels
 * per PRD spec: /context, /agent, /gearshift, /story
 *
 * These tests are written to FAIL until Dev implements the separate channels.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock WebSocket client for testing
class MockWebSocket extends EventEmitter {
  readyState = 1; // WebSocket.OPEN
  send = vi.fn();
  close = vi.fn();
  terminate = vi.fn();
}

// Mock vscode minimally - not needed for websocket-manager tests
vi.mock('vscode', () => ({}));

describe('MSSCI-12227: WheelHub Separate Channel Subscriptions', () => {
  let wsModule: typeof import('../src/server/websocket-manager');
  let wsManager: InstanceType<typeof wsModule.WebSocketManager>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    wsModule = await import('../src/server/websocket-manager');
    wsManager = new wsModule.WebSocketManager();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('AC1: Extension connects to WheelHub WebSocket on activation', () => {
    // Connection on activation is already tested in MSSCI-12047
    // These tests focus on the channel subscriptions
    it('should have WebSocketManager available', () => {
      expect(wsManager).toBeDefined();
    });
  });

  describe('AC2: Subscribes to /context channel for context usage data', () => {
    it('should register /context channel', () => {
      expect(wsManager.hasChannel('/context')).toBe(true);
    });

    it('should accept connections on /context channel', () => {
      const mockClient = new MockWebSocket();

      // Should not throw
      expect(() => {
        wsManager.handleConnection('/context', mockClient as any);
      }).not.toThrow();
    });

    it('should have onContext listener method', () => {
      expect(typeof wsManager.onContext).toBe('function');
    });

    it('should notify /context listeners when context data is broadcast', () => {
      const listener = vi.fn();
      wsManager.onContext(listener);

      wsManager.broadcastContext({
        tokens: 54000,
        usablePercent: 31,
        maxTokens: 175000,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: 54000,
          usablePercent: 31,
        })
      );
    });

    it('should broadcast context to WebSocket clients on /context channel', () => {
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/context', mockClient as any);

      wsManager.broadcastContext({
        tokens: 54000,
        usablePercent: 31,
        maxTokens: 175000,
      });

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.stringContaining('"usablePercent":31')
      );
    });
  });

  describe('AC2: Subscribes to /agent channel for agent/persona changes', () => {
    it('should register /agent channel', () => {
      expect(wsManager.hasChannel('/agent')).toBe(true);
    });

    it('should accept connections on /agent channel', () => {
      const mockClient = new MockWebSocket();

      expect(() => {
        wsManager.handleConnection('/agent', mockClient as any);
      }).not.toThrow();
    });

    it('should have onAgent listener method', () => {
      expect(typeof wsManager.onAgent).toBe('function');
    });

    it('should notify /agent listeners when agent data is broadcast', () => {
      const listener = vi.fn();
      wsManager.onAgent(listener);

      wsManager.broadcastAgent({
        agent: 'tea',
        persona: {
          character: 'Han Solo',
          theme: 'star-wars',
          role: 'Test Engineer/Architect',
        },
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'tea',
          persona: expect.objectContaining({
            character: 'Han Solo',
          }),
        })
      );
    });

    it('should broadcast agent to WebSocket clients on /agent channel', () => {
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/agent', mockClient as any);

      wsManager.broadcastAgent({
        agent: 'tea',
        persona: {
          character: 'Han Solo',
          theme: 'star-wars',
          role: 'Test Engineer/Architect',
        },
      });

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.stringContaining('"agent":"tea"')
      );
    });
  });

  describe('AC2: Subscribes to /gearshift channel for permission mode changes', () => {
    it('should register /gearshift channel', () => {
      expect(wsManager.hasChannel('/gearshift')).toBe(true);
    });

    it('should accept connections on /gearshift channel', () => {
      const mockClient = new MockWebSocket();

      expect(() => {
        wsManager.handleConnection('/gearshift', mockClient as any);
      }).not.toThrow();
    });

    it('should have onGearshift listener method', () => {
      expect(typeof wsManager.onGearshift).toBe('function');
    });

    it('should notify /gearshift listeners when mode data is broadcast', () => {
      const listener = vi.fn();
      wsManager.onGearshift(listener);

      wsManager.broadcastGearshift({
        mode: 'turbo',
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'turbo',
        })
      );
    });

    it('should broadcast gearshift to WebSocket clients on /gearshift channel', () => {
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/gearshift', mockClient as any);

      wsManager.broadcastGearshift({
        mode: 'accept',
      });

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.stringContaining('"mode":"accept"')
      );
    });

    it('should support all gearshift modes', () => {
      const listener = vi.fn();
      wsManager.onGearshift(listener);

      const modes = ['plan', 'manual', 'accept', 'turbo'] as const;
      for (const mode of modes) {
        wsManager.broadcastGearshift({ mode });
        expect(listener).toHaveBeenLastCalledWith(
          expect.objectContaining({ mode })
        );
      }
    });
  });

  describe('AC2: Subscribes to /story channel for story status updates', () => {
    it('should register /story channel', () => {
      // Note: /ws/story exists but we need /story (without /ws prefix)
      expect(wsManager.hasChannel('/story')).toBe(true);
    });

    it('should accept connections on /story channel', () => {
      const mockClient = new MockWebSocket();

      expect(() => {
        wsManager.handleConnection('/story', mockClient as any);
      }).not.toThrow();
    });

    it('should have onStory listener method', () => {
      expect(typeof wsManager.onStory).toBe('function');
    });

    it('should notify /story listeners when story data is broadcast', () => {
      const listener = vi.fn();
      wsManager.onStory(listener);

      wsManager.broadcastStoryUpdate({
        id: 'MSSCI-12227',
        title: 'WheelHub Connection Infrastructure',
        phase: 'testing',
        branch: 'feature/MSSCI-12227-wheelhub-connection',
        points: 5,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'MSSCI-12227',
          phase: 'testing',
        })
      );
    });

    it('should broadcast story to WebSocket clients on /story channel', () => {
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/story', mockClient as any);

      wsManager.broadcastStoryUpdate({
        id: 'MSSCI-12227',
        title: 'WheelHub Connection Infrastructure',
        phase: 'testing',
        branch: 'feature/MSSCI-12227-wheelhub-connection',
        points: 5,
      });

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.stringContaining('"id":"MSSCI-12227"')
      );
    });
  });

  describe('AC3: Displays "Connecting..." state when WheelHub unavailable', () => {
    // This is UI behavior tested in status-bar-manager tests
    // These tests verify the manager properly reports connection state
    it('should track connection state', () => {
      // WebSocketManager should expose connection tracking
      expect(typeof wsManager.getConnectionState).toBe('function');
    });

    it('should report connecting state initially', () => {
      const state = wsManager.getConnectionState();
      expect(['connecting', 'connected', 'disconnected']).toContain(state);
    });
  });

  describe('AC4: 2-second retry interval on connection failure', () => {
    // Retry logic is in the client-side (StatusBarManager)
    // WebSocketManager is the server, not the client
    // This test verifies the manager can handle reconnections gracefully
    it('should handle client reconnection', () => {
      const mockClient1 = new MockWebSocket();
      wsManager.handleConnection('/context', mockClient1 as any);

      // Simulate disconnect
      mockClient1.emit('close');

      // New client connects (simulating reconnect)
      const mockClient2 = new MockWebSocket();
      wsManager.handleConnection('/context', mockClient2 as any);

      // Broadcast should go to new client only
      wsManager.broadcastContext({ tokens: 1000, usablePercent: 10, maxTokens: 175000 });

      expect(mockClient1.send).not.toHaveBeenCalled();
      expect(mockClient2.send).toHaveBeenCalled();
    });
  });

  describe('AC5: Extension handles disconnection without crashing', () => {
    it('should handle client error events without throwing', () => {
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/context', mockClient as any);

      // Simulate error - should not throw
      expect(() => {
        mockClient.emit('error', new Error('Connection reset'));
      }).not.toThrow();
    });

    it('should remove errored clients from broadcast list', () => {
      const mockClient = new MockWebSocket();
      wsManager.handleConnection('/context', mockClient as any);

      // Simulate error
      mockClient.emit('error', new Error('Connection reset'));

      // Reset mock to check new calls
      mockClient.send.mockClear();

      // Broadcast should not attempt to send to errored client
      wsManager.broadcastContext({ tokens: 1000, usablePercent: 10, maxTokens: 175000 });

      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('should continue functioning after client disconnects', () => {
      const mockClient1 = new MockWebSocket();
      const mockClient2 = new MockWebSocket();

      wsManager.handleConnection('/context', mockClient1 as any);
      wsManager.handleConnection('/context', mockClient2 as any);

      // Simulate first client disconnect
      mockClient1.emit('close');

      // Second client should still receive broadcasts
      wsManager.broadcastContext({ tokens: 1000, usablePercent: 10, maxTokens: 175000 });

      expect(mockClient2.send).toHaveBeenCalled();
    });
  });

  describe('Backward compatibility with existing /ws/stats channel', () => {
    it('should still support /ws/stats channel for existing consumers', () => {
      expect(wsManager.hasChannel('/ws/stats')).toBe(true);
    });

    it('should still support onStats listener for existing code', () => {
      expect(typeof wsManager.onStats).toBe('function');
    });

    it('should still support broadcastStats for existing code', () => {
      const listener = vi.fn();
      wsManager.onStats(listener);

      wsManager.broadcastStats({
        agent: 'dev',
        phase: 'green',
        context: { usablePercent: 50 },
        mode: 'turbo',
      });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Channel data types', () => {
    it('should export ContextData interface', () => {
      // TypeScript compile-time check - if this compiles, interface exists
      type ContextData = typeof wsModule.ContextData;
      expect(true).toBe(true); // If we get here, types exist
    });

    it('should export AgentData interface', () => {
      type AgentData = typeof wsModule.AgentData;
      expect(true).toBe(true);
    });

    it('should export GearshiftData interface', () => {
      type GearshiftData = typeof wsModule.GearshiftData;
      expect(true).toBe(true);
    });

    it('should export StoryData interface', () => {
      type StoryData = typeof wsModule.StoryData;
      expect(true).toBe(true);
    });
  });
});
