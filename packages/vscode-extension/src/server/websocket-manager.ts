/**
 * WebSocket Manager for WheelHub Adapter
 *
 * Manages WebSocket channels and client connections for VS Code extension.
 * Subset of Cyclist's websocket.ts, adapted for embedded server context.
 */

import type { WebSocket as WsWebSocket } from 'ws';

// Use WebSocket type from ws module
type WebSocket = WsWebSocket;

// WebSocket message types for Claude communication
interface ClaudeWebSocketMessage {
  type: 'send' | 'abort' | 'clear' | 'setMode';
  prompt?: string;
  mode?: string;
}

// Stats data type
export interface StatsData {
  agent?: string;
  phase?: string;
  persona?: {
    character: string;
    theme: string;
    role: string;
  };
  context?: {
    usablePercent: number;
  };
  /** Permission mode for gearshift status bar (MSSCI-12192) */
  mode?: 'plan' | 'manual' | 'accept' | 'turbo';
  sprint?: {
    totalPoints: number;
    completedPoints: number;
    inProgressCount: number;
    inProgressPoints: number;
    endDate: string | null;
  };
  story?: {
    id: string;
    title: string;
    phase: string;
    branch: string;
    points: number;
  };
  [key: string]: unknown;
}

// Listener callback type for same-process subscribers
export type StatsListener = (data: StatsData) => void;

// MSSCI-12227: Separate channel data types per PRD spec
export interface ContextData {
  tokens: number;
  usablePercent: number;
  maxTokens: number;
}

export interface AgentData {
  agent: string;
  persona: {
    character: string;
    theme: string;
    role: string;
  };
}

export interface GearshiftData {
  mode: 'plan' | 'manual' | 'accept' | 'turbo';
}

export interface StoryData {
  id: string;
  title: string;
  phase: string;
  branch: string;
  points: number;
}

// Listener callback types for separate channels
export type ContextListener = (data: ContextData) => void;
export type AgentListener = (data: AgentData) => void;
export type GearshiftListener = (data: GearshiftData) => void;
export type StoryListener = (data: StoryData) => void;

// Message data type for chat participant
export interface MessageData {
  type: 'chunk' | 'tool_use' | 'done' | 'error';
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  error?: string;
}

// Listener callback type for message subscribers
export type MessageListener = (data: MessageData) => void;

/**
 * Manages WebSocket channels and broadcasts for the WheelHub server.
 */
export class WebSocketManager {
  // Channel -> Set of connected clients
  private channels: Map<string, Set<WebSocket>> = new Map();

  // Registered channel paths
  private registeredChannels: Set<string> = new Set();

  // Same-process listeners (for sidebar provider integration)
  private statsListeners: Set<StatsListener> = new Set();

  // Same-process listeners (for chat participant integration)
  private messageListeners: Set<MessageListener> = new Set();

  // MSSCI-12227: Separate channel listeners per PRD spec
  private contextListeners: Set<ContextListener> = new Set();
  private agentListeners: Set<AgentListener> = new Set();
  private gearshiftListeners: Set<GearshiftListener> = new Set();
  private storyListeners: Set<StoryListener> = new Set();

  // Connection state tracking for AC3
  private connectionState: 'connecting' | 'connected' | 'disconnected' = 'connecting';

  constructor() {
    // Pre-register expected channels
    this.registerChannel('/ws/stats');
    this.registerChannel('/ws/story');
    this.registerChannel('/ws/claude');
    this.registerChannel('/ws/git');
    this.registerChannel('/ws/messages');

    // MSSCI-12227: Register separate channels per PRD spec
    this.registerChannel('/context');
    this.registerChannel('/agent');
    this.registerChannel('/gearshift');
    this.registerChannel('/story');
  }

  /**
   * Register a same-process listener for stats updates.
   * Used by the sidebar provider to receive updates without WebSocket.
   */
  onStats(listener: StatsListener): () => void {
    this.statsListeners.add(listener);
    return () => {
      this.statsListeners.delete(listener);
    };
  }

  /**
   * Register a same-process listener for message updates.
   * Used by the chat participant to receive Claude responses.
   */
  onMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * MSSCI-12227: Register a same-process listener for context updates.
   */
  onContext(listener: ContextListener): () => void {
    this.contextListeners.add(listener);
    return () => {
      this.contextListeners.delete(listener);
    };
  }

  /**
   * MSSCI-12227: Register a same-process listener for agent updates.
   */
  onAgent(listener: AgentListener): () => void {
    this.agentListeners.add(listener);
    return () => {
      this.agentListeners.delete(listener);
    };
  }

  /**
   * MSSCI-12227: Register a same-process listener for gearshift updates.
   */
  onGearshift(listener: GearshiftListener): () => void {
    this.gearshiftListeners.add(listener);
    return () => {
      this.gearshiftListeners.delete(listener);
    };
  }

  /**
   * MSSCI-12227: Register a same-process listener for story updates.
   */
  onStory(listener: StoryListener): () => void {
    this.storyListeners.add(listener);
    return () => {
      this.storyListeners.delete(listener);
    };
  }

  /**
   * Register a WebSocket channel path.
   */
  registerChannel(path: string): void {
    this.registeredChannels.add(path);
    if (!this.channels.has(path)) {
      this.channels.set(path, new Set());
    }
  }

  /**
   * Check if a channel is registered.
   */
  hasChannel(path: string): boolean {
    return this.registeredChannels.has(path);
  }

  /**
   * Handle a new WebSocket connection on a channel.
   */
  handleConnection(path: string, ws: WebSocket): void {
    // Ensure channel exists
    if (!this.channels.has(path)) {
      this.channels.set(path, new Set());
    }

    const clients = this.channels.get(path)!;
    clients.add(ws);

    // Send initial payload based on channel type
    if (path === '/ws/stats') {
      this.sendInitialStats(ws);
    }

    // Set up message handler for claude channel
    if (path === '/ws/claude') {
      ws.on('message', (data: Buffer | string) => {
        this.handleClaudeMessage(ws, data);
      });
    }

    // Remove client on close
    ws.on('close', () => {
      clients.delete(ws);
    });

    // Remove client on error
    ws.on('error', () => {
      clients.delete(ws);
    });
  }

  /**
   * Send initial stats payload to a newly connected client.
   */
  private sendInitialStats(ws: WebSocket): void {
    const initialStats = {
      type: 'stats',
      agent: null,
      phase: null,
      timestamp: new Date().toISOString(),
    };
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      ws.send(JSON.stringify(initialStats));
    }
  }

  /**
   * Handle incoming Claude WebSocket message.
   */
  private handleClaudeMessage(ws: WebSocket, data: Buffer | string): void {
    try {
      const msg = JSON.parse(data.toString()) as ClaudeWebSocketMessage;

      switch (msg.type) {
        case 'send':
          // Route to Claude service (to be integrated)
          // For now, acknowledge receipt
          break;

        case 'abort':
          // Handle abort request
          break;

        case 'clear':
          // Clear session
          break;

        case 'setMode':
          // Set permission mode
          break;
      }
    } catch (err) {
      // Invalid message format - log but don't crash
      console.error('[WebSocketManager] Error parsing message:', err);
    }
  }

  /**
   * Broadcast stats update to all connected stats clients and same-process listeners.
   */
  broadcastStats(data: StatsData): void {
    // Notify same-process listeners (sidebar provider)
    for (const listener of this.statsListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[WebSocketManager] Error in stats listener:', err);
      }
    }

    // Notify WebSocket clients
    const clients = this.channels.get('/ws/stats');
    if (!clients) return;

    const message = JSON.stringify({
      type: 'stats',
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  /**
   * Broadcast story update to all connected story clients and same-process listeners.
   * Story data is also included in stats broadcasts.
   */
  broadcastStory(data: StatsData['story']): void {
    // Notify stats listeners with story data (they handle story extraction)
    for (const listener of this.statsListeners) {
      try {
        listener({ story: data });
      } catch (err) {
        console.error('[WebSocketManager] Error in stats listener:', err);
      }
    }

    // Notify WebSocket clients on story channel
    const clients = this.channels.get('/ws/story');
    if (!clients) return;

    const message = JSON.stringify({
      type: 'story',
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  /**
   * Broadcast message update to all connected message clients and same-process listeners.
   */
  broadcastMessages(data: MessageData): void {
    // Notify same-process listeners (chat participant)
    for (const listener of this.messageListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[WebSocketManager] Error in message listener:', err);
      }
    }

    // Notify WebSocket clients
    const clients = this.channels.get('/ws/messages');
    if (!clients) return;

    const message = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  /**
   * MSSCI-12227: Broadcast context data to /context channel subscribers.
   */
  broadcastContext(data: ContextData): void {
    // Notify same-process listeners
    for (const listener of this.contextListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[WebSocketManager] Error in context listener:', err);
      }
    }

    // Notify WebSocket clients on /context channel
    const clients = this.channels.get('/context');
    if (!clients) return;

    const message = JSON.stringify({
      type: 'context',
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  /**
   * MSSCI-12227: Broadcast agent data to /agent channel subscribers.
   */
  broadcastAgent(data: AgentData): void {
    // Notify same-process listeners
    for (const listener of this.agentListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[WebSocketManager] Error in agent listener:', err);
      }
    }

    // Notify WebSocket clients on /agent channel
    const clients = this.channels.get('/agent');
    if (!clients) return;

    const message = JSON.stringify({
      type: 'agent',
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  /**
   * MSSCI-12227: Broadcast gearshift data to /gearshift channel subscribers.
   */
  broadcastGearshift(data: GearshiftData): void {
    // Notify same-process listeners
    for (const listener of this.gearshiftListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[WebSocketManager] Error in gearshift listener:', err);
      }
    }

    // Notify WebSocket clients on /gearshift channel
    const clients = this.channels.get('/gearshift');
    if (!clients) return;

    const message = JSON.stringify({
      type: 'gearshift',
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  /**
   * MSSCI-12227: Broadcast story data to /story channel subscribers.
   */
  broadcastStoryUpdate(data: StoryData): void {
    // Notify same-process listeners
    for (const listener of this.storyListeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[WebSocketManager] Error in story listener:', err);
      }
    }

    // Notify WebSocket clients on /story channel
    const clients = this.channels.get('/story');
    if (!clients) return;

    const message = JSON.stringify({
      type: 'story',
      ...data,
      timestamp: new Date().toISOString(),
    });

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  /**
   * MSSCI-12227: Get the current connection state (AC3).
   */
  getConnectionState(): 'connecting' | 'connected' | 'disconnected' {
    return this.connectionState;
  }

  /**
   * Close all client connections on a channel.
   */
  closeChannel(path: string): void {
    const clients = this.channels.get(path);
    if (!clients) return;

    for (const client of clients) {
      client.close();
    }
    clients.clear();
  }

  /**
   * Close all client connections across all channels.
   */
  closeAll(): void {
    for (const [path] of this.channels) {
      this.closeChannel(path);
    }
  }

  /**
   * Get all registered channel paths.
   */
  getChannels(): string[] {
    return Array.from(this.registeredChannels);
  }

  /**
   * Check if there are any message listeners registered.
   */
  hasMessageListeners(): boolean {
    return this.messageListeners.size > 0;
  }
}
