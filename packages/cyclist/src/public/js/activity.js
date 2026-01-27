/**
 * Activity Line - Shows current subagent activity
 *
 * Displays a lightweight status line in the persona section
 * showing when Claude spawns a subagent (helper name).
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
 * Format the helper name for the helper line
 * @param {object} input - Task tool input
 * @returns {string} Helper name with icon
 */
function formatHelperName(input) {
  const helperName = getHelperName() || input.subagent_type || 'agent';
  return `<span class="helper-name">${helperName}</span>`;
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
 * Update the activity line based on a message
 * @param {object} message - SDK message
 */
export function updateActivity(message) {
  const helperLine = getHelperLine();
  if (!helperLine) return;

  // Check for tool_use embedded in assistant message
  const toolUse = extractToolUse(message);
  if (toolUse) {
    // Task tool = subagent spawn, show on helper line
    if (toolUse.tool_name === 'Task') {
      activeSubagent = toolUse.input;
      helperLine.innerHTML = formatHelperName(toolUse.input);
      helperLine.classList.add('active');
    }
  }
}

/**
 * Clear the activity line immediately
 */
export function clearActivity() {
  const helperLine = getHelperLine();

  if (helperLine) {
    helperLine.innerHTML = '';
    helperLine.classList.remove('active');
  }

  activeSubagent = null;
}
