/**
 * Stats management for sidebar
 * Uses Electron IPC for real-time updates from main process
 */

/**
 * Format token count for display (E6-3)
 * @param {number} n - Token count
 * @returns {string} - Formatted string (e.g., "1.2k", "45k", "1.5M")
 */
function formatTokenCount(n) {
  if (n === undefined || n === null) return '—';
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1000000) return Math.round(n / 1000) + 'k';
  return (n / 1000000).toFixed(1) + 'M';
}

/**
 * Update all stats at once
 * @param {Object} stats - Stats object with model, status, context, mode, connected
 */
function updateStats(stats) {
  if (stats.model !== undefined) {
    updateStat('model', stats.model);
  }
  if (stats.context !== undefined) {
    updateStat('context', stats.context);
  }
  // Mode is now handled by controls.js via IPC (not PTY-based detection)
  if (stats.connected !== undefined) {
    updateConnectionDot(stats.connected, stats.status);
  }
}

/**
 * Update the connection status dot next to model
 * @param {boolean} connected - True if PTY process is alive
 * @param {string} status - Current status (ready, working, etc.)
 */
function updateConnectionDot(connected, status) {
  const dot = document.querySelector('[data-stat="status-dot"]');
  if (!dot) return;

  // Remove all state classes
  dot.classList.remove('connected', 'working');

  if (!connected) {
    // Red dot - disconnected (default CSS is red)
    return;
  }

  // Connected - check if working or ready
  const statusLower = (status || '').toLowerCase();
  if (statusLower === 'working' || statusLower === 'streaming') {
    dot.classList.add('working'); // Yellow/orange dot
  } else {
    dot.classList.add('connected'); // Green dot
  }
}

/**
 * Mode mapping from Claude Code status to display label and CSS class
 */
const MODE_CONFIG = {
  'Normal': { label: 'MANUAL', className: null },
  'Plan': { label: 'PLAN', className: 'mode-plan' },
  'Auto-accept': { label: 'ACCEPT', className: 'mode-accept' }
};

/**
 * Update the mode button label to reflect current permission mode
 * @param {string} mode - The current mode (Normal, Plan, Auto-accept)
 */
function updateModeButton(mode) {
  const modeBtn = document.querySelector('[data-control="plan-mode"]');
  if (!modeBtn) return;

  const config = MODE_CONFIG[mode] || { label: mode.toUpperCase(), className: null };
  const oldLabel = modeBtn.textContent.trim();

  if (oldLabel !== config.label) {
    modeBtn.textContent = config.label;

    // Remove all mode classes and add the appropriate one
    modeBtn.classList.remove('mode-plan', 'mode-accept');
    if (config.className) {
      modeBtn.classList.add(config.className);
    }

    // Add pulse animation for visual feedback
    modeBtn.classList.add('updated');
    setTimeout(() => {
      modeBtn.classList.remove('updated');
    }, 500);
  }
}

/**
 * Update a single stat value with visual feedback
 * @param {string} key - The stat key (model, status, context)
 * @param {string|number} value - The new value
 */
function updateStat(key, value) {
  const element = document.querySelector(`[data-stat="${key}"]`);
  if (!element) return;

  const oldValue = element.textContent;
  const newValue = String(value);

  // Only update and animate if value changed
  if (oldValue !== newValue) {
    element.textContent = newValue;

    // Add pulse animation class for visual feedback
    element.classList.add('updated');

    // Remove class after animation completes
    setTimeout(() => {
      element.classList.remove('updated');
    }, 500);
  }

  // Handle status color coding
  if (key === 'status') {
    element.classList.remove('status-ready', 'status-working', 'status-error');
    const statusLower = newValue.toLowerCase();
    if (statusLower === 'ready') {
      element.classList.add('status-ready');
    } else if (statusLower === 'working') {
      element.classList.add('status-working');
    } else if (statusLower === 'error') {
      element.classList.add('status-error');
    }
  }
}

/**
 * Initialize stats via Electron IPC
 */
async function initStats() {
  // Check if Electron API is available
  if (!window.electronAPI?.stats) {
    console.warn('Electron stats API not available');
    return;
  }

  // Get initial stats
  try {
    const stats = await window.electronAPI.stats.get();
    console.log('[Stats] Initial stats from main:', stats);
    if (stats) {
      updateStats(stats);
    }
  } catch (err) {
    console.error('Failed to get initial stats:', err);
  }

  // Subscribe to stats updates from main process
  window.electronAPI.stats.onUpdate((_event, stats) => {
    updateStats(stats);
  });

  // Token stats subscription (E6-3)
  if (window.electronAPI?.tokenStats) {
    // Get initial token stats
    try {
      const tokenStats = await window.electronAPI.tokenStats.get();
      console.log('[Stats] Initial token stats from main:', tokenStats);
      if (tokenStats) {
        updateStat('inputTokens', formatTokenCount(tokenStats.inputTokens));
        updateStat('outputTokens', formatTokenCount(tokenStats.outputTokens));
      }
    } catch (err) {
      console.error('Failed to get initial token stats:', err);
    }

    // Subscribe to token stats updates
    window.electronAPI.tokenStats.onUpdate((_event, tokenStats) => {
      if (tokenStats) {
        updateStat('inputTokens', formatTokenCount(tokenStats.inputTokens));
        updateStat('outputTokens', formatTokenCount(tokenStats.outputTokens));
      }
    });
    console.log('Token stats IPC connected');
  }

  console.log('Stats IPC connected');
}

// Initialize on page load
initStats();

// Export for external use
window.formatTokenCount = formatTokenCount;
window.updateStats = updateStats;
window.updateStat = updateStat;
window.updateModeButton = updateModeButton;
