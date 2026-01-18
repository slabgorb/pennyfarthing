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

    // Create enriched copy with tool_name
    const enriched = {
      ...message,
      tool_name: toolUseData.tool_name,
    };

    // Add Bash-specific enrichment
    if (toolUseData.tool_name === 'Bash') {
      enriched.bash_command = toolUseData.input?.command || '';
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
