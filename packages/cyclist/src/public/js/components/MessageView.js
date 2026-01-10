/**
 * MessageView - Renders SDK messages from ClaudeService
 *
 * Replaces xterm.js terminal display for programmatic mode.
 * Renders different message types with markdown formatting,
 * collapsible tool blocks, and streaming support.
 */

import { addMessage as storeAddMessage, clearMessages as storeClearMessages } from '../message-store.js';
import { getHelperName } from '../persona.js';
import { insertAndSubmit } from '../editor.js';

// =============================================================================
// Constants
// =============================================================================

/** Container ID where MessageView mounts */
export const MESSAGE_VIEW_CONTAINER_ID = 'message-view';

/** Threshold in pixels for detecting user scroll-up */
export const SCROLL_THRESHOLD = 50;

/** Theme CSS classes for dark and light modes */
export const THEME_CLASSES = {
  dark: 'message-view-dark',
  light: 'message-view-light',
};

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

/** Track whether we've shown an init message this session */
let hasShownInitMessage = false;

// =============================================================================
// State
// =============================================================================

/** Auto-scroll enabled state */
let autoScrollEnabled = true;

/** Tool execution status tracking */
let toolStatuses = new Map();

/** Streaming state */
let streamingState = {
  isStreaming: false,
  currentText: '',
  messageId: null,
};

/** 22-5: Verbose mode state - when true, tool blocks are expanded by default */
let verboseModeEnabled = false;

/** Container element reference */
let containerElement = null;

/** Scroll handler reference for cleanup */
let scrollHandler = null;

// =============================================================================
// Quick Actions State (B-9.6)
// =============================================================================

/** Whether quick action buttons are currently visible */
let quickActionsVisible = false;

/** Auto-submit enabled (stretch goal) */
let autoSubmitEnabled = false;

// =============================================================================
// Quick Actions Constants (B-9.6)
// =============================================================================

/**
 * Question patterns for detecting actionable questions from Claude.
 * These patterns are checked against the LAST PARAGRAPH of the message
 * to avoid false positives from explanatory text.
 *
 * Each pattern has:
 * - pattern: regex to match
 * - responses: button labels to show
 * - requiresQuestion: if true, the paragraph must end with "?"
 */
export const QUESTION_PATTERNS = [
  // Direct action offers - these imply readiness to proceed
  { pattern: /would you like me to/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },
  { pattern: /shall i (proceed|continue|go ahead|start|begin)/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },
  { pattern: /ready to proceed/i, responses: ['Yes, proceed', 'Hold on'], requiresQuestion: false },
  { pattern: /want me to (proceed|continue|go ahead|start|begin)/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },

  // Yes/No questions - require actual question mark
  { pattern: /should i\b/i, responses: ['Yes', 'No'], requiresQuestion: true },
  { pattern: /do you want/i, responses: ['Yes', 'No'], requiresQuestion: true },
  { pattern: /shall i\b/i, responses: ['Yes', 'No'], requiresQuestion: true },

  // Permission prompts (tool approval) - these are actual permission requests
  { pattern: /allow.*to\s+(run|execute)/i, responses: ['Yes', 'No'], requiresQuestion: false },
  { pattern: /allow.*to\s+read/i, responses: ['Yes', 'No'], requiresQuestion: false },
  { pattern: /allow.*to\s+write/i, responses: ['Yes', 'No'], requiresQuestion: false },
  { pattern: /allow.*to\s+edit/i, responses: ['Yes', 'No'], requiresQuestion: false },
];

// =============================================================================
// Syntax Highlighting
// =============================================================================

/**
 * Simple syntax highlighter using tokenizer approach to avoid regex conflicts
 * @param {string} code - The code to highlight (already HTML escaped)
 * @param {string} lang - Language identifier (js, ts, python, etc.)
 * @returns {string} HTML with syntax highlighting spans
 */
function highlightCode(code, lang) {
  if (!code || !lang) return code;

  const language = lang.toLowerCase();

  // Define keywords by language family
  const jsKeywords = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'void']);
  const pyKeywords = new Set(['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'pass', 'self']);
  const goKeywords = new Set(['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'break', 'continue', 'go', 'defer', 'chan', 'select', 'type', 'struct', 'interface', 'map', 'package', 'import', 'var', 'const', 'true', 'false', 'nil', 'make', 'new', 'append', 'len', 'cap', 'error']);
  const rustKeywords = new Set(['fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'break', 'continue', 'impl', 'struct', 'enum', 'trait', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'where', 'async', 'await', 'true', 'false', 'Some', 'None', 'Ok', 'Err']);
  const shKeywords = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'export', 'source', 'alias', 'cd', 'echo', 'printf', 'read', 'local']);

  // Select keywords based on language
  let keywords = new Set();
  const isJS = ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(language);
  const isPython = ['python', 'py'].includes(language);
  const isGo = ['go', 'golang'].includes(language);
  const isRust = ['rust', 'rs'].includes(language);
  const isShell = ['bash', 'sh', 'shell', 'zsh'].includes(language);

  if (isJS) keywords = jsKeywords;
  else if (isPython) keywords = pyKeywords;
  else if (isGo) keywords = goKeywords;
  else if (isRust) keywords = rustKeywords;
  else if (isShell) keywords = shKeywords;

  // Process line by line
  const lines = code.split('\n');
  const highlightedLines = lines.map(line => {
    if (!line.trim()) return line;

    // Handle full-line comments
    const trimmed = line.trim();
    if ((isJS || isGo || isRust) && trimmed.startsWith('//')) {
      return `<span class="comment">${line}</span>`;
    }
    if ((isPython || isShell) && trimmed.startsWith('#')) {
      return `<span class="comment">${line}</span>`;
    }

    // Tokenize the line character by character
    let result = '';
    let i = 0;
    while (i < line.length) {
      // Check for HTML-escaped double quote string: &quot;...&quot;
      if (line.slice(i, i + 6) === '&quot;') {
        const endIdx = line.indexOf('&quot;', i + 6);
        if (endIdx !== -1) {
          result += `<span class="string">${line.slice(i, endIdx + 6)}</span>`;
          i = endIdx + 6;
          continue;
        }
      }

      // Check for HTML-escaped single quote string: &#39;...&#39;
      if (line.slice(i, i + 5) === '&#39;') {
        const endIdx = line.indexOf('&#39;', i + 5);
        if (endIdx !== -1) {
          result += `<span class="string">${line.slice(i, endIdx + 5)}</span>`;
          i = endIdx + 5;
          continue;
        }
      }

      // Check for word (identifier/keyword)
      if (/[a-zA-Z_]/.test(line[i])) {
        let word = '';
        while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
          word += line[i];
          i++;
        }
        if (keywords.has(word)) {
          result += `<span class="keyword">${word}</span>`;
        } else if (line[i] === '(') {
          result += `<span class="function">${word}</span>`;
        } else {
          result += word;
        }
        continue;
      }

      // Check for number
      if (/[0-9]/.test(line[i])) {
        let num = '';
        while (i < line.length && /[0-9.]/.test(line[i])) {
          num += line[i];
          i++;
        }
        result += `<span class="number">${num}</span>`;
        continue;
      }

      // Default: pass through character
      result += line[i];
      i++;
    }
    return result;
  });

  return highlightedLines.join('\n');
}

// =============================================================================
// Markdown Parsing (AC1)
// =============================================================================

/**
 * Parse markdown text to HTML
 * @param {string} markdown - Raw markdown text
 * @returns {string} HTML string
 */
export function parseMarkdown(markdown) {
  if (!markdown) return '';

  // SECURITY: Escape HTML special characters FIRST to prevent XSS
  // This ensures any <script>, <img onerror>, etc. are neutralized before processing
  // Markdown syntax chars (*, #, `, -) are NOT escaped, so regexes still work
  let html = escapeHtml(markdown);

  // Code blocks with syntax highlighting (must be first to avoid conflicts)
  // Content is already escaped, apply highlighting then wrap
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    const highlighted = lang ? highlightCode(code.trim(), lang) : code.trim();
    return `<pre><code${langClass}>${highlighted}</code></pre>`;
  });

  // B-15: Join multi-line list items BEFORE other processing
  // Indented continuation lines (2+ spaces) are joined to previous list item
  // Stop at blank lines or new list items
  html = html.replace(/^(\d+\.\s+.+)\n((?:  +[^\n]+\n)+)/gm, (_, firstLine, continuation) => {
    // Join continuation lines with spaces, removing leading whitespace
    // Preserve trailing newline for next list item
    const joined = continuation.trim().replace(/\n\s*/g, ' ');
    return `${firstLine} ${joined}\n`;
  });

  // Inline code - content already escaped
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Tables - convert | delimited rows to HTML tables
  // Must be after code blocks to avoid parsing tables in code
  html = parseMarkdownTables(html);

  // Headers (h1-h6) - content already escaped
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic - content already escaped
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Unordered lists - mark with data attribute to distinguish from ordered
  html = html.replace(/^- (.+)$/gm, '<li data-ul>$1</li>');

  // Ordered lists - mark with data attribute
  // B-15: Match ordered list items that may contain inline formatting
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li data-ol>$1</li>');

  // Wrap consecutive unordered list items
  html = html.replace(/(<li data-ul>.*?<\/li>\n?)+/g, (match) => {
    return `<ul>${match.replace(/ data-ul/g, '')}</ul>`;
  });

  // Wrap consecutive ordered list items
  html = html.replace(/(<li data-ol>.*?<\/li>\n?)+/g, (match) => {
    return `<ol>${match.replace(/ data-ol/g, '')}</ol>`;
  });

  // Paragraphs (lines not already wrapped) - content already escaped
  // Excludes: h1-6, ul, ol, li, pre, div (table-wrapper), table elements
  html = html.replace(/^(?!<[hulodtp]|<pre|<li)(.+)$/gm, '<p>$1</p>');

  return html;
}

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Parse markdown tables to HTML
 * Detects consecutive lines starting with | and converts to <table>
 * @param {string} text - Text with escaped HTML
 * @returns {string} Text with tables converted to HTML
 */
function parseMarkdownTables(text) {
  const lines = text.split('\n');
  const result = [];
  let tableLines = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line is a table row (starts and ends with |, or starts with |)
    const isTableRow = line.startsWith('|') && line.includes('|', 1);

    if (isTableRow) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      // End of table or not a table line
      if (inTable && tableLines.length > 0) {
        result.push(convertTableLinesToHtml(tableLines));
        tableLines = [];
        inTable = false;
      }
      result.push(lines[i]); // Preserve original line (not trimmed)
    }
  }

  // Handle table at end of text
  if (inTable && tableLines.length > 0) {
    result.push(convertTableLinesToHtml(tableLines));
  }

  return result.join('\n');
}

/**
 * Convert array of table lines to HTML table
 * @param {string[]} lines - Array of | delimited lines
 * @returns {string} HTML table string
 */
function convertTableLinesToHtml(lines) {
  if (lines.length === 0) return '';

  // Parse cells from a line: | cell1 | cell2 | cell3 |
  const parseCells = (line) => {
    return line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell, index, arr) => {
        // Filter out empty first/last cells from leading/trailing |
        if (index === 0 && cell === '') return false;
        if (index === arr.length - 1 && cell === '') return false;
        return true;
      });
  };

  // Check if a line is a separator row (|---|---|)
  const isSeparator = (line) => {
    const cells = parseCells(line);
    return cells.every((cell) => /^[-:]+$/.test(cell));
  };

  // Filter out separator rows and identify header
  const dataLines = [];
  let headerLine = null;
  let foundSeparator = false;

  for (const line of lines) {
    if (isSeparator(line)) {
      foundSeparator = true;
      continue; // Skip separator rows
    }
    if (!foundSeparator && headerLine === null) {
      headerLine = line; // First non-separator row is header
    } else {
      dataLines.push(line);
    }
  }

  // Build HTML table
  let html = '<div class="table-wrapper"><table>';

  // Header row
  if (headerLine) {
    const headerCells = parseCells(headerLine);
    html += '<thead><tr>';
    for (const cell of headerCells) {
      html += `<th>${cell}</th>`;
    }
    html += '</tr></thead>';
  }

  // Body rows
  if (dataLines.length > 0) {
    html += '<tbody>';
    for (const line of dataLines) {
      const cells = parseCells(line);
      html += '<tr>';
      for (const cell of cells) {
        html += `<td>${cell}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table></div>';
  return html;
}

// =============================================================================
// B-14: Formatting Functions
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
// B-14: Tool Status Tracking
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
// Message Rendering (AC1-AC3)
// =============================================================================

/**
 * Render a text/assistant message with markdown
 * @param {import('../../../../claude-service.js').SDKAssistantMessage} message
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
 * @param {import('../../../../claude-service.js').SDKToolUseMessage} message
 * @returns {string} HTML string
 */
export function renderToolUseMessage(message) {
  const { tool_name, tool_id, input } = message;
  const inputJson = JSON.stringify(input, null, 2);

  // B-14: Get tool status for indicator
  const status = getToolStatus(tool_id);
  const statusClass = status ? ` tool-status-${status}` : '';

  // Special handling for Task tool - show helper name and description
  if (tool_name === 'Task' && input) {
    const helperName = getHelperName() || input.subagent_type || 'Task';
    const description = input.description || '';
    const displayName = description ? `${helperName}: ${description}` : helperName;

    // 22-5: Add open attribute when verbose mode is enabled
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

  // 22-5: Add open attribute when verbose mode is enabled
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
 * @param {import('../../../../claude-service.js').SDKToolUseMessage} _message
 * @returns {boolean}
 */
export function isToolUseCollapsible(_message) {
  // All tool use blocks are collapsible by default
  return true;
}

/**
 * Render a tool result message with output
 * @param {import('../../../../claude-service.js').SDKToolResultMessage} message
 * @returns {string} HTML string
 */
export function renderToolResultMessage(message) {
  const { tool_id, output, is_error } = message;
  const isLong = output.length > COLLAPSIBLE_THRESHOLD;
  const errorClass = is_error ? ' error' : '';

  const content = `<pre><code>${escapeHtml(output)}</code></pre>`;

  if (isLong) {
    // 22-5: Add open attribute when verbose mode is enabled
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
 * @param {import('../../../../claude-service.js').SDKSystemMessage} message
 * @returns {string} HTML string
 */
export function renderSystemMessage(message) {
  const { session_id, model, cwd, tools, subtype, permissionMode } = message;

  // For init messages, show model name and permission mode (B-14)
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
 * @param {import('../../../../claude-service.js').SDKResultMessage} message
 * @returns {string} HTML string
 */
export function renderResultMessage(message) {
  const { usage, cost_usd, duration_ms, num_turns } = message;

  // B-14: Use new formatters for turn count and duration
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
 * @param {import('../../../../claude-service.js').SDKErrorMessage} message
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
 * @param {object} message - Message with content property
 * @returns {string} HTML string
 */
export function renderUserMessage(message) {
  // Distinguish between editor input and SDK tool_result messages
  // Editor sends: {type: 'user', content: 'string'}
  // SDK sends: {type: 'user', message: {content: [{type: 'tool_result', ...}]}}

  // If it's an SDK tool_result message, don't render it
  if (message.message?.content) {
    // This is a tool result from SDK - skip it
    return '';
  }

  const { content } = message;

  // Only render if we have string content from the editor
  if (typeof content !== 'string' || !content.trim()) {
    return '';
  }

  // User messages are already plain text/markdown from the editor
  return `<div class="message message-user">${parseMarkdown(content)}</div>`;
}

/**
 * Render any SDK message based on type
 * @param {import('../../../../claude-service.js').SDKMessage} message
 * @returns {string} HTML string or empty string for filtered messages
 */
export function renderMessage(message) {
  // Filter out messages we don't want to display
  if (shouldFilterMessage(message)) {
    return '';
  }

  switch (message.type) {
    case 'system':
      return renderSystemMessage(message);
    case 'assistant':
    case 'message':
      return renderTextMessage(message);
    case 'user':
      return renderUserMessage(message);
    case 'tool_use':
      return renderToolUseMessage(message);
    case 'tool_result':
      return renderToolResultMessage(message);
    case 'result':
      return renderResultMessage(message);
    case 'error':
      return renderErrorMessage(message);
    default:
      // Log unknown message types for debugging but don't display
      console.log('[MessageView] Unknown message type:', message.type, message);
      return '';
  }
}

/**
 * Determine if a message should be filtered (not displayed)
 * @param {import('../../../../claude-service.js').SDKMessage} message
 * @returns {boolean} true if message should be hidden
 */
function shouldFilterMessage(message) {
  // Filter out hook responses - these are internal to Claude CLI
  if (message.type === 'system' && message.subtype === 'hook_response') {
    return true;
  }

  // Filter out duplicate init messages - only show the first one per session
  // Each message spawns a new Claude CLI process that emits an init message,
  // but we only want to show it once to avoid cluttering the conversation
  if (message.type === 'system' && message.subtype === 'init') {
    if (hasShownInitMessage) {
      return true; // Filter out subsequent init messages
    }
    hasShownInitMessage = true; // Mark that we've shown the first one
  }

  // Filter out empty assistant messages
  if ((message.type === 'assistant' || message.type === 'message') && !hasTextContent(message)) {
    return true;
  }

  // Filter out content_block events (streaming internals)
  if (message.type === 'content_block_start' ||
      message.type === 'content_block_delta' ||
      message.type === 'content_block_stop') {
    return true;
  }

  // Filter out message_start/stop events
  if (message.type === 'message_start' || message.type === 'message_stop') {
    return true;
  }

  return false;
}

/**
 * Check if an assistant message has meaningful text content
 * @param {object} message
 * @returns {boolean}
 */
function hasTextContent(message) {
  const content = message.message?.content || message.content || [];
  // Check for text blocks with actual content (not just brackets or whitespace)
  return content.some((block) => {
    if (block.type !== 'text') return false;
    const text = block.text?.trim();
    // Filter out empty, very short (< 3 chars), or bracket-only content
    if (!text || text.length < 3) return false;
    if (/^[\[\]{}()\s]*$/.test(text)) return false;
    return true;
  });
}

// =============================================================================
// Thinking Indicator
// =============================================================================

/**
 * Show the thinking indicator (throbbing border on persona card) and enable stop button
 */
export function showThinking() {
  const personaSection = document.getElementById('persona-section');
  if (personaSection) {
    personaSection.classList.add('thinking');
  }
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.disabled = false;
  }
}

/**
 * Hide the thinking indicator and disable stop button
 */
export function hideThinking() {
  const personaSection = document.getElementById('persona-section');
  if (personaSection) {
    personaSection.classList.remove('thinking');
  }
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.disabled = true;
  }
}

// =============================================================================
// Scrolling (AC4)
// =============================================================================

/**
 * Scroll the message container to the bottom
 * Uses requestAnimationFrame to ensure DOM has updated
 */
export function scrollToBottom() {
  if (containerElement) {
    requestAnimationFrame(() => {
      containerElement.scrollTop = containerElement.scrollHeight;
    });
  }
}

/**
 * Check if user has scrolled up from bottom
 * @returns {boolean}
 */
export function isUserScrolledUp() {
  if (!containerElement) return false;
  const { scrollTop, scrollHeight, clientHeight } = containerElement;
  return scrollHeight - scrollTop - clientHeight > SCROLL_THRESHOLD;
}

/**
 * Set auto-scroll enabled state
 * @param {boolean} enabled
 */
export function setAutoScroll(enabled) {
  autoScrollEnabled = enabled;
}

/**
 * Get auto-scroll enabled state
 * @returns {boolean}
 */
export function getAutoScroll() {
  return autoScrollEnabled;
}

// =============================================================================
// Verbose Mode (22-5)
// =============================================================================

/**
 * Set verbose mode state
 * When enabled, tool blocks are rendered expanded by default
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
// Streaming (AC5)
// =============================================================================

/**
 * Start a new streaming message
 * @param {string} [messageId] - Optional message ID for correlation
 */
export function startStreamingMessage(messageId = null) {
  streamingState = {
    isStreaming: true,
    currentText: '',
    messageId,
  };
}

/**
 * Update the current streaming message with new text
 * @param {string} text - Text to append or replace
 * @param {boolean} [append=true] - Whether to append or replace
 */
export function updateStreamingMessage(text, append = true) {
  if (append) {
    streamingState.currentText += text;
  } else {
    streamingState.currentText = text;
  }
}

/**
 * End the current streaming message
 */
export function endStreamingMessage() {
  streamingState = {
    isStreaming: false,
    currentText: '',
    messageId: null,
  };
}

/**
 * Get current streaming state
 * @returns {{ isStreaming: boolean, currentText: string, messageId: string | null }}
 */
export function getStreamingState() {
  return { ...streamingState };
}

// =============================================================================
// Theme (Integration)
// =============================================================================

/**
 * Apply a theme to the message view
 * @param {'dark' | 'light'} theme
 */
export function applyTheme(theme) {
  if (!containerElement) return;

  // Remove existing theme classes
  containerElement.classList.remove(THEME_CLASSES.dark, THEME_CLASSES.light);

  // Apply new theme class
  if (theme === 'dark') {
    containerElement.classList.add(THEME_CLASSES.dark);
  } else {
    containerElement.classList.add(THEME_CLASSES.light);
  }
}

// =============================================================================
// Component Lifecycle
// =============================================================================

/**
 * MessageView component (placeholder for mounting)
 * In vanilla JS, this is the object representing the view
 */
export const MessageView = {
  mount: (containerId) => createMessageView(containerId),
  render: renderMessage,
};

/**
 * Create and mount the MessageView in the DOM
 * @param {string} containerId - ID of container element
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createMessageView(containerId = MESSAGE_VIEW_CONTAINER_ID) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container element #${containerId} not found`);
  }

  // Reset module state for fresh view
  autoScrollEnabled = true;

  containerElement = container;
  container.innerHTML = '';
  container.classList.add('message-view');

  // Set up scroll listener for auto-scroll detection (save reference for cleanup)
  scrollHandler = () => {
    if (isUserScrolledUp()) {
      setAutoScroll(false);
    } else {
      // Re-enable auto-scroll when user scrolls back to bottom
      setAutoScroll(true);
    }
  };
  container.addEventListener('scroll', scrollHandler);

  return {
    element: container,
    destroy: () => {
      // Remove event listener to prevent memory leak
      if (scrollHandler) {
        container.removeEventListener('scroll', scrollHandler);
        scrollHandler = null;
      }
      containerElement = null;
      container.innerHTML = '';
    },
  };
}

/**
 * Add a message to the view and store
 * @param {import('../../../../claude-service.js').SDKMessage} message
 */
export function addMessage(message) {
  storeAddMessage(message);

  if (containerElement) {
    const html = renderMessage(message);
    containerElement.insertAdjacentHTML('beforeend', html);

    if (autoScrollEnabled) {
      scrollToBottom();
    }
  }
}

/**
 * Clear all messages from view and store
 */
export function clearMessages() {
  storeClearMessages();
  hasShownInitMessage = false; // Reset so new session shows its init message

  if (containerElement) {
    containerElement.innerHTML = '';
  }
}

// =============================================================================
// Quick Actions Functions (B-9.6)
// =============================================================================

/**
 * Strip markdown formatting from text for display in buttons/UI.
 * Removes bold, italic, code, links, etc.
 * @param {string} text - Text with markdown
 * @returns {string} Plain text without markdown
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')     // **bold** -> bold
    .replace(/\*(.+?)\*/g, '$1')         // *italic* -> italic
    .replace(/__(.+?)__/g, '$1')         // __bold__ -> bold
    .replace(/_(.+?)_/g, '$1')           // _italic_ -> italic
    .replace(/`(.+?)`/g, '$1')           // `code` -> code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) -> text
    .replace(/^#+\s+/gm, '')             // # heading -> heading
    .trim();
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncateText(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

/**
 * Extract the last meaningful paragraph from text.
 * Skips empty lines and code blocks.
 * @param {string} text - Full message text
 * @returns {string} Last paragraph
 */
function getLastParagraph(text) {
  if (!text) return '';

  // Remove code blocks first
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');

  // Split into paragraphs (double newline or end of text)
  const paragraphs = withoutCode
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Return last non-empty paragraph, or full text if no splits
  return paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : withoutCode.trim();
}

/**
 * Detect yes/no question patterns in text.
 * Only checks the LAST PARAGRAPH to avoid false positives from explanatory text.
 * @param {string} text - Text to analyze
 * @returns {Object|null} Detection result with type and responses, or null
 */
export function detectQuestionPattern(text) {
  if (!text) return null;

  // Focus on the last paragraph where actual questions appear
  const lastParagraph = getLastParagraph(text);
  if (!lastParagraph) return null;

  const endsWithQuestion = lastParagraph.trimEnd().endsWith('?');

  for (const { pattern, responses, requiresQuestion } of QUESTION_PATTERNS) {
    if (pattern.test(lastParagraph)) {
      // If pattern requires a question mark, check for it
      if (requiresQuestion && !endsWithQuestion) {
        continue;
      }
      return { type: 'yesno', responses };
    }
  }

  return null;
}

/**
 * Detect numbered list choice patterns in text
 * Looks for sequential numbered options starting from 1
 * @param {string} text - Text to analyze
 * @returns {Object|null} Detection result with type and choices, or null
 */
export function detectListChoices(text) {
  if (!text) return null;

  // Skip if text is inside a code block
  if (text.includes('```')) {
    // Remove code blocks before checking
    const withoutCode = text.replace(/```[\s\S]*?```/g, '');
    if (!withoutCode.trim()) return null;
    text = withoutCode;
  }

  // Patterns for numbered lists: "1. text", "1) text", "**1.** text"
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm,           // "1. Option text"
    /^\s*(\d+)\)\s+(.+)$/gm,           // "1) Option text"
    /\*\*(\d+)[\.\)]\*\*\s*(.+)/gm,    // "**1.** Option text"
  ];

  let choices = [];

  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    const tempChoices = [];

    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      const optionText = match[2].trim();
      tempChoices.push({ number: num, text: optionText });
    }

    // Check if we found more choices than before
    if (tempChoices.length > choices.length) {
      choices = tempChoices;
    }
  }

  // Must have at least 2 choices
  if (choices.length < 2) return null;

  // Sort by number
  choices.sort((a, b) => a.number - b.number);

  // Must start from 1 and be sequential
  if (choices[0].number !== 1) return null;

  // Verify sequential
  for (let i = 0; i < choices.length; i++) {
    if (choices[i].number !== i + 1) return null;
  }

  // Filter out documentation/description lists (not user choices)
  // These indicators suggest the list describes actions, not options to choose
  const notChoiceIndicators = [
    // Past tense - things already done
    'read', 'analyzed', 'made', 'wrote', 'created', 'added', 'removed', 'fixed',
    'updated', 'changed', 'modified', 'implemented', 'completed', 'finished',
    'found', 'discovered', 'identified', 'checked', 'verified', 'confirmed',
    // Present continuous - things being described
    'reading', 'analyzing', 'making', 'writing', 'creating', 'adding',
    // Descriptive patterns - explaining what something does/is
    'the', 'this', 'a', 'an', 'it', 'when', 'if', 'for', 'with',
    // File/code references
    'src/', './', '../', 'file:', 'line',
  ];

  // Check first word of first few items
  for (let i = 0; i < Math.min(choices.length, 3); i++) {
    const firstWord = choices[i].text.toLowerCase().split(/\s+/)[0];
    if (notChoiceIndicators.includes(firstWord)) {
      return null;
    }
    // Also reject if it looks like a file path
    if (choices[i].text.match(/^[a-zA-Z0-9_\-./]+\.(js|ts|md|json|yaml|go|py|sh)$/)) {
      return null;
    }
  }

  // Require a "choice" context - look for indicators that these ARE choices
  // Check if the text before the list suggests a choice
  const textLower = text.toLowerCase();
  const choiceIndicators = [
    'which', 'choose', 'select', 'pick', 'option', 'prefer',
    'would you like', 'do you want', 'should i', 'approach',
    'alternative', 'either', 'or we could',
  ];

  const hasChoiceContext = choiceIndicators.some(indicator =>
    textLower.includes(indicator)
  );

  // If no choice context, don't show buttons - it's probably documentation
  if (!hasChoiceContext) {
    return null;
  }

  return { type: 'list', choices };
}

/**
 * Render quick action buttons HTML
 * @param {Object} result - Detection result from detectQuestionPattern or detectListChoices
 * @returns {string} HTML string for buttons
 */
export function renderQuickActions(result) {
  if (!result) return '';

  if (result.type === 'yesno') {
    const buttons = result.responses.map(response =>
      `<button class="quick-action-btn" data-response="${response}">${response}</button>`
    ).join('\n');

    return `<div class="quick-actions-container">\n${buttons}\n</div>`;
  }

  if (result.type === 'list') {
    const buttons = result.choices.map(choice => {
      // Strip markdown before truncating and escaping for clean button labels
      const cleanText = stripMarkdown(choice.text);
      const displayText = `${choice.number}. ${truncateText(escapeHtml(cleanText), 15)}`;
      return `<button class="quick-action-btn" data-response="${choice.number}">${displayText}</button>`;
    }).join('\n');

    return `<div class="quick-actions-container" style="flex-wrap: wrap; overflow-x: auto;">\n${buttons}\n</div>`;
  }

  return '';
}

/**
 * Clear quick action buttons from the DOM
 */
export function clearQuickActions() {
  quickActionsVisible = false;
  const container = document.getElementById('quick-actions');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Handle quick action button click
 * @param {string} response - The response text to insert
 */
export function handleQuickActionClick(response) {
  // Insert and immediately submit - no extra clicks needed
  insertAndSubmit(response);
}

/**
 * Set quick actions visibility state
 * @param {boolean} visible - Whether buttons should be visible
 */
export function setQuickActionsVisible(visible) {
  quickActionsVisible = visible;
}

/**
 * Get quick actions visibility state
 * @returns {boolean} Whether buttons are visible
 */
export function getQuickActionsVisible() {
  return quickActionsVisible;
}

/**
 * Set auto-submit enabled state
 * @param {boolean} enabled - Whether auto-submit is enabled
 */
export function setAutoSubmit(enabled) {
  autoSubmitEnabled = enabled;
}

/**
 * Get auto-submit enabled state
 * @returns {boolean} Whether auto-submit is enabled
 */
export function getAutoSubmit() {
  return autoSubmitEnabled;
}

/**
 * Called when a response is submitted to clear quick actions
 */
export function onResponseSubmitted() {
  clearQuickActions();
}

/**
 * Process a message to determine if quick actions should be shown
 * @param {Object} message - SDK message object
 * @returns {Object|null} Detection result or null
 */
export function processMessageForQuickActions(message) {
  // Only process assistant messages
  if (message?.type !== 'assistant') return null;

  // Extract text content
  const content = message?.message?.content;
  if (!Array.isArray(content)) return null;

  const textContent = content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  if (!textContent) return null;

  // Check for list choices first (higher priority)
  const listResult = detectListChoices(textContent);
  if (listResult) return listResult;

  // Then check for yes/no questions
  const questionResult = detectQuestionPattern(textContent);
  if (questionResult) return questionResult;

  return null;
}
