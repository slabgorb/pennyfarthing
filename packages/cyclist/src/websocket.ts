import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { watch, existsSync } from 'fs';
import { join } from 'path';
import { getCurrentStats, getStatsClients, updatePwd } from './api/stats.js';
import { getPersonaClients, broadcastPersona } from './api/persona.js';
import { getTokenStatsClients } from './api/token-stats.js';
import { getBackgroundTaskClients } from './api/background-tasks.js';
import { getBellClients } from './api/bell.js';
import { getWelcomeClients } from './api/welcome.js';
import { addHookClient, handleHookWebSocketMessage } from './api/hook-request.js';
import { getTokenStats, getBackgroundTasks, addToolEventListener, type ToolEvent } from './otlp-receiver.js';
import { getEnrichedSpans } from './enriched-span-exporter.js';
import { detectPennyfarthingProject, getCurrentPersona, watchAgentChanges } from './pennyfarthing.js';
import { ClaudeService, type PermissionMode } from './claude-service.js';
import { publicDir } from './paths.js';
import { getOtelConfig } from './server.js';
import { getStoryInfo } from './story-parser.js';
import { getAllReposGitInfoAsync, getReposFromConfig } from './api/git.js';
import { getSettingsForWebSocket } from './api/settings.js';
import { getContextUsage, type ContextInfo } from './api/context.js';

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

// Story WebSocket clients (MSSCI-11943)
const storyClients = new Set<WebSocket>();

// Git WebSocket clients (MSSCI-11943)
const gitClients = new Set<WebSocket>();

// Spans WebSocket clients (real-time debugging)
const spansClients = new Set<WebSocket>();

// Settings WebSocket clients (bidirectional sync between ControlBar and SettingsPanel)
const settingsClients = new Set<WebSocket>();

// Context WebSocket clients (Phase 2: context usage percentage)
const contextClients = new Set<WebSocket>();

// Debounce timer for livereload
let livereloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const LIVERELOAD_DEBOUNCE_MS = 100;

// Debounce timers for story and git (MSSCI-11943)
let storyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let gitCoalesceTimer: ReturnType<typeof setTimeout> | null = null;
let settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let contextDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const STORY_DEBOUNCE_MS = 100; // AC1: 100ms debounce for story
const GIT_COALESCE_MS = 500;   // AC2: 500ms coalesce for git
const SETTINGS_DEBOUNCE_MS = 100; // Settings debounce for config.local.yaml changes
const CONTEXT_DEBOUNCE_MS = 2000; // Context debounce (expensive operation)

// Callbacks for IPC broadcast bridge (MSSCI-12782 fix)
// These allow main.ts to receive updates for Electron IPC broadcast
type StoryUpdateCallback = (storyInfo: ReturnType<typeof getStoryInfo>) => void;
type GitUpdateCallback = (reposInfo: Awaited<ReturnType<typeof getAllReposGitInfoAsync>>) => void;
let storyUpdateCallback: StoryUpdateCallback | null = null;
let gitUpdateCallback: GitUpdateCallback | null = null;

/**
 * Register callback to receive story updates for IPC broadcast
 * Called by main.ts to bridge WebSocket updates to Electron IPC
 */
export function setStoryUpdateCallback(callback: StoryUpdateCallback): void {
  storyUpdateCallback = callback;
}

/**
 * Register callback to receive git updates for IPC broadcast
 * Called by main.ts to bridge WebSocket updates to Electron IPC
 */
export function setGitUpdateCallback(callback: GitUpdateCallback): void {
  gitUpdateCallback = callback;
}

// Export client getters for external use
export function getStoryClients(): Set<WebSocket> {
  return storyClients;
}

export function getGitClients(): Set<WebSocket> {
  return gitClients;
}

export function getSpansClients(): Set<WebSocket> {
  return spansClients;
}

export function getSettingsClients(): Set<WebSocket> {
  return settingsClients;
}

export function getContextClients(): Set<WebSocket> {
  return contextClients;
}

// Setup WebSocket servers for stats and persona updates
export function setupWebSocketServers(
  server: Server,
  getProjectDir: () => string
): void {
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

  // WebSocket server for background tasks at /ws/background-tasks (Story 35-16)
  const backgroundTasksWss = new WebSocketServer({ noServer: true });

  // WebSocket server for story updates at /ws/story (MSSCI-11943)
  const storyWss = new WebSocketServer({ noServer: true });

  // WebSocket server for git updates at /ws/git (MSSCI-11943)
  const gitWss = new WebSocketServer({ noServer: true });

  // WebSocket server for bell mode at /ws/bell (bell-consumed events)
  const bellWss = new WebSocketServer({ noServer: true });

  // WebSocket server for spans at /ws/spans (real-time debugging)
  const spansWss = new WebSocketServer({ noServer: true });

  // WebSocket server for welcome messages at /ws/welcome
  const welcomeWss = new WebSocketServer({ noServer: true });

  // WebSocket server for hook requests at /ws/hooks (MSSCI-12409)
  const hooksWss = new WebSocketServer({ noServer: true });

  // WebSocket server for settings at /ws/settings (bidirectional sync)
  const settingsWss = new WebSocketServer({ noServer: true });

  // WebSocket server for context at /ws/context (Phase 2: context usage)
  const contextWss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/stats') {
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
    } else if (pathname === '/ws/background-tasks') {
      backgroundTasksWss.handleUpgrade(request, socket, head, (ws) => {
        backgroundTasksWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/story') {
      storyWss.handleUpgrade(request, socket, head, (ws) => {
        storyWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/git') {
      gitWss.handleUpgrade(request, socket, head, (ws) => {
        gitWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/bell') {
      bellWss.handleUpgrade(request, socket, head, (ws) => {
        bellWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/spans') {
      spansWss.handleUpgrade(request, socket, head, (ws) => {
        spansWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/welcome') {
      welcomeWss.handleUpgrade(request, socket, head, (ws) => {
        welcomeWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/hooks') {
      hooksWss.handleUpgrade(request, socket, head, (ws) => {
        hooksWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/settings') {
      settingsWss.handleUpgrade(request, socket, head, (ws) => {
        settingsWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/context') {
      contextWss.handleUpgrade(request, socket, head, (ws) => {
        contextWss.emit('connection', ws, request);
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

  // Handle background tasks WebSocket connections (Story 35-16)
  const backgroundTaskClients = getBackgroundTaskClients();
  backgroundTasksWss.on('connection', (ws: WebSocket) => {
    // Add client to broadcast set
    backgroundTaskClients.add(ws);

    // Send initial tasks on connection
    const tasks = getBackgroundTasks();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', tasks }));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      backgroundTaskClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      backgroundTaskClients.delete(ws);
    });
  });

  // Handle story WebSocket connections (MSSCI-11943)
  storyWss.on('connection', (ws: WebSocket) => {
    // Add client to broadcast set
    storyClients.add(ws);

    // Send initial story data on connection
    const projectDir = getProjectDir();
    const storyInfo = getStoryInfo(projectDir);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', ...storyInfo }));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      storyClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      storyClients.delete(ws);
    });
  });

  // Handle git WebSocket connections (MSSCI-11943)
  // Updated to send multi-repo data for sidebar REPOS section
  gitWss.on('connection', async (ws: WebSocket) => {
    // Add client to broadcast set
    gitClients.add(ws);

    // Send initial git data on connection (multi-repo) - async to avoid blocking
    const projectDir = getProjectDir();
    const allReposInfo = await getAllReposGitInfoAsync(projectDir);
    console.log('[Git WS] New connection, sending init with', allReposInfo.length, 'repos');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', repos: allReposInfo }));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      gitClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      gitClients.delete(ws);
    });
  });

  // Handle bell WebSocket connections (for bell-consumed events)
  const bellClients = getBellClients();
  bellWss.on('connection', (ws: WebSocket) => {
    // Add client to broadcast set
    bellClients.add(ws);

    // Remove client on disconnect
    ws.on('close', () => {
      bellClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      bellClients.delete(ws);
    });
  });

  // Handle spans WebSocket connections (real-time debugging)
  spansWss.on('connection', async (ws: WebSocket) => {
    console.log('[WebSocket] Spans client connected');
    spansClients.add(ws);

    // Send initial spans on connection
    try {
      const spans = await getEnrichedSpans();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'init', spans }));
      }
    } catch (err) {
      console.error('[WebSocket] Error fetching initial spans:', err);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'init', spans: [] }));
      }
    }

    // Remove client on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Spans client disconnected');
      spansClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      spansClients.delete(ws);
    });
  });

  // Handle welcome WebSocket connections
  const welcomeClients = getWelcomeClients();
  welcomeWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Welcome client connected');
    welcomeClients.add(ws);

    // Remove client on disconnect
    ws.on('close', () => {
      welcomeClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      welcomeClients.delete(ws);
    });
  });

  // Handle hooks WebSocket connections (MSSCI-12409: WheelHub consolidation)
  hooksWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Hook client connected');
    addHookClient(ws);

    // Handle messages from client (approval responses)
    ws.on('message', (data: Buffer) => {
      handleHookWebSocketMessage(ws, data.toString());
    });

    // Handle errors gracefully
    ws.on('error', (err) => {
      console.error('[WebSocket] Hook client error:', err);
    });
  });

  // Handle settings WebSocket connections (bidirectional sync)
  settingsWss.on('connection', async (ws: WebSocket) => {
    console.log('[WebSocket] Settings client connected');
    settingsClients.add(ws);

    // Send initial settings on connection
    try {
      const settings = await getSettingsForWebSocket(getProjectDir());
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'init', settings }));
      }
    } catch (err) {
      console.error('[WebSocket] Error fetching initial settings:', err);
    }

    // Remove client on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Settings client disconnected');
      settingsClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      settingsClients.delete(ws);
    });
  });

  // Handle context WebSocket connections (Phase 2: context usage)
  contextWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Context client connected');
    contextClients.add(ws);

    // Send initial context on connection
    const projectDir = getProjectDir();
    const context = getContextUsage(projectDir);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', context }));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Context client disconnected');
      contextClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      contextClients.delete(ws);
    });
  });

  // Set up tool event listener to broadcast new spans to WebSocket clients
  // Also track pwd from Bash commands for stats-strip display
  // Also trigger context updates when tool events arrive
  addToolEventListener((event: ToolEvent) => {
    // Broadcast span to spans WebSocket clients
    const message = JSON.stringify({ type: 'span', span: event });
    for (const client of spansClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }

    // Track pwd from Bash tool completions
    if (event.toolName === 'Bash' && event.workingDirectory) {
      updatePwd(event.workingDirectory);
    }

    // Trigger debounced context update when tool events arrive
    // This indicates Claude activity that may change context usage
    if (contextClients.size > 0) {
      if (contextDebounceTimer) {
        clearTimeout(contextDebounceTimer);
      }
      contextDebounceTimer = setTimeout(() => {
        const projectDir = getProjectDir();
        const context = getContextUsage(projectDir);
        broadcastContextUpdate(context);
        contextDebounceTimer = null;
      }, CONTEXT_DEBOUNCE_MS);
    }
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

  // Set up story file watcher (MSSCI-11943: AC1 - broadcast on sprint/*.yaml changes)
  const sprintDir = join(projectDir, 'sprint');
  if (existsSync(sprintDir)) {
    try {
      watch(sprintDir, { recursive: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.yaml')) return;

        // Debounce rapid changes (100ms per AC1)
        if (storyDebounceTimer) {
          clearTimeout(storyDebounceTimer);
        }

        storyDebounceTimer = setTimeout(() => {
          const storyInfo = getStoryInfo(projectDir);
          broadcastStoryUpdate(storyInfo);
          storyDebounceTimer = null;
        }, STORY_DEBOUNCE_MS);
      });
    } catch (err) {
      console.error('[WebSocket] Failed to set up story file watcher:', err);
    }
  }

  // Set up session file watcher (MSSCI-12237: Story Status Tree View)
  // Watch .session/*-session.md files and broadcast updates via /ws/story
  const sessionDir = join(projectDir, '.session');
  if (existsSync(sessionDir)) {
    try {
      watch(sessionDir, { recursive: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('-session.md')) return;

        // Debounce rapid changes (100ms like sprint watcher)
        if (storyDebounceTimer) {
          clearTimeout(storyDebounceTimer);
        }

        storyDebounceTimer = setTimeout(() => {
          const storyInfo = getStoryInfo(projectDir);
          broadcastStoryUpdate(storyInfo);
          storyDebounceTimer = null;
        }, STORY_DEBOUNCE_MS);
      });
    } catch (err) {
      console.error('[WebSocket] Failed to set up session file watcher:', err);
    }
  }

  // Set up git file watchers for all configured repos
  // (MSSCI-11943: AC2 - broadcast on .git/HEAD and .git/index changes)
  const repos = getReposFromConfig(projectDir);
  for (const repo of repos) {
    const repoPath = join(projectDir, repo.path);
    const gitDir = join(repoPath, '.git');
    if (!existsSync(gitDir)) continue;

    try {
      // Watch .git/HEAD for branch switches
      const headPath = join(gitDir, 'HEAD');
      if (existsSync(headPath)) {
        watch(headPath, (eventType) => {
          if (eventType !== 'change') return;
          triggerGitUpdate(projectDir);
        });
      }

      // Watch .git/index for staging changes
      const indexPath = join(gitDir, 'index');
      if (existsSync(indexPath)) {
        watch(indexPath, (eventType) => {
          if (eventType !== 'change') return;
          triggerGitUpdate(projectDir);
        });
      }
    } catch (err) {
      console.error(`[WebSocket] Failed to set up git file watchers for ${repo.name}:`, err);
    }
  }

  // Set up settings file watcher for config.local.yaml changes
  // This enables real-time bidirectional sync between ControlBar and SettingsPanel
  const configLocalPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
  if (existsSync(join(projectDir, '.pennyfarthing'))) {
    try {
      watch(join(projectDir, '.pennyfarthing'), { recursive: false }, (eventType, filename) => {
        if (!filename || filename !== 'config.local.yaml') return;

        // Debounce rapid changes
        if (settingsDebounceTimer) {
          clearTimeout(settingsDebounceTimer);
        }

        settingsDebounceTimer = setTimeout(async () => {
          try {
            const settings = await getSettingsForWebSocket(projectDir);
            broadcastSettingsUpdate(settings);
          } catch (err) {
            console.error('[WebSocket] Failed to broadcast settings update:', err);
          }
          settingsDebounceTimer = null;
        }, SETTINGS_DEBOUNCE_MS);
      });
      console.log('[WebSocket] Settings file watcher set up for config.local.yaml');
    } catch (err) {
      console.error('[WebSocket] Failed to set up settings file watcher:', err);
    }
  }

  // Handle Claude WebSocket connections (web mode)
  claudeWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Claude client connected');

    // Create a new ClaudeService instance for this connection
    const projectDir = getProjectDir();
    const otelConfig = getOtelConfig(projectDir);
    const service = new ClaudeService({ cwd: projectDir, env: otelConfig ?? undefined });
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

// MSSCI-11943: Broadcast story update to all connected clients
function broadcastStoryUpdate(storyInfo: ReturnType<typeof getStoryInfo>): void {
  const message = JSON.stringify({ type: 'update', ...storyInfo });
  for (const client of storyClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
  // Bridge to Electron IPC for panel updates
  if (storyUpdateCallback) {
    storyUpdateCallback(storyInfo);
  }
}

// MSSCI-11943: Broadcast git update to all connected clients (multi-repo)
function broadcastGitUpdate(allReposInfo: Awaited<ReturnType<typeof getAllReposGitInfoAsync>>): void {
  const message = JSON.stringify({ type: 'update', repos: allReposInfo });
  for (const client of gitClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
  // Bridge to Electron IPC for panel updates
  if (gitUpdateCallback) {
    gitUpdateCallback(allReposInfo);
  }
}

// MSSCI-11943: Trigger git update with coalescing (500ms per AC2)
// Now async to avoid blocking the event loop during git commands
function triggerGitUpdate(projectDir: string): void {
  if (gitCoalesceTimer) {
    clearTimeout(gitCoalesceTimer);
  }

  gitCoalesceTimer = setTimeout(async () => {
    const allReposInfo = await getAllReposGitInfoAsync(projectDir);
    broadcastGitUpdate(allReposInfo);
    gitCoalesceTimer = null;
  }, GIT_COALESCE_MS);
}

// Broadcast settings update to all connected clients
// Exported for use by settings API after PATCH
export function broadcastSettingsUpdate(settings: unknown): void {
  const message = JSON.stringify({ type: 'update', settings });
  for (const client of settingsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Broadcast context update to all connected clients
// Exported for use by OTLP receiver after tool events
export function broadcastContextUpdate(context: ContextInfo): void {
  const message = JSON.stringify({ type: 'update', context });
  for (const client of contextClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
