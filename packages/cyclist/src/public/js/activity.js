/**
 * Activity Line - Shows current tool/subagent activity
 *
 * Displays a lightweight status line in the persona section
 * showing what Claude is currently doing (tool calls, subagent spawns).
 */

import { getHelperName } from './persona.js';

/** Tool icons for common tools */
const TOOL_ICONS = {
  Task: '🚀',
  Bash: '⚡',
  Read: '📖',
  Write: '✏️',
  Edit: '✏️',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  WebSearch: '🔎',
  TodoWrite: '📋',
  AskUserQuestion: '❓',
  default: '🔧',
};

/** Clear timeout handle */
let clearTimeoutId = null;

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
 * Get the tool use line element (shows current tool)
 * @returns {HTMLElement|null}
 */
function getToolUseLine() {
  return document.getElementById('tool-use-line');
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
 * Format a tool use message for display
 * @param {object} message - The tool_use message
 * @returns {string} Formatted activity text
 */
function formatToolActivity(message) {
  const { tool_name, input } = message;
  const icon = TOOL_ICONS[tool_name] || TOOL_ICONS.default;

  // For other tools, show a brief description of what they're doing
  let detail = '';
  if (input) {
    if (input.pattern) {
      detail = truncate(input.pattern, 25);
    } else if (input.file_path) {
      detail = truncate(basename(input.file_path), 25);
    } else if (input.command) {
      detail = truncate(input.command.split(' ')[0], 20);
    } else if (input.query) {
      detail = truncate(input.query, 25);
    } else if (input.url) {
      detail = truncate(new URL(input.url).hostname, 20);
    }
  }

  if (detail) {
    return `<span class="tool-icon">${icon}</span>${tool_name}: ${detail}`;
  }
  return `<span class="tool-icon">${icon}</span>${tool_name}`;
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
 * Get basename from a file path
 * @param {string} filepath
 * @returns {string}
 */
function basename(filepath) {
  if (!filepath) return '';
  return filepath.split('/').pop() || filepath;
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
 * Check if message contains tool_result
 * @param {object} message - SDK message
 * @returns {boolean}
 */
function hasToolResult(message) {
  if (message.type !== 'user') return false;
  const content = message.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some(item => item.type === 'tool_result');
}

/**
 * Update the activity lines based on a message
 * @param {object} message - SDK message
 */
export function updateActivity(message) {
  const helperLine = getHelperLine();
  const helperTaskLine = getHelperTaskLine();
  const toolUseLine = getToolUseLine();
  if (!toolUseLine) return;

  // Clear any pending timeout
  if (clearTimeoutId) {
    clearTimeout(clearTimeoutId);
    clearTimeoutId = null;
  }

  // Check for tool_use embedded in assistant message
  const toolUse = extractToolUse(message);
  if (toolUse) {
    // Task tool = subagent spawn, show on helper lines
    if (toolUse.tool_name === 'Task' && helperLine && helperTaskLine) {
      activeSubagent = toolUse.input;
      helperLine.innerHTML = formatHelperName(toolUse.input);
      helperLine.classList.add('active');
      helperTaskLine.innerHTML = formatHelperTask(toolUse.input);
      helperTaskLine.classList.add('active');
      // Clear the tool use line when spawning
      toolUseLine.innerHTML = '';
      toolUseLine.classList.remove('active');
    } else {
      // Regular tool - show on tool use line
      toolUseLine.innerHTML = formatToolActivity(toolUse);
      toolUseLine.classList.add('active');
    }
    return;
  }

  // Check for tool_result embedded in user message
  if (hasToolResult(message)) {
    // Keep showing for a moment, then fade
    clearTimeoutId = setTimeout(() => {
      toolUseLine.classList.remove('active');
    }, 500);
  }
}

/**
 * Clear all activity lines immediately
 */
export function clearActivity() {
  const helperLine = getHelperLine();
  const helperTaskLine = getHelperTaskLine();
  const toolUseLine = getToolUseLine();

  if (clearTimeoutId) {
    clearTimeout(clearTimeoutId);
    clearTimeoutId = null;
  }

  if (helperLine) {
    helperLine.innerHTML = '';
    helperLine.classList.remove('active');
  }

  if (helperTaskLine) {
    helperTaskLine.innerHTML = '';
    helperTaskLine.classList.remove('active');
  }

  if (toolUseLine) {
    toolUseLine.innerHTML = '';
    toolUseLine.classList.remove('active');
  }

  activeSubagent = null;
}
