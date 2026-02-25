import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { watch, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getCurrentStats, getStatsClients, updatePwd } from './api/stats.js';
import { getPersonaClients, broadcastPersona, getStreamingState } from './api/persona.js';
import { getTokenStatsClients } from './api/token-stats.js';
import { getBellClients } from './api/bell.js';
import { getWelcomeClients } from './api/welcome.js';
import { addHookClient, handleHookWebSocketMessage } from './api/hook-request.js';
import { getTokenStats, getBackgroundTaskByToolId, addToolEventListener, addTokenStatsListener, getUserEmail, type ToolEvent } from './otlp-receiver.js';
import { getEnrichedSpans } from './enriched-span-exporter.js';
import { detectPennyfarthingProject, getCurrentPersona, watchAgentChanges } from './pennyfarthing.js';
import { publicDir } from './paths.js';
import { getStoryInfo } from './story-parser.js';
import { getSprintData } from './sprint-data.js';
import { getReposFromConfig, type RepoGitInfo, setForceRefreshCallback } from './api/git.js';
import {
  getCachedGitStatus,
  invalidateGitCache,
  forceRefreshGitCache,
  onGitCacheRefresh,
  hasFreshCache,
  getCachedGitStatusSync,
  startPeriodicPoll,
} from './git-cache.js';
import { getSettingsForWebSocket } from './api/settings.js';
import { getCurrentSettings, initializeSettings, onSettingsChange } from './settings.js';
import { getContextUsage, type ContextInfo } from './api/context.js';
import { getConfigFocus, shouldBroadcastFocus, createFocusMessage } from './focus.js';
import {
  getAllGitDiffs,
  onDiffCacheRefresh,
  invalidateDiffCache,
  type GitDiffData,
} from './git-diff.js';

// =============================================================================
// Subagent Message Enrichment
// =============================================================================

/**
 * Enrich SDK message with subagent context.
 * If message has parent_tool_use_id, look up the Task that spawned it
 * and add subagent_type and subagent_name for UI display.
 */
function _enrichMessageWithSubagentContext(message: Record<string, unknown>): Record<string, unknown> {
  const parentId = (message as { parent_tool_use_id?: string | null }).parent_tool_use_id;
  if (!parentId) return message;

  const task = getBackgroundTaskByToolId(parentId);
  if (!task) return message;

  return {
    ...message,
    subagent_type: task.subagentType,
    subagent_name: task.description,
  };
}

// =============================================================================
// Git Cache Invalidation Logic
// =============================================================================

/**
 * Determine if a tool event should trigger git cache invalidation.
 * Only invalidate when files are actually modified - not for read-only operations.
 */
function shouldInvalidateGitCache(event: ToolEvent): boolean {
  // Only successful operations can change git status
  if (!event.success) {
    return false;
  }

  // Edit/Write always modify files when successful
  if (event.toolName === 'Edit' || event.toolName === 'Write') {
    return true;
  }

  // Bash: check if it's a git command or file-modifying command
  if (event.toolName === 'Bash' && event.input) {
    const cmd = event.input.trim();

    // Git commands that change state
    // Handles: git add, git -C <path> add, cd foo && git commit, etc.
    if (/\bgit\s+(?:-[A-Za-z]\s+\S+\s+)*(?:add|commit|checkout|reset|stash|merge|rebase|cherry-pick|revert|pull|fetch|push|branch\s+-[dD]|rm|mv|restore|switch|clean)\b/i.test(cmd)) {
      return true;
    }

    // File-modifying commands (can appear after && or ;)
    if (/(?:^|[;&|]\s*)(rm|mv|cp|touch|mkdir|rmdir|chmod|chown)\s/i.test(cmd)) {
      return true;
    }

    // Redirections that create/modify files
    if (/[>|]/.test(cmd) && !/^\s*(cat|echo|printf)\s.*\|\s*(grep|awk|sed|head|tail|wc|sort|uniq)/.test(cmd)) {
      // Has redirect but isn't just piping to a filter
      if (/>\s*[^|&]/.test(cmd)) {
        return true;
      }
    }

    // npm/pnpm install can modify package-lock.json (can appear after && or ;)
    if (/(?:^|[;&|]\s*)(npm|pnpm|yarn)\s+(install|add|remove|uninstall)/i.test(cmd)) {
      return true;
    }
  }

  return false;
}

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

// Todos WebSocket clients (MSSCI-TODO: todos via WebSocket instead of REST polling)
const todosClients = new Set<WebSocket>();

// Sprint WebSocket clients (MSSCI-14189: Enhanced Sprint Panel)
const sprintClients = new Set<WebSocket>();

// Diffs WebSocket clients (MSSCI-14238: Git-based diffs)
const diffsClients = new Set<WebSocket>();

// Focus WebSocket clients (MSSCI-14976: panel focus broadcast)
const focusClients = new Set<WebSocket>();
let lastKnownFocus: string | null = null;

// In-memory todos store (for initial send on connection)
interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
  blockedBy?: string[];
  blocks?: string[];
}
let currentTodos: TodoItem[] = [];

// Debounce timer for livereload
let livereloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const LIVERELOAD_DEBOUNCE_MS = 100;

// Debounce timers for story and git (MSSCI-11943)
let storyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let contextDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const STORY_DEBOUNCE_MS = 100; // AC1: 100ms debounce for story
const SETTINGS_DEBOUNCE_MS = 100; // Settings debounce for config.local.yaml changes
const CONTEXT_DEBOUNCE_MS = 500; // 121-1: Reduced from 2000ms for near-real-time token tracking

// Callbacks for IPC broadcast bridge (MSSCI-12782 fix)
// These allow main.ts to receive updates for Electron IPC broadcast
type StoryUpdateCallback = (storyInfo: ReturnType<typeof getStoryInfo>) => void;
type GitUpdateCallback = (reposInfo: RepoGitInfo[]) => void;
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

export function getTodosClients(): Set<WebSocket> {
  return todosClients;
}

export function getSprintClients(): Set<WebSocket> {
  return sprintClients;
}

export function getFocusClients(): Set<WebSocket> {
  return focusClients;
}

// =============================================================================
// Todos Callback (Electron Mode Bridge)
// =============================================================================
// In Electron mode, main.ts updates todos when TodoWrite messages arrive.
/**
 * Broadcast todos update to all connected WebSocket clients
 * Called by main.ts when todos state changes
 */
export function broadcastTodosUpdate(todos: TodoItem[]): void {
  currentTodos = todos;
  const message = JSON.stringify({ type: 'update', todos });
  for (const client of todosClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Track whether git file watchers have been set up (avoid duplicates)
let gitFileWatchersActive = false;

/**
 * Set up file watchers for .git/ directories in all configured repos.
 * Watches HEAD, index, FETCH_HEAD, and refs/heads/ for changes.
 * Idempotent — skips if watchers are already active.
 */
function setupGitFileWatchers(projectDir: string, getProjectDir: () => string): void {
  if (gitFileWatchersActive) {
    console.log('[WebSocket] Git file watchers already active — skipping setup');
    return;
  }

  const repos = getReposFromConfig(projectDir);
  for (const repo of repos) {
    const repoPath = join(projectDir, repo.path);
    const gitDir = join(repoPath, '.git');
    if (!existsSync(gitDir)) continue;

    try {
      // Watch .git/HEAD for branch switches
      const headPath = join(gitDir, 'HEAD');
      if (existsSync(headPath)) {
        watch(headPath, async (eventType) => {
          if (eventType !== 'change') return;
          console.log(`[Git Cache] Branch switch detected in ${repo.name}`);
          await forceRefreshGitCache(getProjectDir());
        });
      }

      // Watch .git/index for staging changes
      const indexPath = join(gitDir, 'index');
      if (existsSync(indexPath)) {
        watch(indexPath, (eventType) => {
          if (eventType !== 'change') return;
          console.log(`[Git Cache] Index change detected in ${repo.name}`);
          invalidateGitCache(getProjectDir());
        });
      }

      // Watch .git/FETCH_HEAD for fetch completions
      const fetchHeadPath = join(gitDir, 'FETCH_HEAD');
      if (existsSync(fetchHeadPath)) {
        watch(fetchHeadPath, (eventType) => {
          if (eventType !== 'change') return;
          console.log(`[Git Cache] FETCH_HEAD change detected in ${repo.name}`);
          invalidateGitCache(getProjectDir());
        });
      }

      // Watch .git/refs/heads/ for local branch updates
      const refsHeadsDir = join(gitDir, 'refs', 'heads');
      if (existsSync(refsHeadsDir)) {
        watch(refsHeadsDir, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          console.log(`[Git Cache] Ref change detected in ${repo.name}: refs/heads/${filename}`);
          invalidateGitCache(getProjectDir());
        });
      }
    } catch (err) {
      console.error(`[WebSocket] Failed to set up git file watchers for ${repo.name}:`, err);
    }
  }
  gitFileWatchersActive = true;
  console.log('[WebSocket] Git file watchers set up for', repos.length, 'repos');
}

// Setup WebSocket servers for stats and persona updates
export function setupWebSocketServers(
  server: Server,
  getProjectDir: () => string
): void {
  // Re-initialize settings with the correct project directory.
  // Core's server.ts calls initializeSettings() at module load time before
  // the project directory is properly resolved, so defaults persist.
  // This re-read picks up the actual config.local.yaml values.
  const projectDirForSettings = getProjectDir();
  initializeSettings(projectDirForSettings);

  // WebSocket server for stats at /ws/stats
  const statsWss = new WebSocketServer({ noServer: true });

  // WebSocket server for persona at /ws/persona
  const personaWss = new WebSocketServer({ noServer: true });

  // WebSocket server for token stats at /ws/token-stats
  const tokenStatsWss = new WebSocketServer({ noServer: true });

  // WebSocket server for livereload at /ws/livereload (dev mode)
  const livereloadWss = new WebSocketServer({ noServer: true });

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

  // WebSocket server for todos at /ws/todos (replaces REST polling)
  const todosWss = new WebSocketServer({ noServer: true });

  // WebSocket server for sprint at /ws/sprint (MSSCI-14189: Enhanced Sprint Panel)
  const sprintWss = new WebSocketServer({ noServer: true });

  // WebSocket server for diffs at /ws/diffs (MSSCI-14238: Git-based diffs)
  const diffsWss = new WebSocketServer({ noServer: true });

  // WebSocket server for focus at /ws/focus (MSSCI-14976: panel focus)
  const focusWss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    // Security: Validate WebSocket origin to prevent cross-site WebSocket hijacking (#888)
    const origin = request.headers.origin;
    if (origin) {
      const allowed = ['http://localhost', 'http://127.0.0.1'];
      if (!allowed.some(a => origin.startsWith(a))) {
        console.warn(`[WebSocket] Rejected connection from origin: ${origin}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }

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
    } else if (pathname === '/ws/livereload') {
      livereloadWss.handleUpgrade(request, socket, head, (ws) => {
        livereloadWss.emit('connection', ws, request);
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
    } else if (pathname === '/ws/todos') {
      todosWss.handleUpgrade(request, socket, head, (ws) => {
        todosWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/sprint') {
      sprintWss.handleUpgrade(request, socket, head, (ws) => {
        sprintWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/diffs') {
      diffsWss.handleUpgrade(request, socket, head, (ws) => {
        diffsWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/focus') {
      focusWss.handleUpgrade(request, socket, head, (ws) => {
        focusWss.emit('connection', ws, request);
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

    // Send initial persona on connection (includes isStreaming state per Story 94-1)
    const projectDir = getProjectDir();
    const sessionId = process.env.CYCLIST_SESSION_ID;
    const persona = getCurrentPersona(projectDir, sessionId);
    if (persona && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...persona, isStreaming: getStreamingState() }));
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

  // 121-1: Trigger debounced context refresh on token stats changes
  // OTLP metrics arrive on API call completion — use these to also refresh context
  // so context percentage stays in sync with token burn rate
  addTokenStatsListener(() => {
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
  // Now uses git-cache to prevent lock conflicts
  gitWss.on('connection', async (ws: WebSocket) => {
    // Add client to broadcast set
    gitClients.add(ws);

    // Send initial git data on connection (multi-repo) - uses cache to avoid lock conflicts
    const projectDir = getProjectDir();
    const gitMonitorEnabled = getCurrentSettings().workflow?.git_monitor === true;

    // If git_monitor is disabled, send empty data
    if (!gitMonitorEnabled) {
      console.log('[Git WS] New connection, git_monitor disabled — sending empty init');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'init', repos: [] }));
      }
    } else {
      // If we have fresh cache, send it immediately; otherwise fetch
      let allReposInfo;
      if (hasFreshCache(projectDir)) {
        allReposInfo = getCachedGitStatusSync(projectDir);
        console.log('[Git WS] New connection, sending cached init with', allReposInfo.length, 'repos');
      } else {
        allReposInfo = await getCachedGitStatus(projectDir);
        console.log('[Git WS] New connection, sending fresh init with', allReposInfo.length, 'repos');
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'init', repos: allReposInfo }));
      }
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

  // Handle focus WebSocket connections (MSSCI-14976: panel focus)
  focusWss.on('connection', (ws: WebSocket) => {
    focusClients.add(ws);

    // Send initial focus state on connection
    const focus = getConfigFocus(getProjectDir());
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(createFocusMessage('init', focus)));
    }

    ws.on('close', () => {
      focusClients.delete(ws);
    });

    ws.on('error', () => {
      focusClients.delete(ws);
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

  // Handle todos WebSocket connections (replaces REST polling)
  todosWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Todos client connected');
    todosClients.add(ws);

    // Send existing todos on connection
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', todos: currentTodos }));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Todos client disconnected');
      todosClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      todosClients.delete(ws);
    });
  });

  // Handle sprint WebSocket connections (MSSCI-14189: Enhanced Sprint Panel)
  sprintWss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Sprint client connected');
    sprintClients.add(ws);

    // Send initial sprint data on connection
    const projectDir = getProjectDir();
    const sprintData = getSprintData(projectDir, getUserEmail());
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', ...sprintData }));
    }

    // Remove client on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Sprint client disconnected');
      sprintClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      sprintClients.delete(ws);
    });
  });

  // Handle diffs WebSocket connections (MSSCI-14238: Git-based diffs)
  diffsWss.on('connection', async (ws: WebSocket) => {
    console.log('[WebSocket] Diffs client connected');
    diffsClients.add(ws);

    // Send initial diffs on connection
    const projectDir = getProjectDir();
    const gitMonitorForDiffs = getCurrentSettings().workflow?.git_monitor === true;

    // If git_monitor is disabled, send empty diffs
    if (!gitMonitorForDiffs) {
      console.log('[WebSocket] Diffs git_monitor disabled — sending empty init');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'init', diffs: [] }));
      }
    } else {
      try {
        const diffs = await getAllGitDiffs(projectDir);
        // Transform GitDiffData to DiffData format expected by useDiffs hook
        const transformedDiffs = diffs.map((d: GitDiffData) => ({
          id: `diff-${d.path}-${d.timestamp}`,
          path: d.path,
          original: '', // Git diff doesn't have separate original - it's in the unified diff
          modified: '', // Git diff doesn't have separate modified - it's in the unified diff
          diff: d.diff, // Raw git diff for rendering
          toolName: 'Git',
          timestamp: d.timestamp,
          status: d.status,
          additions: d.additions,
          deletions: d.deletions,
        }));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'init', diffs: transformedDiffs }));
        }
      } catch (err) {
        console.error('[WebSocket] Failed to get initial diffs:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'init', diffs: [] }));
        }
      }
    }

    // Handle clear message from client
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'clear') {
          console.log('[WebSocket] Diffs cleared by client');
          // Note: This is a UI-only clear, the git state remains unchanged
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse diffs message:', err);
      }
    });

    // Remove client on disconnect
    ws.on('close', () => {
      console.log('[WebSocket] Diffs client disconnected');
      diffsClients.delete(ws);
    });

    // Handle errors gracefully
    ws.on('error', () => {
      diffsClients.delete(ws);
    });
  });

  // Set up diff cache refresh callback to broadcast updates
  onDiffCacheRefresh((diffs: GitDiffData[]) => {
    const transformedDiffs = diffs.map((d: GitDiffData) => ({
      id: `diff-${d.path}-${d.timestamp}`,
      path: d.path,
      original: '',
      modified: '',
      diff: d.diff,
      toolName: 'Git',
      timestamp: d.timestamp,
      status: d.status,
      additions: d.additions,
      deletions: d.deletions,
    }));
    const message = JSON.stringify({ type: 'refresh', diffs: transformedDiffs });
    for (const client of diffsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  // Set up tool event listener to broadcast new spans to WebSocket clients
  // Also track pwd from Bash commands for stats-strip display
  // Also trigger context updates when tool events arrive
  // Also invalidate git cache on tool completion (PostToolUse)
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

    // Note: Background task completion is handled via tool_result messages in the
    // Claude message stream (see WebSocket send handler), not via OTEL events.
    // The tool_result message contains tool_use_id matching the original tool_id.

    // Invalidate git cache only when files are actually modified
    // Not every tool use affects git status - be selective to avoid unnecessary refreshes
    // Skip entirely when git_monitor is disabled
    const gitMonitorForOtlp = getCurrentSettings().workflow?.git_monitor === true;
    const shouldInvalidateGit = gitMonitorForOtlp && shouldInvalidateGitCache(event);
    console.log('[WebSocket] Tool event:', event.toolName, 'input:', event.input?.substring(0, 80), 'success:', event.success, 'shouldInvalidateGit:', shouldInvalidateGit);
    if (shouldInvalidateGit) {
      const projectDir = getProjectDir();
      console.log('[WebSocket] Invalidating git cache for:', projectDir);
      invalidateGitCache(projectDir);
      // MSSCI-14238: Also invalidate diff cache when files change
      invalidateDiffCache(projectDir);
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
  // Also broadcasts sprint updates for EnhancedSprintPanel (MSSCI-14189)
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
          // Also broadcast sprint updates for EnhancedSprintPanel
          broadcastSprintUpdate(projectDir);
          storyDebounceTimer = null;
        }, STORY_DEBOUNCE_MS);
      });
    } catch (err) {
      console.error('[WebSocket] Failed to set up story file watcher:', err);
    }
  }

  // Set up session file watcher (MSSCI-12237: Story Status Tree View)
  // Watch .session/*-session.md files and broadcast updates via /ws/story
  // Story 75-6: Create .session/ directory if it doesn't exist to ensure watcher is always set up
  const sessionDir = join(projectDir, '.session');
  if (!existsSync(sessionDir)) {
    try {
      mkdirSync(sessionDir, { recursive: true });
      console.log('[WebSocket] Created .session directory for session file watching');
    } catch (err) {
      console.error('[WebSocket] Failed to create .session directory:', err);
    }
  }
  // Always try to set up the watcher (directory now guaranteed to exist or error logged)
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
          // Also broadcast sprint updates so currentStory refreshes in EnhancedSprintPanel
          broadcastSprintUpdate(projectDir);
          storyDebounceTimer = null;
        }, STORY_DEBOUNCE_MS);
      });
    } catch (err) {
      console.error('[WebSocket] Failed to set up session file watcher:', err);
    }
  }

  // Set up git metadata watchers for all configured repos
  // Watches .git/HEAD (branch switches), .git/index (staging), .git/FETCH_HEAD (fetches),
  // and .git/refs/heads/ (commits). Safe because reads use --no-optional-locks.
  // Supplements OTLP tool-event invalidation to catch hooks, scripts, and manual git commands.
  // Gated by workflow.git_monitor — when disabled, no file watchers are created.
  const gitMonitorSetting = getCurrentSettings().workflow?.git_monitor === true;
  if (gitMonitorSetting) {
    setupGitFileWatchers(projectDir, getProjectDir);
  } else {
    console.log('[WebSocket] git_monitor disabled — skipping .git/ file watchers');
  }

  // Listen for settings changes to handle dynamic git_monitor enable/disable.
  // If git_monitor transitions from false to true after startup, set up watchers
  // and force-refresh git data for already-connected clients.
  let previousGitMonitor = gitMonitorSetting;
  onSettingsChange((newSettings) => {
    const newGitMonitor = newSettings.workflow?.git_monitor === true;
    if (!previousGitMonitor && newGitMonitor) {
      console.log('[WebSocket] git_monitor enabled dynamically — setting up watchers + polling');
      setupGitFileWatchers(getProjectDir(), getProjectDir);
      startPeriodicPoll(getProjectDir, () => gitClients.size > 0);
      forceRefreshGitCache(getProjectDir());
    }
    previousGitMonitor = newGitMonitor;
  });

  // Start periodic git status polling as safety net (Story 121-4)
  // Catches working tree changes not covered by .git/ file watchers or OTLP events.
  // Only active when git_monitor is enabled; gated by client count inside the poll.
  if (gitMonitorSetting) {
    startPeriodicPoll(getProjectDir, () => gitClients.size > 0);
  }

  // Register git cache refresh callback to broadcast updates
  onGitCacheRefresh((allReposInfo) => {
    console.log('[WebSocket] onGitCacheRefresh callback fired, broadcasting to', gitClients.size, 'clients');
    broadcastGitUpdate(allReposInfo);
  });

  // Register force refresh callback for /api/git/refresh endpoint
  setForceRefreshCallback(async (projDir: string) => {
    console.log('[WebSocket] Force refresh callback called for:', projDir);
    const repos = await forceRefreshGitCache(projDir);
    console.log('[WebSocket] Force refresh got', repos.length, 'repos, broadcasting');
    broadcastGitUpdate(repos);
  });

  // Set up settings file watcher for config.local.yaml changes
  // This enables real-time bidirectional sync between ControlBar and SettingsPanel
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
            // Re-read settings from disk so in-memory state matches the file.
            // This triggers onSettingsChange callbacks (e.g. git_monitor toggle).
            initializeSettings(projectDir);
            const settings = await getSettingsForWebSocket(projectDir);
            broadcastSettingsUpdate(settings);
            // MSSCI-14976: Also check for focus changes
            const newFocus = getConfigFocus(projectDir);
            if (shouldBroadcastFocus(newFocus, lastKnownFocus)) {
              lastKnownFocus = newFocus;
              broadcastFocusUpdate(newFocus);
            }
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

// MSSCI-14189: Broadcast sprint update to all connected clients
function broadcastSprintUpdate(projectDir: string): void {
  const sprintData = getSprintData(projectDir, getUserEmail());
  const message = JSON.stringify({ type: 'update', ...sprintData });
  for (const client of sprintClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// MSSCI-11943: Broadcast git update to all connected clients (multi-repo)
function broadcastGitUpdate(allReposInfo: RepoGitInfo[]): void {
  const message = JSON.stringify({ type: 'update', repos: allReposInfo });
  console.log('[WebSocket] broadcastGitUpdate: clients=', gitClients.size, 'repos=', allReposInfo.map(r => `${r.name}(clean=${r.clean})`).join(', '));
  let sentCount = 0;
  for (const client of gitClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  }
  console.log('[WebSocket] broadcastGitUpdate: sent to', sentCount, 'open clients');
  // Bridge to Electron IPC for panel updates
  if (gitUpdateCallback) {
    gitUpdateCallback(allReposInfo);
  }
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

// Broadcast panel toggle to all connected settings clients
// Used by Electron View menu to toggle panels via WebSocket
export function broadcastPanelToggle(panelId: string): void {
  const message = JSON.stringify({ type: 'panel:toggle', panelId });
  for (const client of settingsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// MSSCI-14976: Broadcast focus update to all connected focus clients
export function broadcastFocusUpdate(focus: string | null): void {
  const message = JSON.stringify(createFocusMessage('update', focus));
  for (const client of focusClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

