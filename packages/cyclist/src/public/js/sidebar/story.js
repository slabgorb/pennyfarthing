/**
 * Story Module - Story title, phase, sprint progress, and PR link display
 *
 * HTML elements:
 * - #story-title - Story title display
 * - #story-phase - Phase display (hidden, shown in workflow)
 * - #story-details - Next agent and PR info container
 * - #next-agent - Next agent display
 * - #story-pr - PR link
 * - #sprint-done, #sprint-remaining, #sprint-percent, #sprint-end-date - Sprint stats
 * - #workflow-progress - Workflow visualization
 */

// Cache for theme agent-to-character mappings
let themeAgentsCache = null;

/**
 * Get the cached theme agents mapping
 * @returns {Object|null}
 */
export function getThemeAgents() {
  return themeAgentsCache;
}

/**
 * Fetch and cache theme agents mapping
 * @returns {Promise<Object|null>}
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
 * @param {string} text - Text that may contain role names
 * @returns {string} Text with role names replaced by character names
 */
function resolveAgentNames(text) {
  if (!text || !themeAgentsCache) return text;

  const roles = ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'orchestrator'];
  let result = text;

  for (const role of roles) {
    const agent = themeAgentsCache[role];
    if (agent) {
      const name = agent.shortName || agent.character;
      const regex = new RegExp(`\\b${role}\\b(?!\\s*\\()`, 'gi');
      result = result.replace(regex, name);
    }
  }

  return result;
}

/**
 * Get default display label for an agent
 * @param {string} agent - Agent name
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
 * Update sprint info display
 * @param {Object|null} sprint - Sprint data
 */
function updateSprintInfo(sprint) {
  const doneEl = document.getElementById('sprint-done');
  const remainingEl = document.getElementById('sprint-remaining');
  const percentEl = document.getElementById('sprint-percent');
  const endDateEl = document.getElementById('sprint-end-date');

  if (doneEl) {
    doneEl.textContent = sprint?.done != null ? `${sprint.done} pts` : '-';
  }

  if (remainingEl) {
    remainingEl.textContent = sprint?.remaining != null ? `${sprint.remaining} pts` : '-';
  }

  if (percentEl) {
    if (sprint?.done != null && sprint?.remaining != null) {
      const total = sprint.done + sprint.remaining + (sprint.inProgress || 0);
      const percent = total > 0 ? Math.round((sprint.done / total) * 100) : 0;
      percentEl.textContent = `${percent}%`;
    } else {
      percentEl.textContent = '-';
    }
  }

  if (endDateEl) {
    if (sprint?.endDate) {
      const date = new Date(sprint.endDate);
      const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      endDateEl.textContent = formatted;
    } else {
      endDateEl.textContent = '-';
    }
  }
}

/**
 * Update story details (next agent, PR)
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

  // Hide next-agent element - info shown in workflow indicator
  if (nextAgentEl) {
    nextAgentEl.style.display = 'none';
  }

  if (prEl) {
    if (story.pr) {
      prEl.innerHTML = `PR: <a href="#" class="pr-link" data-pr="${story.pr}">#${story.pr}</a>`;
      prEl.style.display = 'block';

      const prLink = prEl.querySelector('.pr-link');
      if (prLink) {
        prLink.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.electronAPI?.openExternal) {
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
 * Update story section in the UI
 * @param {Object} story - Story data
 */
export function update(story) {
  const titleEl = document.getElementById('story-title');
  const phaseEl = document.getElementById('story-phase');

  if (titleEl) {
    if (story.id && story.title) {
      titleEl.textContent = `${story.id}: ${story.title}`;
    } else {
      titleEl.textContent = 'No active story';
    }
  }

  // Hide phase element - info shown in workflow indicator
  if (phaseEl) {
    phaseEl.style.display = 'none';
  }

  updateSprintInfo(story.sprint);
  updateStoryDetails(story);
}

/**
 * Initialize story module
 */
export function init() {
  // Listen for persona theme changes
  document.addEventListener('theme:changed', (e) => {
    if (e.detail?.theme) {
      console.log('[Story] Persona theme changed to:', e.detail.theme);
      clearThemeAgentsCache();
      loadThemeAgents();
    }
  });
}

/**
 * Cleanup story module
 */
export function destroy() {
  // No cleanup needed currently
}

// Legacy exports for backward compatibility
export const updateStory = update;
