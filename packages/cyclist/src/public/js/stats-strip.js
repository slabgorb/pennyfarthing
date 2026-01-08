/**
 * Stats Strip - Compact stats display in prompt bar (B-22)
 * Shows model badge, token counts, and context meter
 * Subscribes to existing IPC channels from stats.js
 */

/**
 * Update the context meter level class based on percentage
 * @param {HTMLElement} contextMini - The context-mini element
 * @param {number} percent - Context usage percentage
 */
function updateContextLevel(contextMini, percent) {
  if (!contextMini) return;

  // Remove all level classes
  contextMini.classList.remove('level-safe', 'level-warning', 'level-danger', 'level-critical');

  // Add appropriate level class based on percentage
  if (percent >= 95) {
    contextMini.classList.add('level-critical');
  } else if (percent >= 80) {
    contextMini.classList.add('level-danger');
  } else if (percent >= 50) {
    contextMini.classList.add('level-warning');
  } else {
    contextMini.classList.add('level-safe');
  }
}

/**
 * Update a stats strip element with visual feedback
 * @param {string} dataStat - The data-stat attribute value
 * @param {string} value - The new value to display
 */
function updateStripStat(dataStat, value) {
  const element = document.querySelector(`#stats-strip [data-stat="${dataStat}"]`);
  if (!element) return;

  const oldValue = element.textContent;
  const newValue = String(value);

  if (oldValue !== newValue) {
    element.textContent = newValue;

    // Add pulse animation
    element.classList.add('updated');
    setTimeout(() => {
      element.classList.remove('updated');
    }, 500);
  }
}

/**
 * Update context meter fill width and level
 * @param {number} percent - Context usage percentage (0-100)
 */
function updateContextMeter(percent) {
  const contextMini = document.querySelector('#stats-strip .context-mini');
  const fill = document.querySelector('#stats-strip .context-mini-fill');
  const label = document.querySelector('#stats-strip .context-mini-label');

  if (fill) {
    fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }

  if (label) {
    label.textContent = `${percent}%`;
  }

  updateContextLevel(contextMini, percent);
}

/**
 * Initialize stats strip IPC subscriptions
 * Reuses existing channels from stats.js
 */
async function initStatsStrip() {
  // Check if Electron API is available
  if (!window.electronAPI?.stats) {
    console.warn('[StatsStrip] Electron stats API not available');
    return;
  }

  // Get initial stats for model and context
  try {
    const stats = await window.electronAPI.stats.get();
    if (stats) {
      if (stats.model) {
        updateStripStat('strip-model', stats.model);
      }
      if (stats.context !== undefined) {
        updateContextMeter(stats.context);
      }
    }
  } catch (err) {
    console.error('[StatsStrip] Failed to get initial stats:', err);
  }

  // Subscribe to stats updates (model, context)
  window.electronAPI.stats.onUpdate((_event, stats) => {
    if (stats.model !== undefined) {
      updateStripStat('strip-model', stats.model);
    }
    if (stats.context !== undefined) {
      updateContextMeter(stats.context);
    }
  });

  // Token stats subscription
  if (window.electronAPI?.tokenStats) {
    // Get initial token stats
    try {
      const tokenStats = await window.electronAPI.tokenStats.get();
      if (tokenStats) {
        // Reuse formatTokenCount from stats.js (loaded before this script)
        const formatFn = window.formatTokenCount || ((n) => n === undefined || n === null ? '—' : String(n));
        updateStripStat('strip-input', '↓ ' + formatFn(tokenStats.inputTokens));
        updateStripStat('strip-output', '↑ ' + formatFn(tokenStats.outputTokens));
      }
    } catch (err) {
      console.error('[StatsStrip] Failed to get initial token stats:', err);
    }

    // Subscribe to token stats updates
    window.electronAPI.tokenStats.onUpdate((_event, tokenStats) => {
      if (tokenStats) {
        const formatFn = window.formatTokenCount || ((n) => n === undefined || n === null ? '—' : String(n));
        updateStripStat('strip-input', '↓ ' + formatFn(tokenStats.inputTokens));
        updateStripStat('strip-output', '↑ ' + formatFn(tokenStats.outputTokens));
      }
    });
  }

  // Context polling - get context % from check-context.sh via /api/context
  // Poll every 10 seconds since this runs a script
  if (window.electronAPI?.context?.get) {
    const pollContext = async () => {
      try {
        const ctx = await window.electronAPI.context.get();
        if (ctx && ctx.percent !== null && ctx.percent !== undefined) {
          updateContextMeter(ctx.percent);
        }
      } catch (err) {
        // Silent fail - context is optional
      }
    };

    // Initial fetch
    pollContext();

    // Poll every 10 seconds
    setInterval(pollContext, 10000);
  }

  console.log('[StatsStrip] IPC connected');
}

// Initialize on page load
initStatsStrip();

// Export for external use
window.initStatsStrip = initStatsStrip;
window.updateStripStat = updateStripStat;
window.updateContextMeter = updateContextMeter;
