/**
 * Web Adapter - Provides window.electronAPI interface for browser mode
 *
 * In Electron: preload.ts creates window.electronAPI via contextBridge
 * In Browser: this adapter creates window.electronAPI via WebSocket/REST
 *
 * This allows the same UI code to work in both Electron and browser modes.
 */

// Skip if already defined (Electron mode)
if (window.electronAPI) {
  console.log('[WebAdapter] Electron API detected, skipping web adapter');
} else {
  console.log('[WebAdapter] Creating web adapter for browser mode');

  const WS_CLAUDE_URL = `ws://${location.host}/ws/claude`;

  // Claude WebSocket connection state
  let claudeWs = null;
  let claudeConnecting = false;
  const messageCallbacks = [];
  const completeCallbacks = [];
  const errorCallbacks = [];

  // Current permission mode (stored locally, synced with server)
  let currentMode = 'acceptEdits';

  /**
   * Ensure Claude WebSocket is connected
   * @returns {Promise<WebSocket>}
   */
  function ensureClaudeConnection() {
    if (claudeWs?.readyState === WebSocket.OPEN) {
      return Promise.resolve(claudeWs);
    }

    if (claudeConnecting) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (claudeWs?.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve(claudeWs);
          } else if (!claudeConnecting) {
            clearInterval(checkInterval);
            reject(new Error('Connection failed'));
          }
        }, 50);
      });
    }

    claudeConnecting = true;

    return new Promise((resolve, reject) => {
      claudeWs = new WebSocket(WS_CLAUDE_URL);

      claudeWs.onopen = () => {
        console.log('[WebAdapter] Claude WebSocket connected');
        claudeConnecting = false;
        resolve(claudeWs);
      };

      claudeWs.onerror = (err) => {
        console.error('[WebAdapter] Claude WebSocket error:', err);
        claudeConnecting = false;
        reject(err);
      };

      claudeWs.onclose = () => {
        console.log('[WebAdapter] Claude WebSocket disconnected');
        claudeWs = null;
        claudeConnecting = false;
      };

      claudeWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'message':
              messageCallbacks.forEach(cb => cb(data.message));
              break;
            case 'complete':
              completeCallbacks.forEach(cb => cb());
              break;
            case 'error':
              errorCallbacks.forEach(cb => cb(data.error));
              break;
          }
        } catch (err) {
          console.error('[WebAdapter] Failed to parse message:', err);
        }
      };
    });
  }

  /**
   * Create a data API for a specific endpoint
   * @param {string} restEndpoint - REST endpoint for GET requests
   * @param {string} wsPath - WebSocket path for real-time updates (optional)
   */
  function createDataAPI(restEndpoint, wsPath) {
    const callbacks = [];
    let ws = null;

    return {
      get: async () => {
        try {
          const response = await fetch(restEndpoint);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json();
        } catch (err) {
          console.error(`[WebAdapter] Failed to fetch ${restEndpoint}:`, err);
          return null;
        }
      },
      onUpdate: (callback) => {
        callbacks.push(callback);

        // Connect to WebSocket for real-time updates if path provided
        if (wsPath && !ws) {
          ws = new WebSocket(`ws://${location.host}${wsPath}`);

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              callbacks.forEach(cb => cb(null, data));
            } catch (err) {
              console.error(`[WebAdapter] Failed to parse ${wsPath} message:`, err);
            }
          };

          ws.onclose = () => {
            ws = null;
            // Attempt to reconnect after a delay
            setTimeout(() => {
              if (callbacks.length > 0) {
                // Re-initialize by calling onUpdate with a no-op
                // This will reconnect the WebSocket
              }
            }, 2000);
          };

          ws.onerror = () => {
            ws = null;
          };
        }
      }
    };
  }

  /**
   * Create a push-only API (no GET, just subscribe to updates)
   * @param {string} wsPath - WebSocket path for updates
   */
  function createPushOnlyAPI(wsPath) {
    const callbacks = [];
    let ws = null;

    return {
      onUpdate: (callback) => {
        callbacks.push(callback);

        if (wsPath && !ws) {
          ws = new WebSocket(`ws://${location.host}${wsPath}`);

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              callbacks.forEach(cb => cb(null, data));
            } catch (err) {
              console.error(`[WebAdapter] Failed to parse ${wsPath} message:`, err);
            }
          };

          ws.onclose = () => {
            ws = null;
          };

          ws.onerror = () => {
            ws = null;
          };
        }
      }
    };
  }

  // Create the electronAPI object for browser mode
  window.electronAPI = {
    // Data APIs using existing REST endpoints + WebSocket updates
    stats: createDataAPI('/api/stats', '/ws/stats'),
    persona: createDataAPI('/api/persona', '/ws/persona'),
    story: createDataAPI('/api/story', null), // No WebSocket for story yet
    git: createDataAPI('/api/git', null), // No WebSocket for git yet
    toolStats: createDataAPI('/api/stats', null), // Uses same stats endpoint
    tokenStats: createDataAPI('/api/stats', null), // Uses same stats endpoint
    todos: {
      get: () => Promise.resolve({ todos: [] }), // Todos managed in-browser for now
      onUpdate: () => {} // No-op
    },

    // Context API (push only)
    context: createPushOnlyAPI(null), // Context updates not available in web mode yet

    // Claude API via WebSocket
    claude: {
      send: async (prompt) => {
        const ws = await ensureClaudeConnection();
        ws.send(JSON.stringify({ type: 'send', prompt }));
      },

      abort: async () => {
        if (claudeWs?.readyState === WebSocket.OPEN) {
          claudeWs.send(JSON.stringify({ type: 'abort' }));
        }
      },

      clear: async () => {
        if (claudeWs?.readyState === WebSocket.OPEN) {
          claudeWs.send(JSON.stringify({ type: 'clear' }));
        }
        // Also close and reconnect to get fresh session
        if (claudeWs) {
          claudeWs.close();
          claudeWs = null;
        }
      },

      setMode: async (mode) => {
        currentMode = mode;
        if (claudeWs?.readyState === WebSocket.OPEN) {
          claudeWs.send(JSON.stringify({ type: 'setMode', mode }));
        }
      },

      getMode: async () => {
        return currentMode;
      },

      onMessage: (callback) => {
        messageCallbacks.push(callback);
      },

      onComplete: (callback) => {
        completeCallbacks.push(callback);
      },

      onError: (callback) => {
        errorCallbacks.push(callback);
      }
    },

    // Agent API (not available in browser - no Electron menu)
    agent: {
      onLaunch: () => {
        // No-op in browser mode (no Electron menu)
      }
    },

    // Diff API (push only - diffs extracted from Claude messages)
    diff: createPushOnlyAPI(null), // Not implemented yet for web mode

    // File browser API via REST
    fileBrowser: {
      listDirectory: async (path) => {
        try {
          const response = await fetch(`/api/files?path=${encodeURIComponent(path || '')}`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json();
        } catch (err) {
          console.error('[WebAdapter] Failed to list directory:', err);
          return { path: path || '', entries: [] };
        }
      },

      openFile: async (path) => {
        try {
          await fetch('/api/files/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
          });
        } catch (err) {
          console.error('[WebAdapter] Failed to open file:', err);
        }
      },

      onFileOpened: () => {
        // No-op in browser mode
      }
    }
  };

  console.log('[WebAdapter] Web adapter initialized');
}
