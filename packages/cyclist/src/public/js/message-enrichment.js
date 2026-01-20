/**
 * Message Enrichment Module (MSSCI-11851)
 *
 * Enriches tool_result messages with metadata from their corresponding tool_use messages.
 * This enables specialized rendering for different tool types (e.g., Bash collapsible output).
 *
 * Data Flow:
 * 1. tool_use message arrives → cache tool_id → {tool_name, input}
 * 2. tool_result message arrives → look up tool_id → enrich with cached metadata
 * 3. Enriched message passed to renderer → specialized rendering based on tool_name
 */

// =============================================================================
// State
// =============================================================================

/**
 * Cache of tool_use metadata keyed by tool_id
 * @type {Map<string, {tool_name: string, input: object, timestamp: number}>}
 */
const toolUseCache = new Map();

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract filename from a path
 * @param {string} path - Full file path
 * @returns {string} Just the filename
 */
function extractFilename(path) {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Truncate a string for display, adding ellipsis if needed
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, maxLen = 40) {
  if (!str || str.length <= maxLen) return str || '';
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Generate a human-readable summary for a tool invocation
 * Shows tool name + key identifier for clear collapsed headers.
 *
 * @param {string} toolName - Name of the tool
 * @param {object} input - Tool input parameters
 * @returns {string} Summary string for display (e.g., "Read sm.md", "Grep: pattern")
 */
function generateToolSummary(toolName, input) {
  if (!input) return toolName;

  switch (toolName) {
    case 'Read': {
      const filename = extractFilename(input.file_path);
      return filename ? `Read ${filename}` : 'Read';
    }

    case 'Write': {
      const filename = extractFilename(input.file_path);
      return filename ? `Write ${filename}` : 'Write';
    }

    case 'Edit': {
      const filename = extractFilename(input.file_path);
      return filename ? `Edit ${filename}` : 'Edit';
    }

    case 'Glob':
      return input.pattern ? `Glob: ${truncate(input.pattern)}` : 'Glob';

    case 'Grep':
      return input.pattern ? `Grep: ${truncate(input.pattern)}` : 'Grep';

    case 'Bash':
      // Prefer description (human-readable), fall back to truncated command
      if (input.description) return input.description;
      return input.command ? truncate(input.command, 50) : 'Bash';

    case 'Task':
      return input.description || 'Task';

    case 'WebFetch':
      try {
        return input.url ? `Fetch ${new URL(input.url).hostname}` : 'WebFetch';
      } catch {
        return 'WebFetch';
      }

    case 'WebSearch':
      return input.query ? `Search: ${truncate(input.query)}` : 'WebSearch';

    case 'TodoWrite':
      return 'Update todos';

    case 'AskUserQuestion':
      return 'Ask question';

    case 'NotebookEdit': {
      const filename = extractFilename(input.notebook_path);
      return filename ? `NotebookEdit ${filename}` : 'NotebookEdit';
    }

    case 'Skill':
      return input.skill ? `Skill: ${input.skill}` : 'Skill';

    default:
      return toolName;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Process a message, enriching tool_result messages with metadata from cached tool_use
 *
 * @param {Object} message - SDK message (tool_use, tool_result, or other)
 * @returns {Object} Original message or enriched copy
 */
export function enrichMessage(message) {
  if (!message || !message.type) {
    return message;
  }

  // Cache tool_use from assistant messages (SDK sends them embedded in content array)
  // Format: {type: 'assistant', message: {content: [{type: 'tool_use', id, name, input}]}}
  if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
    const timestamp = Date.now();
    for (const item of message.message.content) {
      if (item.type === 'tool_use' && item.id) {
        toolUseCache.set(item.id, {
          tool_name: item.name,
          input: item.input || {},
          timestamp,
        });
      }
    }
    return message;
  }

  // Cache standalone tool_use messages (normalized format)
  if (message.type === 'tool_use' && message.tool_id) {
    toolUseCache.set(message.tool_id, {
      tool_name: message.tool_name,
      input: message.input,
      timestamp: Date.now(),
    });
    return message;
  }

  // Enrich tool_result messages
  if (message.type === 'tool_result' && message.tool_id) {
    const toolUseData = toolUseCache.get(message.tool_id);

    if (!toolUseData) {
      // No matching tool_use found - return unchanged
      return message;
    }

    // Calculate elapsed time if we have a timestamp
    const elapsed_ms = toolUseData.timestamp ? Date.now() - toolUseData.timestamp : undefined;

    // Create enriched copy with tool_name and summary
    const enriched = {
      ...message,
      tool_name: toolUseData.tool_name,
      tool_summary: generateToolSummary(toolUseData.tool_name, toolUseData.input),
      elapsed_ms,
    };

    // Add Bash-specific enrichment
    if (toolUseData.tool_name === 'Bash') {
      enriched.bash_command = toolUseData.input?.command || '';
      enriched.bash_description = toolUseData.input?.description || '';
      // Only set exit code for errors (non-zero) - success needs no badge
      if (message.is_error) {
        enriched.bash_exit_code = 1;
      }
    }

    return enriched;
  }

  // Pass through all other message types unchanged
  return message;
}

/**
 * Clear the tool_use cache (for testing or session reset)
 */
export function clearToolUseCache() {
  toolUseCache.clear();
}

/**
 * Get the tool_use cache (for testing/debugging)
 * @returns {Map<string, {tool_name: string, input: object}>}
 */
export function getToolUseCache() {
  return toolUseCache;
}

export default {
  enrichMessage,
  clearToolUseCache,
  getToolUseCache,
};
