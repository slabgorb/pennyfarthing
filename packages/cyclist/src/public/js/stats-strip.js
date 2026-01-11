/**
 * Stats Strip - Compact stats display in prompt bar (B-22)
 * Shows model badge, context meter, and usage limits (23-1)
 */

/**
 * Format token count for display
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
 * Update usage level class based on remaining percentage (23-1)
 * Note: Usage shows remaining capacity, so higher is better
 * @param {HTMLElement} element - The usage element
 * @param {number} percent - Remaining usage percentage (higher = more remaining)
 */
function updateUsageLevel(element, percent) {
  if (!element) return;

  // Remove all level classes
  element.classList.remove('usage-safe', 'usage-warning', 'usage-danger');

  // Add appropriate level class based on remaining percentage
  // Green (>50%), Yellow (25-50%), Red (<25%)
  if (percent > 50) {
    element.classList.add('usage-safe');
  } else if (percent > 25) {
    element.classList.add('usage-warning');
  } else {
    element.classList.add('usage-danger');
  }
}

/**
 * Format relative time until reset (23-1)
 * @param {string|Date} resetAt - ISO timestamp or Date
 * @returns {string} - Formatted string (e.g., "2h 34m", "5d 3h")
 */
function formatResetTime(resetAt) {
  if (!resetAt) return 'Unknown';

  const reset = new Date(resetAt);
  const now = new Date();
  const diffMs = reset.getTime() - now.getTime();

  if (diffMs <= 0) return 'Resetting...';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) {
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
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
 * @param {number} [tokens] - Context token count (optional)
 */
function updateContextMeter(percent, tokens) {
  const contextMini = document.querySelector('#stats-strip .context-mini');
  const fill = document.querySelector('#stats-strip .context-mini-fill');
  const label = document.querySelector('#stats-strip .context-mini-label');

  if (fill) {
    fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }

  if (label) {
    label.textContent = `${percent}%`;
  }

  // Update context tokens display (ground truth from transcript)
  if (tokens !== undefined && tokens !== null) {
    updateStripStat('strip-context-tokens', formatTokenCount(tokens));
  }

  updateContextLevel(contextMini, percent);
}

/**
 * Update usage meter display (23-1)
 * @param {Object} usageStats - Usage stats object
 * @param {number} usageStats.fiveHourPercent - 5-hour remaining percentage
 * @param {number} usageStats.weeklyPercent - Weekly remaining percentage
 * @param {string} usageStats.fiveHourResetAt - ISO timestamp for 5-hour reset
 * @param {string} usageStats.weeklyResetAt - ISO timestamp for weekly reset
 */
function updateUsageMeter(usageStats) {
  if (!usageStats) return;

  // Check if we have real data (planType is set when data is fetched)
  const hasData = usageStats.planType && usageStats.planType !== 'unknown';

  // Update 5-hour usage
  const usage5hr = document.querySelector('#stats-strip .usage-5hr');
  if (usage5hr) {
    const valueSpan = usage5hr.querySelector('.usage-value');
    if (valueSpan) {
      if (hasData) {
        // Calculate remaining percentage (100 - used)
        const remaining5hr = Math.max(0, 100 - (usageStats.fiveHourPercent || 0));
        valueSpan.textContent = `${Math.round(remaining5hr)}%`;
      } else {
        // No data available yet
        valueSpan.textContent = '—%';
      }
    }
    // Update tooltip with reset time
    if (usageStats.fiveHourResetAt) {
      usage5hr.title = `5-hour block: Resets in ${formatResetTime(usageStats.fiveHourResetAt)}`;
    } else if (!hasData) {
      usage5hr.title = '5-hour block: Loading...';
    }
    // Update level class (safe if no data)
    const remaining5hr = hasData ? Math.max(0, 100 - (usageStats.fiveHourPercent || 0)) : 100;
    updateUsageLevel(usage5hr, remaining5hr);
  }

  // Update weekly usage
  const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
  if (usageWeekly) {
    const valueSpan = usageWeekly.querySelector('.usage-value');
    if (valueSpan) {
      if (hasData) {
        // Calculate remaining percentage (100 - used)
        const remainingWeekly = Math.max(0, 100 - (usageStats.weeklyPercent || 0));
        valueSpan.textContent = `${Math.round(remainingWeekly)}%`;
      } else {
        // No data available yet
        valueSpan.textContent = '—%';
      }
    }
    // Update tooltip with reset time
    if (usageStats.weeklyResetAt) {
      usageWeekly.title = `Weekly: Resets in ${formatResetTime(usageStats.weeklyResetAt)}`;
    } else if (!hasData) {
      usageWeekly.title = 'Weekly: Loading...';
    }
    // Update level class (safe if no data)
    const remainingWeekly = hasData ? Math.max(0, 100 - (usageStats.weeklyPercent || 0)) : 100;
    updateUsageLevel(usageWeekly, remainingWeekly);
  }
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

  // Get initial stats for model only (context handled separately via context IPC)
  try {
    const stats = await window.electronAPI.stats.get();
    if (stats) {
      if (stats.model) {
        updateStripStat('strip-model', stats.model);
      }
      // Note: stats.context is a placeholder '—', don't use it
      // Real context comes from dedicated context IPC channel below
    }
  } catch (err) {
    console.error('[StatsStrip] Failed to get initial stats:', err);
  }

  // Subscribe to stats updates (model only - context handled separately)
  window.electronAPI.stats.onUpdate((_event, stats) => {
    if (stats.model !== undefined) {
      updateStripStat('strip-model', stats.model);
    }
    // Don't update context from stats channel - it's always '—'
  });

  // 23-1: Token stats subscription removed - replaced by usage limits

  // Context usage - subscribe to main process polling updates (B-19)
  // Context data includes both percent and tokens (ground truth from transcript)
  if (window.electronAPI?.context) {
    // Get initial context via IPC
    if (window.electronAPI.context.get) {
      try {
        const ctx = await window.electronAPI.context.get();
        if (ctx && ctx.percent !== null && ctx.percent !== undefined) {
          updateContextMeter(ctx.percent, ctx.tokens);
        }
      } catch (err) {
        // Silent fail - context is optional
      }
    }

    // Subscribe to context updates from main process polling
    if (window.electronAPI.context.onUpdate) {
      window.electronAPI.context.onUpdate((_event, ctx) => {
        if (ctx && ctx.percent !== null && ctx.percent !== undefined) {
          updateContextMeter(ctx.percent, ctx.tokens);
        }
      });
    }
  }

  // 23-1: Usage stats subscription
  if (window.electronAPI?.usageStats) {
    // Get initial usage stats via IPC
    if (window.electronAPI.usageStats.get) {
      try {
        const usage = await window.electronAPI.usageStats.get();
        if (usage) {
          updateUsageMeter(usage);
        }
      } catch (err) {
        console.error('[StatsStrip] Failed to get initial usage stats:', err);
      }
    }

    // Subscribe to usage stats updates from main process polling
    if (window.electronAPI.usageStats.onUpdate) {
      window.electronAPI.usageStats.onUpdate((_event, usage) => {
        if (usage) {
          updateUsageMeter(usage);
        }
      });
    }
  }

  console.log('[StatsStrip] IPC connected');
}

// Initialize on page load
initStatsStrip();

// Export for external use
window.initStatsStrip = initStatsStrip;
window.updateStripStat = updateStripStat;
window.updateContextMeter = updateContextMeter;
window.updateUsageMeter = updateUsageMeter;
