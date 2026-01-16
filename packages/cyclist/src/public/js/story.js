/**
 * Story/Git Module - Electron IPC client for story and git status
 */

// Polling intervals for periodic refresh
const STORY_POLL_INTERVAL = 10000; // 10 seconds
const GIT_POLL_INTERVAL = 5000;    // 5 seconds

// localStorage key for AC panel collapse state (27-1)
const AC_COLLAPSED_KEY = 'cyclist-ac-collapsed';

/**
 * Get AC panel collapsed state from localStorage
 * @returns {boolean} True if collapsed, false if expanded (default: false)
 */
function getAcCollapsed() {
  try {
    return localStorage.getItem(AC_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Save AC panel collapsed state to localStorage
 * @param {boolean} collapsed - Whether panel is collapsed
 */
function setAcCollapsed(collapsed) {
  try {
    localStorage.setItem(AC_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Ignore localStorage errors
  }
}

let storyPollTimer = null;
let gitPollTimer = null;

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
 * B-13: Update workflow progress visualization
 * @param {Array|null} workflow - Array of workflow steps
 */
function updateWorkflowProgress(workflow) {
  const workflowEl = document.getElementById('workflow-progress');
  if (!workflowEl) return;

  if (!workflow || workflow.length === 0) {
    workflowEl.style.display = 'none';
    return;
  }

  workflowEl.style.display = 'flex';

  // Update each workflow step
  for (const step of workflow) {
    const stepEl = workflowEl.querySelector(`[data-agent="${step.agent}"]`);
    if (!stepEl) continue;

    const iconEl = stepEl.querySelector('.workflow-icon');
    if (iconEl) {
      // Set icon based on status
      switch (step.status) {
        case 'done':
          iconEl.textContent = '✓';
          iconEl.className = 'workflow-icon status-done';
          break;
        case 'current':
          iconEl.textContent = '●';
          iconEl.className = 'workflow-icon status-current';
          break;
        case 'pending':
        default:
          iconEl.textContent = '○';
          iconEl.className = 'workflow-icon status-pending';
          break;
      }
    }

    // Update step container class for styling
    stepEl.className = `workflow-step status-${step.status}`;
    stepEl.setAttribute('data-agent', step.agent);
  }
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
 * Start polling for story updates
 */
function startStoryPolling() {
  if (storyPollTimer) {
    clearInterval(storyPollTimer);
  }
  storyPollTimer = setInterval(refreshStory, STORY_POLL_INTERVAL);
}

/**
 * Start polling for git updates
 */
function startGitPolling() {
  if (gitPollTimer) {
    clearInterval(gitPollTimer);
  }
  gitPollTimer = setInterval(refreshGit, GIT_POLL_INTERVAL);
}

/**
 * Initialize story/git via Electron IPC
 */
async function initStoryGit() {
  // Check if Electron API is available
  if (!window.electronAPI) {
    console.warn('Electron API not available');
    return;
  }

  // Load theme agents for name resolution
  await loadThemeAgents();

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

  console.log('Story/Git IPC connected');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initStoryGit();
});

// Listen for persona theme changes and reload the agent cache
window.addEventListener('themechange', (e) => {
  // Only reload if this is a persona theme change (not just color theme)
  if (e.detail?.themeId || e.detail?.personaTheme) {
    clearThemeAgentsCache();
    loadThemeAgents();
  }
});
