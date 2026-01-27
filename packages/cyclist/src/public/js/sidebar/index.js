/**
 * Sidebar Coordinator - Initializes all sidebar modules and manages shared WebSocket connections
 *
 * This module:
 * - Initializes all sidebar sub-modules on DOMContentLoaded
 * - Manages shared WebSocket connections (/ws/story, /ws/git)
 * - Routes WebSocket messages to appropriate modules
 * - Exports initSidebar() for HTML to call
 */

import * as portrait from './portrait.js';
import * as story from './story.js';
import * as git from './git.js';
import * as acceptanceCriteria from './acceptance-criteria.js';
import * as tasks from './tasks.js';
import * as backgroundTasks from './background-tasks.js';
import * as bikelane from './bikelane.js';

// WebSocket reconnection settings
const WS_RECONNECT_BASE_DELAY = 1000;  // 1 second
const WS_RECONNECT_MAX_DELAY = 30000;  // 30 seconds
const WS_RECONNECT_MULTIPLIER = 1.5;

// WebSocket connections
let storyWebSocket = null;
let gitWebSocket = null;
let storyReconnectDelay = WS_RECONNECT_BASE_DELAY;
let gitReconnectDelay = WS_RECONNECT_BASE_DELAY;
let storyReconnectTimer = null;
let gitReconnectTimer = null;

// Polling intervals (fallback only)
const STORY_POLL_INTERVAL = 10000;
const GIT_POLL_INTERVAL = 5000;
let storyPollTimer = null;
let gitPollTimer = null;

/**
 * Connect to story WebSocket channel
 * @returns {WebSocket|null}
 */
export function connectStoryWebSocket() {
  if (storyWebSocket) {
    storyWebSocket.close();
    storyWebSocket = null;
  }

  if (storyReconnectTimer) {
    clearTimeout(storyReconnectTimer);
    storyReconnectTimer = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/story`;

  try {
    storyWebSocket = new WebSocket(wsUrl);

    storyWebSocket.onopen = () => {
      console.log('[Sidebar] Story WebSocket connected');
      storyReconnectDelay = WS_RECONNECT_BASE_DELAY;
      if (storyPollTimer) {
        clearInterval(storyPollTimer);
        storyPollTimer = null;
      }
    };

    storyWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update' || data.id) {
          // Route to story module
          story.update(data);
          // Route workflow to bikelane
          bikelane.update(data.workflow);
          // Route criteria to AC
          acceptanceCriteria.update(data.criteria);
        }
      } catch (err) {
        console.error('[Sidebar] Failed to parse story message:', err);
      }
    };

    storyWebSocket.onerror = (err) => {
      console.error('[Sidebar] Story WebSocket error:', err);
    };

    storyWebSocket.onclose = () => {
      console.log('[Sidebar] Story WebSocket disconnected');
      storyWebSocket = null;
      storyReconnectTimer = setTimeout(() => {
        connectStoryWebSocket();
        storyReconnectDelay = Math.min(
          storyReconnectDelay * WS_RECONNECT_MULTIPLIER,
          WS_RECONNECT_MAX_DELAY
        );
      }, storyReconnectDelay);
    };

    return storyWebSocket;
  } catch (err) {
    console.error('[Sidebar] Failed to create story WebSocket:', err);
    startStoryPolling();
    return null;
  }
}

/**
 * Connect to git WebSocket channel
 * @returns {WebSocket|null}
 */
export function connectGitWebSocket() {
  if (gitWebSocket) {
    gitWebSocket.close();
    gitWebSocket = null;
  }

  if (gitReconnectTimer) {
    clearTimeout(gitReconnectTimer);
    gitReconnectTimer = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/git`;

  try {
    gitWebSocket = new WebSocket(wsUrl);

    gitWebSocket.onopen = () => {
      console.log('[Sidebar] Git WebSocket connected');
      gitReconnectDelay = WS_RECONNECT_BASE_DELAY;
      if (gitPollTimer) {
        clearInterval(gitPollTimer);
        gitPollTimer = null;
      }
    };

    gitWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          if (data.repos) {
            git.update(data.repos);
          }
        }
      } catch (err) {
        console.error('[Sidebar] Failed to parse git message:', err);
      }
    };

    gitWebSocket.onerror = (err) => {
      console.error('[Sidebar] Git WebSocket error:', err);
    };

    gitWebSocket.onclose = () => {
      console.log('[Sidebar] Git WebSocket disconnected');
      gitWebSocket = null;
      gitReconnectTimer = setTimeout(() => {
        connectGitWebSocket();
        gitReconnectDelay = Math.min(
          gitReconnectDelay * WS_RECONNECT_MULTIPLIER,
          WS_RECONNECT_MAX_DELAY
        );
      }, gitReconnectDelay);
    };

    return gitWebSocket;
  } catch (err) {
    console.error('[Sidebar] Failed to create git WebSocket:', err);
    startGitPolling();
    return null;
  }
}

/**
 * Refresh story from IPC (Electron mode)
 */
async function refreshStory() {
  if (!window.electronAPI?.story) return;

  try {
    const storyData = await window.electronAPI.story.get();
    if (storyData) {
      story.update(storyData);
      bikelane.update(storyData.workflow);
      acceptanceCriteria.update(storyData.criteria);
    }
  } catch (err) {
    console.error('[Sidebar] Failed to refresh story:', err);
  }
}

/**
 * Refresh git from IPC (Electron mode)
 */
async function refreshGit() {
  if (!window.electronAPI?.git) return;

  try {
    const gitData = await window.electronAPI.git.get();
    if (gitData?.repos) {
      git.update(gitData.repos);
    }
  } catch (err) {
    console.error('[Sidebar] Failed to refresh git:', err);
  }
}

/**
 * Start story polling fallback
 */
function startStoryPolling() {
  if (storyPollTimer) clearInterval(storyPollTimer);
  storyPollTimer = setInterval(refreshStory, STORY_POLL_INTERVAL);
}

/**
 * Start git polling fallback
 */
function startGitPolling() {
  if (gitPollTimer) clearInterval(gitPollTimer);
  gitPollTimer = setInterval(refreshGit, GIT_POLL_INTERVAL);
}

/**
 * Initialize all sidebar modules
 */
export async function initSidebar() {
  // Initialize all modules
  portrait.init();
  story.init();
  git.init();
  acceptanceCriteria.init();
  tasks.init();
  backgroundTasks.init();
  bikelane.init();

  // Load theme agents for name resolution
  await story.loadThemeAgents();

  const isElectronMode = !!window.electronAPI;

  if (isElectronMode) {
    // Electron mode: Use IPC
    await Promise.all([refreshStory(), refreshGit()]);

    // Subscribe to IPC updates
    if (window.electronAPI.story) {
      window.electronAPI.story.onUpdate((_event, data) => {
        story.update(data);
        bikelane.update(data.workflow);
        acceptanceCriteria.update(data.criteria);
      });
    }

    if (window.electronAPI.git) {
      window.electronAPI.git.onUpdate((_event, data) => {
        if (data.repos) {
          git.update(data.repos);
        }
      });
    }

    // Start polling as backup
    startStoryPolling();
    startGitPolling();

    console.log('[Sidebar] IPC mode initialized');
  } else {
    // Web mode: Use WebSocket
    connectStoryWebSocket();
    connectGitWebSocket();

    console.log('[Sidebar] WebSocket mode initialized');
  }
}

/**
 * Cleanup all sidebar resources
 */
export function destroySidebar() {
  // Close WebSocket connections
  if (storyWebSocket) {
    storyWebSocket.close();
    storyWebSocket = null;
  }
  if (gitWebSocket) {
    gitWebSocket.close();
    gitWebSocket = null;
  }

  // Clear timers
  if (storyReconnectTimer) clearTimeout(storyReconnectTimer);
  if (gitReconnectTimer) clearTimeout(gitReconnectTimer);
  if (storyPollTimer) clearInterval(storyPollTimer);
  if (gitPollTimer) clearInterval(gitPollTimer);

  // Destroy modules
  portrait.destroy?.();
  story.destroy?.();
  git.destroy?.();
  acceptanceCriteria.destroy?.();
  tasks.destroy?.();
  backgroundTasks.destroy?.();
  bikelane.destroy?.();
}

// Export modules for direct access if needed
export { portrait, story, git, acceptanceCriteria, tasks, backgroundTasks, bikelane };

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
});
