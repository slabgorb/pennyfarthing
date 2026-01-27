/**
 * Stats Strip - Compact stats display in prompt bar (B-22)
 * Shows model badge, context meter, and usage limits (23-1)
 * 23-4: Adds compact button with context awareness
 * TirePump: Compact button triggers context clear and agent reload
 */

/**
 * 23-4: Threshold at which compact button becomes visible
 * Button appears when context usage >= 50%
 */
const COMPACT_THRESHOLD = 50;

/**
 * Threshold at which compact button turns red (imminent auto-compact)
 * Aligned with backend warning_threshold (70%) from context_budget
 * Story 37-16: Circuit breaker triggers at 85%, warn at 70%
 */
const COMPACT_IMMINENT_THRESHOLD = 70;

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
  // Story 37-16: Aligned with backend thresholds (warning=70%, critical=85%)
  if (percent >= 95) {
    contextMini.classList.add('level-critical');
  } else if (percent >= 85) {
    // Circuit breaker triggers at 85% - show danger
    contextMini.classList.add('level-danger');
  } else if (percent >= 70) {
    // Warning threshold from backend context_budget
    contextMini.classList.add('level-warning');
  } else {
    contextMini.classList.add('level-safe');
  }
}

/**
 * 23-4: Update compact button visibility and urgency based on context percentage
 * Shows button when context >= COMPACT_THRESHOLD (50%)
 * Turns red when context >= COMPACT_IMMINENT_THRESHOLD (65%) to warn of imminent auto-compact
 * @param {number} percent - Context usage percentage
 */
function updateCompactButtonVisibility(percent) {
  const compactBtn = document.querySelector('#stats-strip .compact-btn');
  if (!compactBtn) return;

  if (percent >= COMPACT_THRESHOLD) {
    compactBtn.classList.remove('hidden');

    // Turn red when approaching auto-compact threshold
    if (percent >= COMPACT_IMMINENT_THRESHOLD) {
      compactBtn.classList.add('imminent');
    } else {
      compactBtn.classList.remove('imminent');
    }
  } else {
    compactBtn.classList.add('hidden');
    compactBtn.classList.remove('imminent');
  }
}

/**
 * TirePump: Execute context clear and agent reload
 * Called when compact button is clicked or keyboard shortcut is pressed
 * Clears the Claude session and reloads the current agent
 */
async function executeCompact() {
  const compactBtn = document.querySelector('#stats-strip .compact-btn');

  // Get current agent command (e.g., '/dev', '/sm') via window global from persona.js
  const agent = window.getCurrentAgentCommand?.();
  if (!agent) {
    console.warn('[TirePump] No current agent to reload');
    return;
  }

  // Check if clearAndReload API is available
  if (!window.electronAPI?.claude?.clearAndReload) {
    console.warn('[TirePump] clearAndReload API not available');
    return;
  }

  // Show loading state
  if (compactBtn) {
    compactBtn.classList.add('loading');
    compactBtn.disabled = true;
  }

  try {
    console.log(`[TirePump] Clearing context and reloading agent: ${agent}`);
    await window.electronAPI.claude.clearAndReload(agent);
    console.log('[TirePump] Context cleared and agent reload triggered');
  } catch (err) {
    console.error('[TirePump] Failed to clear and reload:', err);
  } finally {
    // Remove loading state
    if (compactBtn) {
      compactBtn.classList.remove('loading');
      compactBtn.disabled = false;
    }
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
 * Now uses usable context (conversation usage) instead of total context
 * @param {number} percent - Total context usage percentage (0-100) - kept for backwards compat
 * @param {number} [tokens] - Total context token count (optional)
 * @param {Object} [contextInfo] - Full context info with usable fields
 */
function updateContextMeter(percent, tokens, contextInfo) {
  const contextMini = document.querySelector('#stats-strip .context-mini');
  const fill = document.querySelector('#stats-strip .context-mini-fill');
  const label = document.querySelector('#stats-strip .context-mini-label');

  // Use usable percent if available, otherwise fall back to total percent
  const displayPercent = contextInfo?.usablePercent ?? percent;

  if (fill) {
    fill.style.width = `${Math.min(100, Math.max(0, displayPercent))}%`;
  }

  if (label) {
    label.textContent = `${displayPercent}%`;
  }

  // Update context tokens display - show usable tokens if available
  const displayTokens = contextInfo?.usableTokens ?? tokens;
  if (displayTokens !== undefined && displayTokens !== null) {
    updateStripStat('strip-context-tokens', formatTokenCount(displayTokens));
  }

  // Update tooltip with breakdown if we have full context info
  if (contextMini && contextInfo?.baseline !== null && contextInfo?.available !== null) {
    const usable = contextInfo.usableTokens ?? 0;
    const available = contextInfo.available ?? 0;
    const baseline = contextInfo.baseline ?? 0;
    contextMini.title = `Conversation: ${formatTokenCount(usable)} / ${formatTokenCount(available)} available\nSystem overhead: ${formatTokenCount(baseline)} tokens`;
  }

  updateContextLevel(contextMini, displayPercent);

  // 23-4: Update compact button visibility based on context threshold
  updateCompactButtonVisibility(displayPercent);
}

// Store project root for relative path calculation
let projectRoot = '';

/**
 * Set project root directory (called once on init)
 * @param {string} root - Full path to project root
 */
function setProjectRoot(root) {
  projectRoot = root;
}

/**
 * Update Claude's working directory display with responsive design
 * Shows relative path if room, otherwise just folder name
 * @param {string} pwd - Full path to working directory
 */
function updatePwd(pwd) {
  const element = document.querySelector('#stats-strip .pwd');
  if (!element || !pwd) return;

  // Calculate relative path from project root
  let displayPath = pwd;
  if (projectRoot && pwd.startsWith(projectRoot)) {
    displayPath = pwd.slice(projectRoot.length);
    if (displayPath.startsWith('/')) displayPath = displayPath.slice(1);
    if (!displayPath) displayPath = '.';
  }

  // Folder name for compact display
  const folderName = pwd.split('/').pop() || pwd;

  // Store both for responsive switching
  element.dataset.fullPath = displayPath;
  element.dataset.folderName = folderName;
  element.title = `Working directory: ${pwd}`;

  // Initial display uses responsive check
  updatePwdDisplay(element);
}

/**
 * Update pwd display based on available width (responsive)
 * @param {HTMLElement} element - The pwd element
 */
function updatePwdDisplay(element) {
  if (!element) return;

  const fullPath = element.dataset.fullPath || '';
  const folderName = element.dataset.folderName || '';

  // Try full path first
  element.textContent = fullPath;

  // If it overflows, switch to folder name only
  if (element.scrollWidth > element.clientWidth) {
    element.textContent = folderName;
  }
}

/**
 * Set up resize observer for responsive pwd display
 */
function setupPwdResizeObserver() {
  const element = document.querySelector('#stats-strip .pwd');
  if (!element) return;

  const resizeObserver = new ResizeObserver(() => {
    updatePwdDisplay(element);
  });
  resizeObserver.observe(element.parentElement);
}

/**
 * Build summary text for collapsed git section
 * @param {Array} repos - Array of repo status objects
 * @returns {string} Summary HTML
 */
function buildGitSummary(repos) {
  const dirtyRepos = repos.filter(r => !r.clean);
  const totalDirty = repos.reduce((sum, repo) => sum + (repo.dirtyFiles?.length || 0), 0);

  if (dirtyRepos.length === 0) {
    return '<span class="summary-clean">All clean</span>';
  }

  // Show dirty repo names and file count
  const repoNames = dirtyRepos.map(r => r.name).join(', ');
  return `<span class="summary-dirty">${repoNames}</span> <span class="summary-count">(${totalDirty} file${totalDirty === 1 ? '' : 's'})</span>`;
}

/**
 * Build detail HTML for expanded git section
 * @param {Array} repos - Array of repo status objects
 * @returns {string} Detail HTML
 */
function buildGitDetail(repos) {
  return repos.map(repo => {
    const statusClass = repo.clean ? 'clean' : 'dirty';
    const statusText = repo.clean ? 'Clean' : 'Dirty';

    // Build ahead/behind suffix
    let aheadBehind = '';
    if (repo.ahead > 0) aheadBehind += ` ↑${repo.ahead}`;
    if (repo.behind > 0) aheadBehind += ` ↓${repo.behind}`;

    // Full folder name
    const folderName = repo.name;

    // Build dirty files list (max 10)
    let dirtyFilesHtml = '';
    if (!repo.clean && repo.dirtyFiles && repo.dirtyFiles.length > 0) {
      const maxFiles = 10;
      const filesToShow = repo.dirtyFiles.slice(0, maxFiles);
      const remaining = repo.dirtyFiles.length - maxFiles;

      dirtyFilesHtml = `<div class="dirty-files">
        ${filesToShow.map(f => `<div class="dirty-file"><span class="file-status">${f.status}</span>${f.path}</div>`).join('')}
        ${remaining > 0 ? `<div class="dirty-more">+${remaining} more file${remaining === 1 ? '' : 's'}</div>` : ''}
      </div>`;
    }

    return `<div class="repo-row" title="${repo.branch}${aheadBehind}">
      <div class="repo-header">
        <span class="repo-name">${folderName}</span>
        <span class="repo-badge ${statusClass}">${statusText}</span>
      </div>
      ${dirtyFilesHtml}
    </div>`;
  }).join('');
}

/**
 * Update git status display for all configured repos
 * @param {Array} repos - Array of repo status objects { name, path, branch, clean, ahead, behind, dirtyFiles }
 */
function updateGitStatusAll(repos) {
  const detailContainer = document.querySelector('#git-repos');
  const summaryEl = document.querySelector('#git-section-summary');
  const badgeEl = document.querySelector('#git-section-badge');
  if (!detailContainer || !repos || repos.length === 0) return;

  // Calculate stats
  const dirtyRepos = repos.filter(r => !r.clean);
  const totalDirty = repos.reduce((sum, repo) => sum + (repo.dirtyFiles?.length || 0), 0);

  // Update badge
  if (badgeEl) {
    if (dirtyRepos.length > 0) {
      badgeEl.textContent = `${totalDirty}`;
      badgeEl.className = 'section-badge dirty';
      badgeEl.style.display = '';
    } else {
      badgeEl.textContent = '✓';
      badgeEl.className = 'section-badge clean';
      badgeEl.style.display = '';
    }
  }

  // Update summary (visible when collapsed)
  if (summaryEl) {
    summaryEl.innerHTML = buildGitSummary(repos);
  }

  // Update detail (visible when expanded)
  detailContainer.innerHTML = buildGitDetail(repos);
}

/**
 * Fetch git status for all repos from API
 */
async function fetchGitStatusAll() {
  try {
    const response = await fetch('/api/git/all');
    if (!response.ok) {
      console.warn('[StatsStrip] Git status fetch failed:', response.status);
      return;
    }
    const repos = await response.json();
    updateGitStatusAll(repos);
  } catch (err) {
    console.warn('[StatsStrip] Failed to fetch git status:', err);
  }
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

  // Update 5-hour usage (shows USED percentage to match Claude /config)
  const usage5hr = document.querySelector('#stats-strip .usage-5hr');
  if (usage5hr) {
    // Hide entirely when no data available
    if (!hasData) {
      usage5hr.style.display = 'none';
    } else {
      usage5hr.style.display = '';
      const valueSpan = usage5hr.querySelector('.usage-value');
      const used5hr = usageStats.fiveHourPercent || 0;
      if (valueSpan) {
        valueSpan.textContent = `${Math.round(used5hr)}%`;
      }
      // Update tooltip with reset time
      if (usageStats.fiveHourResetAt) {
        usage5hr.title = `5-hour block: ${Math.round(used5hr)}% used, resets in ${formatResetTime(usageStats.fiveHourResetAt)}`;
      }
      // Update level class based on used percentage (higher = more danger)
      const remaining5hr = Math.max(0, 100 - used5hr);
      updateUsageLevel(usage5hr, remaining5hr);
    }
  }

  // Update weekly usage (shows USED percentage to match Claude /config)
  const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
  if (usageWeekly) {
    // Hide entirely when no data available
    if (!hasData) {
      usageWeekly.style.display = 'none';
    } else {
      usageWeekly.style.display = '';
      const valueSpan = usageWeekly.querySelector('.usage-value');
      const usedWeekly = usageStats.weeklyPercent || 0;
      if (valueSpan) {
        valueSpan.textContent = `${Math.round(usedWeekly)}%`;
      }
      // Update tooltip with reset time
      if (usageStats.weeklyResetAt) {
        usageWeekly.title = `Weekly: ${Math.round(usedWeekly)}% used, resets in ${formatResetTime(usageStats.weeklyResetAt)}`;
      }
      // Update level class based on used percentage (higher = more danger)
      const remainingWeekly = Math.max(0, 100 - usedWeekly);
      updateUsageLevel(usageWeekly, remainingWeekly);
    }
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
  // Now also includes usable context fields (baseline, usableTokens, usablePercent, available)
  if (window.electronAPI?.context) {
    // Get initial context via IPC
    if (window.electronAPI.context.get) {
      try {
        const ctx = await window.electronAPI.context.get();
        if (ctx && ctx.percent !== null && ctx.percent !== undefined) {
          updateContextMeter(ctx.percent, ctx.tokens, ctx);
        }
      } catch (err) {
        // Silent fail - context is optional
      }
    }

    // Subscribe to context updates from main process polling
    if (window.electronAPI.context.onUpdate) {
      window.electronAPI.context.onUpdate((_event, ctx) => {
        if (ctx && ctx.percent !== null && ctx.percent !== undefined) {
          updateContextMeter(ctx.percent, ctx.tokens, ctx);
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

  // 23-4: Set up compact button click handler
  const compactBtn = document.querySelector('#stats-strip .compact-btn');
  if (compactBtn) {
    compactBtn.addEventListener('click', executeCompact);
  }

  // Set up project root for relative path calculation
  if (window.electronAPI?.projectInfo?.get) {
    try {
      const info = await window.electronAPI.projectInfo.get();
      if (info?.directory) {
        setProjectRoot(info.directory);
      }
    } catch (err) {
      // Silent fail - directory is optional
    }
  }

  // Set up resize observer for responsive pwd display
  setupPwdResizeObserver();

  // Note: Collapse toggle is handled by collapsed-sections.js for persistence
  // Git status is handled by story.js via WebSocket (/ws/git), not polling here

  console.log('[StatsStrip] IPC connected');
}

/**
 * Initialize stats strip via WebSocket (web mode)
 * Connects to /ws/stats for real-time pwd updates from Bash spans
 */
function initStatsStripWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/stats`;

  try {
    const statsSocket = new WebSocket(wsUrl);

    statsSocket.onopen = () => {
      console.log('[StatsStrip] WebSocket connected');
    };

    statsSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.model) {
          updateStripStat('strip-model', data.model);
        }
        if (data.pwd) {
          updatePwd(data.pwd);
        }
      } catch (err) {
        console.error('[StatsStrip] Failed to parse WebSocket message:', err);
      }
    };

    statsSocket.onerror = (err) => {
      console.error('[StatsStrip] WebSocket error:', err);
    };

    statsSocket.onclose = () => {
      console.log('[StatsStrip] WebSocket disconnected, reconnecting in 5s...');
      setTimeout(initStatsStripWebSocket, 5000);
    };
  } catch (err) {
    console.error('[StatsStrip] Failed to create WebSocket:', err);
  }
}

// Initialize on page load
initStatsStrip();

// Also try WebSocket connection for web mode (pwd updates)
if (!window.electronAPI?.stats) {
  initStatsStripWebSocket();
}

// Export for external use
window.initStatsStrip = initStatsStrip;
window.updateStripStat = updateStripStat;
window.updateContextMeter = updateContextMeter;
window.updateUsageMeter = updateUsageMeter;
// 23-4: Export compact button functions
window.updateCompactButtonVisibility = updateCompactButtonVisibility;
window.executeCompact = executeCompact;
// Export pwd and git status functions
window.updatePwd = updatePwd;
window.setProjectRoot = setProjectRoot;
window.updateGitStatusAll = updateGitStatusAll;
window.fetchGitStatusAll = fetchGitStatusAll;
