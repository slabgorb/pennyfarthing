/**
 * Activity Line - Shows current subagent activity
 *
 * Displays a lightweight status line in the persona section
 * showing when Claude spawns a subagent (helper name and task).
 */

import { getHelperName } from './persona.js';

/** Track active subagent for persistent display */
let activeSubagent = null;

/**
 * Get the helper line element (shows helper name)
 * @returns {HTMLElement|null}
 */
function getHelperLine() {
  return document.getElementById('helper-line');
}

/**
 * Get the helper task line element (shows task description)
 * @returns {HTMLElement|null}
 */
function getHelperTaskLine() {
  return document.getElementById('helper-task-line');
}


/**
 * Format the helper name for the helper line
 * @param {object} input - Task tool input
 * @returns {string} Helper name with icon
 */
function formatHelperName(input) {
  const helperName = getHelperName() || input.subagent_type || 'agent';
  return `<span class="helper-name">${helperName}</span>`;
}

/**
 * Format the task description for the helper task line
 * @param {object} input - Task tool input
 * @returns {string} Task description
 */
function formatHelperTask(input) {
  const description = input.description || '';
  return truncate(description, 40);
}


/**
 * Truncate a string to max length with ellipsis
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Extract tool_use from assistant message content
 * @param {object} message - SDK message
 * @returns {object|null} tool_use object or null
 */
function extractToolUse(message) {
  if (message.type !== 'assistant') return null;
  const content = message.message?.content;
  if (!Array.isArray(content)) return null;

  // Find tool_use in content array
  for (const item of content) {
    if (item.type === 'tool_use') {
      return {
        tool_name: item.name,
        input: item.input || {},
      };
    }
  }
  return null;
}

/**
 * Update the activity lines based on a message
 * @param {object} message - SDK message
 */
export function updateActivity(message) {
  const helperLine = getHelperLine();
  const helperTaskLine = getHelperTaskLine();
  if (!helperLine || !helperTaskLine) return;

  // Check for tool_use embedded in assistant message
  const toolUse = extractToolUse(message);
  if (toolUse) {
    // Task tool = subagent spawn, show on helper lines
    if (toolUse.tool_name === 'Task') {
      activeSubagent = toolUse.input;
      helperLine.innerHTML = formatHelperName(toolUse.input);
      helperLine.classList.add('active');
      helperTaskLine.innerHTML = formatHelperTask(toolUse.input);
      helperTaskLine.classList.add('active');
    }
  }
}

/**
 * Clear all activity lines immediately
 */
export function clearActivity() {
  const helperLine = getHelperLine();
  const helperTaskLine = getHelperTaskLine();

  if (helperLine) {
    helperLine.innerHTML = '';
    helperLine.classList.remove('active');
  }

  if (helperTaskLine) {
    helperTaskLine.innerHTML = '';
    helperTaskLine.classList.remove('active');
  }

  activeSubagent = null;
}
