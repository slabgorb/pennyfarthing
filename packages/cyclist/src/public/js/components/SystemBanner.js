/**
 * SystemBanner Component
 *
 * Displays system-level messages with Pennyfarthing branding.
 * Used for context clear notifications, TirePump events, etc.
 *
 * MSSCI-12471: Fresh start audit - show banner instead of wiping messages
 */

/**
 * Banner type constants
 */
export const BANNER_TYPES = {
  CONTEXT_CLEARED: 'context_cleared',
};

/**
 * Default messages for each banner type
 */
const DEFAULT_MESSAGES = {
  [BANNER_TYPES.CONTEXT_CLEARED]: 'Context cleared',
};

/**
 * Format a timestamp for display
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Create a system banner element
 *
 * @param {string} type - Banner type from BANNER_TYPES
 * @param {Object} options - Optional configuration
 * @param {string} options.message - Custom message to display
 * @param {string} options.nextAgent - Next agent for reload context
 * @returns {HTMLElement} The banner element
 */
export function createSystemBanner(type, options = {}) {
  const banner = document.createElement('div');
  banner.className = 'system-banner';

  // Add type-specific modifier class
  if (type === BANNER_TYPES.CONTEXT_CLEARED) {
    banner.classList.add('system-banner--context-cleared');
  }

  // Build the message
  let message = options.message || DEFAULT_MESSAGES[type] || 'System notification';
  if (options.nextAgent) {
    message += ` - loading ${options.nextAgent}`;
  }

  // Create the banner content
  banner.innerHTML = `
    <span class="system-banner-logo" aria-hidden="true"></span>
    <span class="system-banner-message">${escapeHtml(message)}</span>
    <span class="system-banner-timestamp">${formatTimestamp(new Date())}</span>
  `;

  return banner;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
