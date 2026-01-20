/**
 * Story/Git Module - WebSocket + Electron IPC client for story and git status
 * MSSCI-11943: WebSocket channels replace polling for real-time updates
 */

import { settingsSync, STORAGE_KEYS } from './settings-sync.js';

// Polling intervals for periodic refresh (fallback only, not used for WebSocket)
const STORY_POLL_INTERVAL = 10000; // 10 seconds
const GIT_POLL_INTERVAL = 5000;    // 5 seconds

// WebSocket reconnection settings (MSSCI-11943)
const WS_RECONNECT_BASE_DELAY = 1000;  // 1 second
const WS_RECONNECT_MAX_DELAY = 30000;  // 30 seconds
const WS_RECONNECT_MULTIPLIER = 1.5;

// WebSocket connections (MSSCI-11943)
let storyWebSocket = null;
let gitWebSocket = null;
let storyReconnectDelay = WS_RECONNECT_BASE_DELAY;
let gitReconnectDelay = WS_RECONNECT_BASE_DELAY;

/**
 * Get AC panel collapsed state from settings-sync
 * @returns {boolean} True if collapsed, false if expanded (default: false)
 */
function getAcCollapsed() {
  return settingsSync.get(STORAGE_KEYS.AC_COLLAPSED, false) === true;
}

/**
 * Save AC panel collapsed state to settings-sync
 * @param {boolean} collapsed - Whether panel is collapsed
 */
function setAcCollapsed(collapsed) {
  settingsSync.set(STORAGE_KEYS.AC_COLLAPSED, collapsed);
}

let storyPollTimer = null;
let gitPollTimer = null;
let storyReconnectTimer = null;
let gitReconnectTimer = null;

// Cache for theme agent-to-character mappings
let themeAgentsCache = null;

/**
 * Get the cached theme agents mapping
 * @returns {Object|null} Agent-to-character mapping or null if not loaded
 */
export function getThemeAgents() {
  return themeAgentsCache;
}

/**
 * Fetch and cache theme agents mapping
 * @returns {Promise<Object|null>} The agent mapping or null
 */
export async function loadThemeAgents() {
  try {
    const response = await fetch('/api/theme-agents');
    if (response.ok) {
      themeAgentsCache = await response.json();
      return themeAgentsCache;
    }
  } catch (err) {
    // Silent fail - name resolution is optional
  }
  return null;
}

/**
 * Clear the theme agents cache (call after theme change)
 */
export function clearThemeAgentsCache() {
  themeAgentsCache = null;
}

/**
 * Resolve a role name to character name using cached theme agents
 * @param {string} text - Text that may contain role names like "sm", "dev", "tea"
 * @returns {string} Text with role names replaced by character names
 */
function resolveAgentNames(text) {
  if (!text || !themeAgentsCache) return text;

  // Common role patterns to look for
  const roles = ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'orchestrator'];

  let result = text;
  for (const role of roles) {
    const agent = themeAgentsCache[role];
    if (agent) {
      const name = agent.shortName || agent.character;
      // Replace standalone role names (case insensitive, word boundaries)
      // Use negative lookahead to skip replacement when role is followed by parenthesis
      // (already has character name appended, e.g., "Dev (Julia)")
      const regex = new RegExp(`\\b${role}\\b(?!\\s*\\()`, 'gi');
      result = result.replace(regex, name);
    }
  }

  return result;
}

/**
 * Update story section in the UI
 * @param {Object} story - Story data from IPC
 */
export function updateStory(story) {
  const titleEl = document.getElementById('story-title');
  const phaseEl = document.getElementById('story-phase');
  const progressFill = document.querySelector('.progress-fill');
  const sprintPoints = document.querySelector('.sprint-points');

  if (titleEl) {
    if (story.id && story.title) {
      titleEl.textContent = `${story.id}: ${story.title}`;
    } else {
      titleEl.textContent = 'No active story';
    }
  }

  // Hide phase element - info is now shown in workflow indicator
  if (phaseEl) {
    phaseEl.style.display = 'none';
  }

  if (story.sprint && progressFill && sprintPoints) {
    const { completed, total } = story.sprint;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    progressFill.style.width = `${percentage}%`;
    sprintPoints.textContent = `${completed}/${total} pts`;
  }

  // B-13: Update workflow progress visualization
  updateWorkflowProgress(story.workflow);

  // B-13: Update story details (next agent, PR)
  updateStoryDetails(story);

  // B-13: Update acceptance criteria checklist
  updateAcceptanceCriteria(story.criteria);
}

/**
 * Get default display label for an agent
 * @param {string} agent - Agent name (sm, tea, dev, reviewer)
 * @returns {string} Display label
 */
function getDefaultLabel(agent) {
  const labels = {
    sm: 'SM',
    tea: 'TEA',
    dev: 'Dev',
    reviewer: 'Rev'
  };
  return labels[agent] || agent.charAt(0).toUpperCase() + agent.slice(1);
}

/**
 * B-13/37-15: Update workflow progress visualization
 * Dynamically renders workflow steps based on active workflow definition.
 * @param {Array|null} workflow - Array of workflow steps with {agent, label, status}
 */
function updateWorkflowProgress(workflow) {
  const workflowEl = document.getElementById('workflow-progress');
  if (!workflowEl) return;

  if (!workflow || workflow.length === 0) {
    workflowEl.style.display = 'none';
    return;
  }

  workflowEl.style.display = 'flex';

  // Clear existing content and rebuild from workflow data
  workflowEl.innerHTML = '';

  // Show all workflow steps including both SM appearances (setup and finish)
  // This displays the full TDD flow: SM → TEA → Dev → Rev → SM
  const steps = workflow;

  // Build workflow steps dynamically
  steps.forEach((step, index) => {
    // Add arrow before step (except first)
    if (index > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'workflow-arrow';
      arrow.textContent = '→';
      workflowEl.appendChild(arrow);
    }

    // Create step container
    const stepEl = document.createElement('div');
    stepEl.className = `workflow-step status-${step.status}`;
    stepEl.setAttribute('data-agent', step.agent);

    // Create icon
    const iconEl = document.createElement('span');
    iconEl.className = `workflow-icon status-${step.status}`;
    switch (step.status) {
      case 'done':
        iconEl.textContent = '✓';
        break;
      case 'current':
        iconEl.textContent = '●';
        break;
      case 'pending':
      default:
        iconEl.textContent = '○';
        break;
    }
    stepEl.appendChild(iconEl);

    // Create label - use step.label if available, else derive from agent
    const labelEl = document.createElement('span');
    labelEl.className = 'workflow-label';
    labelEl.textContent = step.label || getDefaultLabel(step.agent);
    stepEl.appendChild(labelEl);

    workflowEl.appendChild(stepEl);
  });
}

/**
 * B-13: Update story details (next agent, PR, branch)
 * @param {Object} story - Story data
 */
function updateStoryDetails(story) {
  const detailsEl = document.getElementById('story-details');
  const nextAgentEl = document.getElementById('next-agent');
  const prEl = document.getElementById('story-pr');

  if (!detailsEl) return;

  const hasDetails = story.nextAgent || story.pr;

  if (!hasDetails) {
    detailsEl.style.display = 'none';
    return;
  }

  detailsEl.style.display = 'block';

  // Hide next-agent element - info is now shown in workflow indicator
  if (nextAgentEl) {
    nextAgentEl.style.display = 'none';
  }

  // Update PR link
  if (prEl) {
    if (story.pr) {
      // Try to make it a clickable link if we can determine the repo
      prEl.innerHTML = `PR: <a href="#" class="pr-link" data-pr="${story.pr}">#${story.pr}</a>`;
      prEl.style.display = 'block';

      // Add click handler for PR link
      const prLink = prEl.querySelector('.pr-link');
      if (prLink) {
        prLink.addEventListener('click', (e) => {
          e.preventDefault();
          // Open PR in default browser via Electron shell
          if (window.electronAPI?.openExternal) {
            // Would need repo URL from git info
            console.log('PR link clicked:', story.pr);
          }
        });
      }
    } else {
      prEl.style.display = 'none';
    }
  }
}

/**
 * B-13: Update acceptance criteria checklist (collapsible like todos)
 * @param {Array|null} criteria - Array of criteria items
 */
function updateAcceptanceCriteria(criteria) {
  const acSection = document.getElementById('ac-section');
  const acList = document.getElementById('ac-list');
  const acProgress = document.getElementById('ac-progress');

  if (!acSection || !acList) return;

  if (!criteria || criteria.length === 0) {
    acSection.style.display = 'none';
    return;
  }

  acSection.style.display = 'block';

  // Update progress count
  const completed = criteria.filter(c => c.completed).length;
  if (acProgress) {
    acProgress.textContent = `(${completed}/${criteria.length})`;
  }

  // Render criteria items (simple text, no checkboxes)
  acList.innerHTML = criteria.map(c =>
    `<div class="ac-item ${c.completed ? 'ac-done' : ''}">
      <span class="ac-text">${c.text}</span>
    </div>`
  ).join('');

  // Respect saved collapse state (27-1: persist collapse preference)
  // Only apply saved state, don't auto-expand
  if (getAcCollapsed()) {
    acSection.classList.add('collapsed');
  } else {
    acSection.classList.remove('collapsed');
  }
}

/**
 * Update git section in the UI
 * @param {Object} git - Git data from IPC
 */
export function updateGit(git) {
  const branchEl = document.getElementById('git-branch');
  const statusEl = document.getElementById('git-status');

  if (branchEl) {
    branchEl.textContent = git.branch || '-';
  }

  if (statusEl) {
    if (git.clean) {
      statusEl.textContent = 'Clean';
      statusEl.className = 'git-status status-clean';
    } else {
      statusEl.textContent = 'Dirty';
      statusEl.className = 'git-status status-dirty';
    }
  }
}

/**
 * Refresh story from IPC
 */
async function refreshStory() {
  if (!window.electronAPI?.story) return;

  try {
    const story = await window.electronAPI.story.get();
    if (story) {
      updateStory(story);
    }
  } catch (err) {
    console.error('Failed to refresh story:', err);
  }
}

/**
 * Refresh git status from IPC
 */
async function refreshGit() {
  if (!window.electronAPI?.git) return;

  try {
    const git = await window.electronAPI.git.get();
    if (git) {
      updateGit(git);
    }
  } catch (err) {
    console.error('Failed to refresh git:', err);
  }
}

/**
 * Start polling for story updates (fallback for when WebSocket is unavailable)
 */
function startStoryPolling() {
  if (storyPollTimer) {
    clearInterval(storyPollTimer);
  }
  storyPollTimer = setInterval(refreshStory, STORY_POLL_INTERVAL);
}

/**
 * Start polling for git updates (fallback for when WebSocket is unavailable)
 */
function startGitPolling() {
  if (gitPollTimer) {
    clearInterval(gitPollTimer);
  }
  gitPollTimer = setInterval(refreshGit, GIT_POLL_INTERVAL);
}

/**
 * MSSCI-11943: Connect to story WebSocket channel
 * Replaces polling with real-time updates triggered by file watchers.
 * @returns {WebSocket|null} The WebSocket connection or null if failed
 */
export function connectStoryWebSocket() {
  // Clean up existing connection
  if (storyWebSocket) {
    storyWebSocket.close();
    storyWebSocket = null;
  }

  // Clear any pending reconnect
  if (storyReconnectTimer) {
    clearTimeout(storyReconnectTimer);
    storyReconnectTimer = null;
  }

  // Determine WebSocket URL (same host as page)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/story`;

  try {
    storyWebSocket = new WebSocket(wsUrl);

    storyWebSocket.onopen = () => {
      console.log('[Story] WebSocket connected');
      // Reset reconnect delay on successful connection
      storyReconnectDelay = WS_RECONNECT_BASE_DELAY;
      // Stop polling since WebSocket is connected
      if (storyPollTimer) {
        clearInterval(storyPollTimer);
        storyPollTimer = null;
      }
    };

    storyWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Handle both init and update messages
        if (data.type === 'init' || data.type === 'update' || data.id) {
          updateStory(data);
        }
      } catch (err) {
        console.error('[Story] Failed to parse WebSocket message:', err);
      }
    };

    storyWebSocket.onerror = (err) => {
      console.error('[Story] WebSocket error:', err);
    };

    storyWebSocket.onclose = () => {
      console.log('[Story] WebSocket disconnected');
      storyWebSocket = null;
      // Schedule reconnection with exponential backoff
      storyReconnectTimer = setTimeout(() => {
        console.log(`[Story] Reconnecting (delay: ${storyReconnectDelay}ms)`);
        connectStoryWebSocket();
        // Increase delay for next attempt (with cap)
        storyReconnectDelay = Math.min(
          storyReconnectDelay * WS_RECONNECT_MULTIPLIER,
          WS_RECONNECT_MAX_DELAY
        );
      }, storyReconnectDelay);
    };

    return storyWebSocket;
  } catch (err) {
    console.error('[Story] Failed to create WebSocket:', err);
    // Fall back to polling
    startStoryPolling();
    return null;
  }
}

/**
 * MSSCI-11943: Connect to git WebSocket channel
 * Replaces polling with real-time updates triggered by file watchers.
 * @returns {WebSocket|null} The WebSocket connection or null if failed
 */
export function connectGitWebSocket() {
  // Clean up existing connection
  if (gitWebSocket) {
    gitWebSocket.close();
    gitWebSocket = null;
  }

  // Clear any pending reconnect
  if (gitReconnectTimer) {
    clearTimeout(gitReconnectTimer);
    gitReconnectTimer = null;
  }

  // Determine WebSocket URL (same host as page)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/git`;

  try {
    gitWebSocket = new WebSocket(wsUrl);

    gitWebSocket.onopen = () => {
      console.log('[Git] WebSocket connected');
      // Reset reconnect delay on successful connection
      gitReconnectDelay = WS_RECONNECT_BASE_DELAY;
      // Stop polling since WebSocket is connected
      if (gitPollTimer) {
        clearInterval(gitPollTimer);
        gitPollTimer = null;
      }
    };

    gitWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Handle both init and update messages
        if (data.type === 'init' || data.type === 'update' || data.branch !== undefined) {
          updateGit(data);
        }
      } catch (err) {
        console.error('[Git] Failed to parse WebSocket message:', err);
      }
    };

    gitWebSocket.onerror = (err) => {
      console.error('[Git] WebSocket error:', err);
    };

    gitWebSocket.onclose = () => {
      console.log('[Git] WebSocket disconnected');
      gitWebSocket = null;
      // Schedule reconnection with exponential backoff
      gitReconnectTimer = setTimeout(() => {
        console.log(`[Git] Reconnecting (delay: ${gitReconnectDelay}ms)`);
        connectGitWebSocket();
        // Increase delay for next attempt (with cap)
        gitReconnectDelay = Math.min(
          gitReconnectDelay * WS_RECONNECT_MULTIPLIER,
          WS_RECONNECT_MAX_DELAY
        );
      }, gitReconnectDelay);
    };

    return gitWebSocket;
  } catch (err) {
    console.error('[Git] Failed to create WebSocket:', err);
    // Fall back to polling
    startGitPolling();
    return null;
  }
}

/**
 * Initialize story/git via WebSocket (web mode) or Electron IPC (Electron mode)
 * MSSCI-11943: Prefer WebSocket for real-time updates, fall back to IPC + polling
 */
async function initStoryGit() {
  // Load theme agents for name resolution
  await loadThemeAgents();

  // Check if we're in Electron mode with IPC available
  const isElectronMode = !!window.electronAPI;

  if (isElectronMode) {
    // Electron mode: Use IPC with polling fallback
    // Get initial data
    await Promise.all([refreshStory(), refreshGit()]);

    // Subscribe to updates from main process
    if (window.electronAPI.story) {
      window.electronAPI.story.onUpdate((_event, story) => {
        updateStory(story);
      });
    }

    if (window.electronAPI.git) {
      window.electronAPI.git.onUpdate((_event, git) => {
        updateGit(git);
      });
    }

    // Start polling for periodic refresh (file changes, etc.)
    startStoryPolling();
    startGitPolling();

    console.log('Story/Git IPC connected');
  } else {
    // Web mode: Use WebSocket for real-time updates (MSSCI-11943)
    connectStoryWebSocket();
    connectGitWebSocket();

    console.log('Story/Git WebSocket connected');
  }

  // Set up AC section collapse toggle handler (27-1: persist state)
  const acHeader = document.querySelector('#ac-section .section-header');
  if (acHeader) {
    acHeader.addEventListener('click', () => {
      const acSection = document.getElementById('ac-section');
      if (acSection) {
        const isCollapsed = acSection.classList.toggle('collapsed');
        setAcCollapsed(isCollapsed);
      }
    });
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initStoryGit();
});

// Listen for persona theme changes and reload the agent cache
// SettingsPanel dispatches 'theme:changed' on document with { theme: themeId }
document.addEventListener('theme:changed', (e) => {
  if (e.detail?.theme) {
    console.log('[Story] Persona theme changed to:', e.detail.theme);
    clearThemeAgentsCache();
    loadThemeAgents();
  }
});
