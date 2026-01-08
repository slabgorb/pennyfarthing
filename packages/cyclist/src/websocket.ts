import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { watch } from 'fs';
import { getCurrentStats, getStatsClients } from './api/stats.js';
import { getPersonaClients, broadcastPersona } from './api/persona.js';
import { getTokenStatsClients } from './api/token-stats.js';
import { getTokenStats } from './otlp-receiver.js';
import { detectPennyfarthingProject, getCurrentPersona, watchAgentChanges } from './pennyfarthing.js';
import { ClaudeService, type SDKMessage, type PermissionMode } from './claude-service.js';
import { publicDir } from './paths.js';

// WebSocket message types for Claude communication
interface ClaudeWebSocketMessage {
  type: 'send' | 'abort' | 'clear' | 'setMode';
  prompt?: string;
  mode?: PermissionMode;
}

// Track Claude sessions per WebSocket connection
const claudeSessions = new Map<WebSocket, ClaudeService>();

// Livereload clients
const livereloadClients = new Set<WebSocket>();

// Debounce timer for livereload
let livereloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const LIVERELOAD_DEBOUNCE_MS = 100;

// Setup WebSocket servers for stats and persona updates
export function setupWebSocketServers(
  server: Server,
  getProjectDir: () => string
): void {
  // WebSocket server for terminal at /ws (deprecated but kept for compatibility)
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket server for stats at /ws/stats
  const statsWss = new WebSocketServer({ noServer: true });

  // WebSocket server for persona at /ws/persona
  const personaWss = new WebSocketServer({ noServer: true });

  // WebSocket server for token stats at /ws/token-stats
  const tokenStatsWss = new WebSocketServer({ noServer: true });

  // WebSocket server for Claude at /ws/claude (web mode)
  const claudeWss = new WebSocketServer({ noServer: true });

  // WebSocket server for livereload at /ws/livereload (dev mode)
  const livereloadWss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/stats') {
      statsWss.handleUpgrade(request, socket, head, (ws) => {
        statsWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/persona') {
      personaWss.handleUpgrade(request, socket, head, (ws) => {
        personaWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/token-stats') {
      tokenStatsWss.handleUpgrade(request, socket, head, (ws) => {
        tokenStatsWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/claude') {
      claudeWss.handleUpgrade(request, socket, head, (ws) => {
        claudeWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/livereload') {
      livereloadWss.handleUpgrade(request, socket, head, (ws) => {
        livereloadWss.emit('connection', ws, request);
      });
    } else {
      // Reject connections to other paths
      socket.destroy();
    }
  });

  // Handle stats WebSocket connections
  const statsClients = getStatsClients();
  statsWss.on('connection', (ws: WebSocket) => {
    // Add client to broadcast set
    statsClients.add(ws);

    // Send initial stats on connection
    const currentStats = getCurrentStats();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(currentStats));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      statsClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      statsClients.delete(ws);
    });
  });

  // Handle persona WebSocket connections
  const personaClients = getPersonaClients();
  personaWss.on('connection', (ws: WebSocket) => {
    // Add client to broadcast set
    personaClients.add(ws);

    // Send initial persona on connection
    const projectDir = getProjectDir();
    const sessionId = process.env.CYCLIST_SESSION_ID;
    const persona = getCurrentPersona(projectDir, sessionId);
    if (persona && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(persona));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      personaClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      personaClients.delete(ws);
    });
  });

  // Handle token stats WebSocket connections
  const tokenStatsClients = getTokenStatsClients();
  tokenStatsWss.on('connection', (ws: WebSocket) => {
    // Add client to broadcast set
    tokenStatsClients.add(ws);

    // Send initial token stats on connection
    const tokenStats = getTokenStats();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(tokenStats));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      tokenStatsClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      tokenStatsClients.delete(ws);
    });
  });

  // Set up agent file watcher for persona broadcasts
  const projectDir = getProjectDir();
  const sessionId = process.env.CYCLIST_SESSION_ID;
  if (detectPennyfarthingProject(projectDir)) {
    watchAgentChanges(projectDir, sessionId, (_agentRole: string) => {
      // When agent changes, get the new persona and broadcast
      const persona = getCurrentPersona(projectDir, sessionId);
      if (persona) {
        broadcastPersona(persona);
      }
    });
  }

  // Note: Terminal WebSocket handler removed in E7-5
  // The app now uses Claude SDK in Electron mode instead of PTY
  // This /ws endpoint is kept for potential future use but does nothing
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket /ws connection - deprecated (use Electron mode with Claude SDK)');
    ws.close(1000, 'Terminal mode deprecated - use Electron app');
  });

  // Handle Claude WebSocket connections (web mode)
  claudeWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Claude client connected');

    // Create a new ClaudeService instance for this connection
    const projectDir = getProjectDir();
    const service = new ClaudeService({ cwd: projectDir });
    claudeSessions.set(ws, service);

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClaudeWebSocketMessage;

        switch (msg.type) {
          case 'send':
            if (!msg.prompt) {
              ws.send(JSON.stringify({ type: 'error', error: 'Missing prompt' }));
              return;
            }

            // Stream messages back to client
            try {
              for await (const message of service.sendMessage(msg.prompt)) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'message', message }));
                }
              }
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'complete' }));
              }
            } catch (err) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'error',
                  error: err instanceof Error ? err.message : 'Unknown error'
                }));
              }
            }
            break;

          case 'abort':
            service.abort();
            break;

          case 'clear':
            service.clearSession();
            break;

          case 'setMode':
            if (msg.mode) {
              service.setPermissionMode(msg.mode);
            }
            break;
        }
      } catch (err) {
        console.error('[WebSocket] Error handling message:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      }
    });

    // Cleanup on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Claude client disconnected');
      const service = claudeSessions.get(ws);
      if (service) {
        service.abort(); // Kill any running process
        claudeSessions.delete(ws);
      }
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error('[WebSocket] Claude client error:', err);
      const service = claudeSessions.get(ws);
      if (service) {
        service.abort();
        claudeSessions.delete(ws);
      }
    });
  });

  // Handle livereload WebSocket connections (dev mode only)
  livereloadWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Livereload client connected');
    livereloadClients.add(ws);

    ws.on('close', () => {
      livereloadClients.delete(ws);
    });

    ws.on('error', () => {
      livereloadClients.delete(ws);
    });
  });

  // Set up livereload file watcher in dev mode
  if (process.env.CYCLIST_DEV_WEB === '1') {
    console.log('[Livereload] Watching public directory for changes:', publicDir);

    // Watch the public directory recursively
    try {
      watch(publicDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Skip hidden files and non-relevant changes
        if (filename.startsWith('.')) return;

        console.log(`[Livereload] File changed: ${filename}`);

        // Debounce rapid changes
        if (livereloadDebounceTimer) {
          clearTimeout(livereloadDebounceTimer);
        }

        livereloadDebounceTimer = setTimeout(() => {
          // Broadcast reload to all connected clients
          for (const client of livereloadClients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'reload' }));
            }
          }
          livereloadDebounceTimer = null;
        }, LIVERELOAD_DEBOUNCE_MS);
      });
    } catch (err) {
      console.error('[Livereload] Failed to set up file watcher:', err);
    }
  }
}
