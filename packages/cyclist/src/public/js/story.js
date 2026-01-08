/**
 * Story/Git Module - Electron IPC client for story and git status
 */

// Polling intervals for periodic refresh
const STORY_POLL_INTERVAL = 10000; // 10 seconds
const GIT_POLL_INTERVAL = 5000;    // 5 seconds

let storyPollTimer = null;
let gitPollTimer = null;

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

  if (phaseEl) {
    if (story.phase) {
      phaseEl.textContent = `Phase: ${story.phase}`;
    } else {
      phaseEl.textContent = 'Phase: -';
    }
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

  // Update next agent
  if (nextAgentEl) {
    if (story.nextAgent) {
      nextAgentEl.textContent = `→ ${story.nextAgent}`;
      nextAgentEl.style.display = 'block';
    } else {
      nextAgentEl.style.display = 'none';
    }
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
 * B-13: Update acceptance criteria checklist
 * @param {Array|null} criteria - Array of criteria items
 */
function updateAcceptanceCriteria(criteria) {
  const criteriaEl = document.getElementById('acceptance-criteria');
  if (!criteriaEl) return;

  if (!criteria || criteria.length === 0) {
    criteriaEl.style.display = 'none';
    return;
  }

  criteriaEl.style.display = 'block';

  // Render criteria items
  criteriaEl.innerHTML = criteria.map(c =>
    `<div class="criteria-item ${c.completed ? 'done' : ''}">
      <span class="criteria-icon">${c.completed ? '✓' : '○'}</span>
      <span class="criteria-text">${c.text}</span>
    </div>`
  ).join('');
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
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initStoryGit();
});
