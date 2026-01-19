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
 * @type {Map<string, {tool_name: string, input: object}>}
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
 * Generate a human-readable summary for a tool invocation
 * @param {string} toolName - Name of the tool
 * @param {object} input - Tool input parameters
 * @returns {string} Summary string for display
 */
function generateToolSummary(toolName, input) {
  if (!input) return toolName;

  switch (toolName) {
    case 'Read':
      return extractFilename(input.file_path) || 'Read';

    case 'Write':
      return extractFilename(input.file_path) || 'Write';

    case 'Edit':
      return extractFilename(input.file_path) || 'Edit';

    case 'Glob':
      return input.pattern || 'Glob';

    case 'Grep':
      return input.pattern || 'Grep';

    case 'Bash':
      // Handled separately with bash_command
      return input.command || 'Bash';

    case 'Task':
      return input.description || 'Task';

    case 'WebFetch':
      return input.url ? new URL(input.url).hostname : 'WebFetch';

    case 'WebSearch':
      return input.query || 'WebSearch';

    case 'TodoWrite':
      return 'TodoWrite';

    case 'AskUserQuestion':
      return 'Question';

    case 'NotebookEdit':
      return extractFilename(input.notebook_path) || 'NotebookEdit';

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

  // Cache tool_use messages
  if (message.type === 'tool_use' && message.tool_id) {
    toolUseCache.set(message.tool_id, {
      tool_name: message.tool_name,
      input: message.input,
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

    // Create enriched copy with tool_name and summary
    const enriched = {
      ...message,
      tool_name: toolUseData.tool_name,
      tool_summary: generateToolSummary(toolUseData.tool_name, toolUseData.input),
    };

    // Add Bash-specific enrichment
    if (toolUseData.tool_name === 'Bash') {
      enriched.bash_command = toolUseData.input?.command || '';
      enriched.bash_description = toolUseData.input?.description || '';
      // Exit code: 0 for success, 1 for error
      enriched.bash_exit_code = message.is_error ? 1 : 0;
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
