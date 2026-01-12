/**
 * Message Renderers
 *
 * Render SDK messages to HTML for display in MessageView.
 * Extracted from MessageView.js for better maintainability.
 */

import { parseMarkdown, escapeHtml } from './markdown-parser.js';
import { getHelperName } from '../../persona.js';

// =============================================================================
// Constants
// =============================================================================

/** Length threshold for collapsible tool results */
const COLLAPSIBLE_THRESHOLD = 500;

/** Permission mode display labels */
const PERMISSION_MODE_LABELS = {
  default: 'Default',
  plan: 'Plan Mode',
  acceptEdits: 'Accept Edits',
  dangerouslySkipPermissions: 'Skip Permissions',
  bypassPermissions: 'Bypass Permissions', // Claude CLI internal mode
};

// =============================================================================
// State (shared with MessageView)
// =============================================================================

/** Tool execution status tracking */
let toolStatuses = new Map();

/** Verbose mode state */
let verboseModeEnabled = false;

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format a full model ID to a short display name
 * @param {string} model - Full model ID (e.g., "claude-opus-4-5-20251101")
 * @returns {string} Short display name (e.g., "opus-4-5")
 */
export function formatModelName(model) {
  if (!model) return '';
  // Remove "claude-" prefix and date suffix (YYYYMMDD)
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

/**
 * Format a permission mode to human-readable label
 * @param {string} mode - Permission mode (e.g., "acceptEdits")
 * @returns {string} Human-readable label (e.g., "Accept Edits")
 */
export function formatPermissionMode(mode) {
  if (!mode) return '';
  return PERMISSION_MODE_LABELS[mode] || mode;
}

/**
 * Format turn count with proper singular/plural
 * @param {number} count - Number of turns
 * @returns {string} Formatted string (e.g., "3 turns")
 */
export function formatTurnCount(count) {
  if (count === undefined || count === null) return '';
  return count === 1 ? '1 turn' : `${count} turns`;
}

/**
 * Format duration in milliseconds to seconds with one decimal
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2.8s")
 */
export function formatDuration(ms) {
  if (ms === undefined || ms === null) return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

// =============================================================================
// Tool Status Tracking
// =============================================================================

/**
 * Get the execution status of a tool
 * @param {string} toolId - The tool_id to look up
 * @returns {string | undefined} Status ('running', 'complete') or undefined
 */
export function getToolStatus(toolId) {
  return toolStatuses.get(toolId);
}

/**
 * Set the execution status of a tool
 * @param {string} toolId - The tool_id to update
 * @param {string} status - Status to set ('running', 'complete')
 */
export function setToolStatus(toolId, status) {
  toolStatuses.set(toolId, status);
}

/**
 * Clear all tool statuses
 */
export function clearToolStatuses() {
  toolStatuses.clear();
}

// =============================================================================
// Verbose Mode
// =============================================================================

/**
 * Set verbose mode state
 * @param {boolean} enabled - Whether verbose mode is enabled
 */
export function setVerboseMode(enabled) {
  verboseModeEnabled = enabled;
}

/**
 * Get current verbose mode state
 * @returns {boolean}
 */
export function getVerboseMode() {
  return verboseModeEnabled;
}

// =============================================================================
// Message Renderers
// =============================================================================

/**
 * Render a text/assistant message with markdown
 * @param {Object} message - SDK assistant message
 * @returns {string} HTML string
 */
export function renderTextMessage(message) {
  const content = message.message?.content || message.content || [];
  const textBlocks = content.filter((block) => block.type === 'text');
  const text = textBlocks.map((block) => block.text).join('\n\n').trim();

  // Don't render if text is empty or just brackets/whitespace
  if (!text || text.length < 3 || /^[\[\]{}()\s]*$/.test(text)) {
    return '';
  }

  return `<div class="message message-assistant">${parseMarkdown(text)}</div>`;
}

/**
 * Render a tool use message with name and input
 * @param {Object} message - SDK tool use message
 * @returns {string} HTML string
 */
export function renderToolUseMessage(message) {
  const { tool_name, tool_id, input } = message;
  const inputJson = JSON.stringify(input, null, 2);

  // Get tool status for indicator
  const status = getToolStatus(tool_id);
  const statusClass = status ? ` tool-status-${status}` : '';

  // Special handling for Task tool - show helper name and description
  if (tool_name === 'Task' && input) {
    const helperName = getHelperName() || input.subagent_type || 'Task';
    const description = input.description || '';
    const displayName = description ? `${helperName}: ${description}` : helperName;

    // Add open attribute when verbose mode is enabled
    const openAttr = verboseModeEnabled ? ' open' : '';

    return `<div class="message message-tool-use message-task${statusClass}" data-tool-id="${tool_id}">
  <div class="tool-header">
    <span class="tool-name helper-name">${escapeHtml(displayName)}</span>
    <span class="tool-id">${escapeHtml(tool_id)}</span>
    <span class="tool-status"></span>
  </div>
  <details class="tool-input collapsible"${openAttr}>
    <summary>Input</summary>
    <pre><code>${escapeHtml(inputJson)}</code></pre>
  </details>
</div>`;
  }

  // Add open attribute when verbose mode is enabled
  const openAttr = verboseModeEnabled ? ' open' : '';

  return `<div class="message message-tool-use${statusClass}" data-tool-id="${tool_id}">
  <div class="tool-header">
    <span class="tool-name">${escapeHtml(tool_name)}</span>
    <span class="tool-id">${escapeHtml(tool_id)}</span>
    <span class="tool-status"></span>
  </div>
  <details class="tool-input collapsible"${openAttr}>
    <summary>Input</summary>
    <pre><code>${escapeHtml(inputJson)}</code></pre>
  </details>
</div>`;
}

/**
 * Check if a tool use message should be collapsible
 * @param {Object} _message - SDK tool use message
 * @returns {boolean}
 */
export function isToolUseCollapsible(_message) {
  // All tool use blocks are collapsible by default
  return true;
}

/**
 * Render a tool result message with output
 * @param {Object} message - SDK tool result message
 * @returns {string} HTML string
 */
export function renderToolResultMessage(message) {
  const { tool_id, output, is_error } = message;
  const isLong = output.length > COLLAPSIBLE_THRESHOLD;
  const errorClass = is_error ? ' error' : '';

  const content = `<pre><code>${escapeHtml(output)}</code></pre>`;

  if (isLong) {
    // Add open attribute when verbose mode is enabled
    const openAttr = verboseModeEnabled ? ' open' : '';

    return `<div class="message message-tool-result${errorClass}" data-tool-id="${tool_id}">
  <details class="tool-output collapsible"${openAttr}>
    <summary>Result for ${escapeHtml(tool_id)}</summary>
    ${content}
  </details>
</div>`;
  }

  return `<div class="message message-tool-result${errorClass}" data-tool-id="${tool_id}">
  <div class="tool-result-header">Result for ${escapeHtml(tool_id)}</div>
  ${content}
</div>`;
}

/**
 * Render a system message
 * @param {Object} message - SDK system message
 * @returns {string} HTML string
 */
export function renderSystemMessage(message) {
  const { session_id, model, cwd, tools, subtype, permissionMode } = message;

  // For init messages, show model name and permission mode
  if (subtype === 'init') {
    const shortModel = formatModelName(model);
    const modeLabel = formatPermissionMode(permissionMode);

    return `<div class="message message-system message-system-init">
  <div class="system-info">
    <span class="system-label">Session started</span>
    ${shortModel ? `<span class="init-model">${escapeHtml(shortModel)}</span>` : ''}
    ${modeLabel ? `<span class="init-mode">${escapeHtml(modeLabel)}</span>` : ''}
    ${session_id ? `<span class="system-session">${escapeHtml(session_id.substring(0, 8))}...</span>` : ''}
  </div>
</div>`;
  }

  // Standard system message with model info
  return `<div class="message message-system">
  <div class="system-info">
    ${model ? `<span class="system-model">${escapeHtml(model)}</span>` : ''}
    ${session_id ? `<span class="system-session">${escapeHtml(session_id)}</span>` : ''}
  </div>
  ${cwd ? `<div class="system-cwd">CWD: ${escapeHtml(cwd)}</div>` : ''}
  ${tools?.length ? `<div class="system-tools">Tools: ${tools.map((t) => escapeHtml(t)).join(', ')}</div>` : ''}
</div>`;
}

/**
 * Render a result message (session end)
 * @param {Object} message - SDK result message
 * @returns {string} HTML string
 */
export function renderResultMessage(message) {
  const { usage, cost_usd, duration_ms, num_turns } = message;

  const turnsDisplay = num_turns !== undefined ? formatTurnCount(num_turns) : '';
  const durationDisplay = duration_ms !== undefined ? formatDuration(duration_ms) : '';

  return `<div class="message message-result">
  <div class="result-stats">
    ${usage ? `<span class="result-tokens">Tokens: ${usage.input_tokens} in / ${usage.output_tokens} out</span>` : ''}
    ${cost_usd !== undefined ? `<span class="result-cost">Cost: $${cost_usd.toFixed(4)}</span>` : ''}
    ${turnsDisplay ? `<span class="result-turns">${escapeHtml(turnsDisplay)}</span>` : ''}
    ${durationDisplay ? `<span class="result-duration">${escapeHtml(durationDisplay)}</span>` : ''}
  </div>
</div>`;
}

/**
 * Render an error message
 * @param {Object} message - SDK error message
 * @returns {string} HTML string
 */
export function renderErrorMessage(message) {
  const { error, code } = message;

  return `<div class="message message-error error">
  <div class="error-content">
    ${code ? `<span class="error-code">[${escapeHtml(code)}]</span>` : ''}
    <span class="error-text">${escapeHtml(error)}</span>
  </div>
</div>`;
}

/**
 * Render a user message (from the editor input)
 * @param {Object} message - Message with content property and optional images
 * @returns {string} HTML string
 */
export function renderUserMessage(message) {
  // Distinguish between editor input and SDK tool_result messages
  // Editor sends: {type: 'user', content: 'string', images?: [...]}
  // SDK sends: {type: 'user', message: {content: [{type: 'tool_result', ...}]}}

  // If it's an SDK tool_result message, don't render it
  if (message.message?.content) {
    // This is a tool result from SDK - skip it
    return '';
  }

  const { content, images } = message;

  // Only render if we have string content from the editor
  if (typeof content !== 'string' || !content.trim()) {
    return '';
  }

  // Build image thumbnails HTML (28-1)
  let imagesHtml = '';
  if (images && images.length > 0) {
    const thumbnails = images.map((img) =>
      `<img src="${img.dataUrl}" alt="${img.filename || 'pasted image'}" class="user-message-image" />`
    ).join('');
    imagesHtml = `<div class="user-message-images">${thumbnails}</div>`;
  }

  // User messages are already plain text/markdown from the editor
  return `<div class="message message-user">${parseMarkdown(content)}${imagesHtml}</div>`;
}

export default {
  // Formatters
  formatModelName,
  formatPermissionMode,
  formatTurnCount,
  formatDuration,
  // Tool status
  getToolStatus,
  setToolStatus,
  clearToolStatuses,
  // Verbose mode
  setVerboseMode,
  getVerboseMode,
  // Renderers
  renderTextMessage,
  renderToolUseMessage,
  isToolUseCollapsible,
  renderToolResultMessage,
  renderSystemMessage,
  renderResultMessage,
  renderErrorMessage,
  renderUserMessage,
};
