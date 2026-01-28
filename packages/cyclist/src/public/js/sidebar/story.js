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

// Expand/collapse state for sprint stories section
let sprintStoriesExpanded = false;

/**
 * Escape HTML entities to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format story status for display
 * @param {string} status - Status value (done, in_progress, backlog, cancelled)
 * @returns {{text: string, className: string}} Formatted status
 */
export function formatStoryStatus(status) {
  const statusMap = {
    done: { text: 'Done', className: 'story-status done' },
    in_progress: { text: 'In Progress', className: 'story-status in_progress' },
    backlog: { text: 'Backlog', className: 'story-status backlog' },
    cancelled: { text: 'Cancelled', className: 'story-status cancelled' },
  };
  return statusMap[status] || { text: status || 'Unknown', className: 'story-status unknown' };
}

/**
 * Format story points for display
 * @param {number|null|undefined} points - Point value
 * @returns {string} Formatted points string
 */
export function formatStoryPoints(points) {
  if (points === null || points === undefined) {
    return '- pts';
  }
  return points === 1 ? '1 pt' : `${points} pts`;
}

/**
 * Check if sprint stories section is expanded
 * @returns {boolean} Expanded state
 */
export function isExpanded() {
  return sprintStoriesExpanded;
}

/**
 * Set sprint stories section expanded state
 * @param {boolean} expanded - New expanded state
 */
export function setExpanded(expanded) {
  sprintStoriesExpanded = expanded;
}

/**
 * Reset expand state to default (for testing)
 */
export function resetExpandState() {
  sprintStoriesExpanded = false;
}

/**
 * Render a list of sprint stories as HTML
 * @param {Array|null} stories - Array of story objects
 * @param {string|null} currentStoryId - ID of current story to highlight
 * @returns {string} HTML string
 */
export function renderSprintStoriesList(stories, currentStoryId) {
  if (!stories || stories.length === 0) {
    return '';
  }

  const items = stories.map(story => {
    const isCurrent = story.id === currentStoryId;
    const currentClass = isCurrent ? ' current' : '';
    const currentAttr = isCurrent ? ' data-current="true"' : '';
    const status = formatStoryStatus(story.status);
    const points = formatStoryPoints(story.points);

    // Render ID as link if Jira URL exists, otherwise plain text
    let idHtml;
    if (story.jiraUrl) {
      idHtml = `<a href="${escapeHtml(story.jiraUrl)}" target="_blank" rel="noopener noreferrer" class="story-jira-link">${escapeHtml(story.id)}</a>`;
    } else {
      idHtml = `<span class="story-id">${escapeHtml(story.id)}</span>`;
    }

    return `<div class="sprint-story-item${currentClass}" data-story-id="${escapeHtml(story.id)}"${currentAttr}>
      <div class="story-header">
        ${idHtml}
        <span class="${status.className}" data-status="${story.status}">${status.text}</span>
      </div>
      <div class="story-title-text">${escapeHtml(story.title)}</div>
      <div class="story-points">${points}</div>
    </div>`;
  });

  return items.join('\n');
}

/**
 * Render epic context as HTML
 * @param {Object|null} epicContext - Epic context object
 * @returns {string} HTML string
 */
export function renderEpicContext(epicContext) {
  if (!epicContext) {
    return '';
  }

  // Render epic title with optional Jira link
  let titleHtml;
  if (epicContext.jiraUrl) {
    titleHtml = `<a href="${escapeHtml(epicContext.jiraUrl)}" target="_blank" rel="noopener noreferrer" class="epic-jira-link">${escapeHtml(epicContext.jiraKey)}</a>: ${escapeHtml(epicContext.title)}`;
  } else {
    titleHtml = escapeHtml(epicContext.title);
  }

  // Render stories list
  let storiesHtml = '';
  if (epicContext.stories && epicContext.stories.length > 0) {
    const storyItems = epicContext.stories.map(story => {
      const status = formatStoryStatus(story.status);
      return `<div class="epic-story-item">
        <span class="story-id">${escapeHtml(story.id)}</span>
        <span class="${status.className}">${status.text}</span>
      </div>`;
    });
    storiesHtml = `<div class="epic-stories">${storyItems.join('\n')}</div>`;
  }

  return `<div class="epic-context">
    <div class="epic-title">${titleHtml}</div>
    ${storiesHtml}
  </div>`;
}

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
 * Update sprint stories section in the UI
 * @param {Array|null} sprintStories - Array of sprint stories
 * @param {string|null} currentStoryId - ID of current story
 */
function updateSprintStoriesSection(sprintStories, currentStoryId) {
  const sectionEl = document.getElementById('sprint-stories-section');
  const listEl = document.getElementById('sprint-stories-list');
  const countEl = document.getElementById('sprint-stories-count');

  if (!sectionEl || !listEl) return;

  if (!sprintStories || sprintStories.length === 0) {
    sectionEl.style.display = 'none';
    return;
  }

  // Show section and render stories
  sectionEl.style.display = '';
  listEl.innerHTML = renderSprintStoriesList(sprintStories, currentStoryId);

  // Update count summary
  if (countEl) {
    const done = sprintStories.filter(s => s.status === 'done').length;
    countEl.textContent = `(${done}/${sprintStories.length})`;
  }
}

/**
 * Update epic context section in the UI
 * @param {Object|null} epicContext - Epic context data
 */
function updateEpicContextSection(epicContext) {
  const sectionEl = document.getElementById('epic-context-section');
  const contentEl = document.getElementById('epic-context-content');
  const summaryEl = document.getElementById('epic-context-summary');

  if (!sectionEl || !contentEl) return;

  if (!epicContext) {
    sectionEl.style.display = 'none';
    return;
  }

  // Show section and render epic context
  sectionEl.style.display = '';
  contentEl.innerHTML = renderEpicContext(epicContext);

  // Update summary with epic title
  if (summaryEl) {
    summaryEl.textContent = epicContext.title || '';
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

  // 64-19: Update expandable sections
  updateSprintStoriesSection(story.sprintStories, story.id);
  updateEpicContextSection(story.epicContext);
}

/**
 * Toggle collapse state for a collapsible section
 * @param {HTMLElement} sectionEl - The section element
 */
function toggleSectionCollapse(sectionEl) {
  if (!sectionEl) return;
  const isCollapsed = sectionEl.classList.toggle('collapsed');

  // Track expand state for sprint stories section
  if (sectionEl.id === 'sprint-stories-section') {
    setExpanded(!isCollapsed);
  }
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

  // 64-19: Add click handlers for expandable sections
  const sprintStoriesHeader = document.querySelector('[data-action="toggle-sprint-stories"]');
  if (sprintStoriesHeader) {
    sprintStoriesHeader.addEventListener('click', () => {
      const section = document.getElementById('sprint-stories-section');
      toggleSectionCollapse(section);
    });
  }

  const epicContextHeader = document.querySelector('[data-action="toggle-epic-context"]');
  if (epicContextHeader) {
    epicContextHeader.addEventListener('click', () => {
      const section = document.getElementById('epic-context-section');
      toggleSectionCollapse(section);
    });
  }
}

/**
 * Cleanup story module
 */
export function destroy() {
  // No cleanup needed currently
}

// Legacy exports for backward compatibility
export const updateStory = update;
