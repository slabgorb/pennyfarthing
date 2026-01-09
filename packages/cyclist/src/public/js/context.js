/**
 * Context Meter - Progress bar for context usage visualization
 * B-19: Displays context window usage as a visual progress bar
 */

/**
 * Default context window limit for Claude models (Opus)
 */
const DEFAULT_CONTEXT_LIMIT = 200000;

/**
 * Calculate context usage percentage from token counts
 * @param {number|null|undefined} used - Number of tokens used
 * @param {number} limit - Maximum context window size
 * @returns {number} Percentage (0-100), capped at 100
 */
function calculateContextPercentage(used, limit) {
  // Handle null/undefined gracefully
  if (used === null || used === undefined || isNaN(used)) {
    return 0;
  }

  // Avoid division by zero
  if (!limit || limit <= 0) {
    return 0;
  }

  const percentage = (used / limit) * 100;
  return Math.min(100, Math.round(percentage));
}

/**
 * Get the context level based on usage percentage
 * @param {number} percent - Usage percentage (0-100)
 * @returns {string} Level: 'safe' (<50%), 'warning' (50-79%), 'danger' (80-94%), 'critical' (95%+)
 */
function getContextLevel(percent) {
  if (percent >= 95) return 'critical';
  if (percent >= 80) return 'danger';
  if (percent >= 50) return 'warning';
  return 'safe';
}

/**
 * Format number with locale-aware comma separators
 * @param {number} n - Number to format
 * @returns {string} Formatted string
 */
function formatNumber(n) {
  return n.toLocaleString('en-US');
}

/**
 * Format tooltip text showing raw token counts
 * @param {number|null|undefined} used - Tokens used
 * @param {number} limit - Context limit
 * @returns {string} Formatted tooltip string
 */
function formatTooltip(used, limit) {
  // Handle unavailable data
  if (used === null || used === undefined || isNaN(used)) {
    return 'Context usage unavailable';
  }

  return `${formatNumber(used)} / ${formatNumber(limit)} tokens`;
}

/**
 * Update the context meter display
 * @param {number|null|undefined} inputTokens - Input tokens used
 * @param {number|null|undefined} outputTokens - Output tokens used
 */
function updateContextMeter(inputTokens, outputTokens) {
  const meter = document.querySelector('.context-meter');
  const fill = document.querySelector('.context-meter .progress-fill');
  const label = document.querySelector('.context-percent');

  if (!meter || !fill || !label) return;

  // Calculate total used tokens
  const used = (inputTokens || 0) + (outputTokens || 0);
  const percent = calculateContextPercentage(used, DEFAULT_CONTEXT_LIMIT);
  const level = getContextLevel(percent);

  // Update progress bar width
  fill.style.width = `${percent}%`;

  // Update percentage label
  if (used > 0) {
    label.textContent = `${percent}%`;
  } else {
    label.textContent = '—%';
  }

  // Update color level class
  meter.classList.remove('level-safe', 'level-warning', 'level-danger', 'level-critical');
  if (used > 0) {
    meter.classList.add(`level-${level}`);
  }

  // Update tooltip
  if (used > 0) {
    meter.title = formatTooltip(used, DEFAULT_CONTEXT_LIMIT);
  } else {
    meter.title = 'Context usage unavailable';
  }
}

/**
 * Initialize context meter via Electron IPC
 */
async function initContextMeter() {
  // Check if Electron API is available
  if (!window.electronAPI?.tokenStats) {
    console.warn('Electron tokenStats API not available for context meter');
    return;
  }

  // Get initial token stats and update context meter
  try {
    const tokenStats = await window.electronAPI.tokenStats.get();
    if (tokenStats) {
      updateContextMeter(tokenStats.inputTokens, tokenStats.outputTokens);
    }
  } catch (err) {
    console.error('Failed to get initial token stats for context meter:', err);
  }

  // Subscribe to token stats updates
  window.electronAPI.tokenStats.onUpdate((_event, tokenStats) => {
    if (tokenStats) {
      updateContextMeter(tokenStats.inputTokens, tokenStats.outputTokens);
    }
  });

  // Also subscribe to context:update channel if available (B-19)
  // Context API returns { percent, tokens, status, error } from check-context.sh
  if (window.electronAPI?.context?.onUpdate) {
    window.electronAPI.context.onUpdate((_event, data) => {
      if (data && data.percent !== null && data.percent !== undefined) {
        // Context API provides percent directly, convert to tokens for meter
        // Assume 200K max tokens for display purposes
        const estimatedTokens = Math.round((data.percent / 100) * 200000);
        updateContextMeter(estimatedTokens, 0);
      }
    });
  }

  console.log('[Context] Context meter initialized');
}

// Initialize on page load
initContextMeter();

// Export for external use
window.updateContextMeter = updateContextMeter;
