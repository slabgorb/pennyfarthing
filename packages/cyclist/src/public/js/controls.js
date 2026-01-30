/**
 * Controls Module - Permission mode toggle via IPC
 *
 * Permission mode switch (3-way segmented control):
 * - plan: Read-only planning mode
 * - manual: Ask permission for everything (default)
 * - accept: Auto-accept file edits
 *
 * Relay mode (independent toggle):
 * - Auto-handoff to next agent (previously part of 'turbo' mode)
 *
 * Mode is persisted to settings and synced with Claude Code.
 *
 * 23-4: Adds Cmd+Shift+K keyboard shortcut for compact command
 * MSSCI-12127: Enhanced with sliding highlight, keyboard shortcuts, tooltips
 * MSSCI-12395: Removed 'turbo', added independent relay_mode toggle
 */

import { resetState as resetFilePanel } from './file-panel.js';
import { resetState as resetDiffPanel } from './diff-panel.js';
import { clear as clearChangedFiles } from './components/ChangedFilesList.js';
import { clearDiffs } from './components/DiffViewer.js';
import { getMessageQueue, setOnQueueChange, removeFromQueue, clearMessageQueue, setBellMode as setMessageQueueBellMode } from './editor/message-queue.js';
import { createSystemBanner, BANNER_TYPES } from './components/SystemBanner.js';
import { clearTasks } from './sidebar/tasks.js';
import { clearBackgroundTasks } from './sidebar/background-tasks.js';
import { clearBikeLane } from './sidebar/bikelane.js';

/**
 * Valid modes for the segmented control (matches settings.ts PermissionMode)
 * MSSCI-12395: Removed 'turbo' - now use relay_mode toggle instead
 */
const VALID_MODES = ['plan', 'manual', 'accept'];

/**
 * Map mode index to mode name (for keyboard shortcuts)
 * MSSCI-12127 AC5, MSSCI-12395: Removed turbo (4 now toggles relay)
 */
const MODE_INDEX = {
  1: 'plan',
  2: 'manual',
  3: 'accept',
  // 4 is now relay toggle, handled separately
};

/**
 * Map our mode names to Claude Code's permission mode names
 * MSSCI-12395: Removed turbo mapping
 */
const MODE_TO_CLAUDE = {
  plan: 'plan',
  manual: 'default',
  accept: 'acceptEdits',
};

/**
 * Current mode state
 */
let currentMode = 'manual';

/**
 * Current relay mode state (MSSCI-12395)
 * Auto-handoff to next agent (previously part of 'turbo' mode)
 */
let relayModeEnabled = false;

/**
 * Current bell mode state (MSSCI-12275)
 */
let bellModeEnabled = false;

/**
 * Update the mode switch display (segmented control)
 * Updates which segment is active and positions the sliding highlight
 * MSSCI-12127: Enhanced with sliding highlight animation
 */
function updateModeSwitchDisplay() {
  const modeSwitch = document.querySelector('[data-control="mode-switch"]');
  if (!modeSwitch) return;

  const segments = modeSwitch.querySelectorAll('.mode-switch-segment');
  const highlight = modeSwitch.querySelector('.mode-switch-highlight');

  segments.forEach(segment => {
    const segmentMode = segment.dataset.mode;
    const isActive = segmentMode === currentMode;
    segment.classList.toggle('active', isActive);
    segment.setAttribute('aria-checked', isActive ? 'true' : 'false');

    // Position the sliding highlight behind the active segment
    if (isActive && highlight) {
      const segmentRect = segment.getBoundingClientRect();
      const switchRect = modeSwitch.getBoundingClientRect();
      const offsetLeft = segmentRect.left - switchRect.left - 2; // Account for padding

      highlight.style.width = `${segmentRect.width}px`;
      highlight.style.transform = `translateX(${offsetLeft}px)`;
      highlight.dataset.activeMode = segmentMode;
    }
  });
}

/**
 * Flash visual feedback on a segment (for keyboard shortcuts)
 * MSSCI-12127 AC6
 */
function flashSegment(mode) {
  const segment = document.querySelector(`.mode-switch-segment[data-mode="${mode}"]`);
  if (!segment) return;

  segment.classList.add('shortcut-flash');
  segment.addEventListener('animationend', () => {
    segment.classList.remove('shortcut-flash');
  }, { once: true });
}

/**
 * Load permission mode and relay mode from settings and sync with Claude Code
 * MSSCI-12395: Handles relay_mode as separate setting, migrates legacy turbo
 */
async function loadModeFromSettings() {
  try {
    let settings;
    if (window.electronAPI?.settings?.get) {
      settings = await window.electronAPI.settings.get();
    } else {
      const response = await fetch('/api/settings');
      if (response.ok) {
        settings = await response.json();
      }
    }

    let mode = settings?.workflow?.permission_mode || 'manual';

    // MSSCI-12395: Handle relay_mode (new) or detect from legacy turbo/handoff_mode
    let relay = settings?.workflow?.relay_mode;
    if (relay === undefined) {
      // Legacy migration: turbo → accept + relay
      if (mode === 'turbo') {
        mode = 'accept';
        relay = true;
      } else {
        // Legacy: handoff_mode: 'auto' → relay: true
        relay = settings?.workflow?.handoff_mode === 'auto';
      }
    }

    if (VALID_MODES.includes(mode)) {
      currentMode = mode;
      updateModeSwitchDisplay();

      // Sync with Claude Code
      const claudeMode = MODE_TO_CLAUDE[mode];
      if (window.electronAPI?.claude?.setMode) {
        await window.electronAPI.claude.setMode(claudeMode);
      }

      console.log('[Controls] Mode loaded from settings:', mode, '(Claude:', claudeMode + ')');
    }

    // Load relay mode
    relayModeEnabled = relay || false;
    updateRelayModeDisplay();
    console.log('[Controls] Relay mode loaded from settings:', relayModeEnabled);
  } catch (err) {
    console.warn('[Controls] Failed to load mode from settings:', err);
  }
}

/**
 * Set permission mode directly (no cycling)
 * Persists to settings and syncs with Claude Code
 * MSSCI-12395: relay_mode is now a separate toggle
 */
async function setPermissionMode(newMode, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (!VALID_MODES.includes(newMode)) {
    console.warn('Invalid mode:', newMode);
    return;
  }

  if (newMode === currentMode) {
    console.log('Mode already set to:', newMode);
    return;
  }

  console.log('Switching to mode:', newMode);

  try {
    // Build settings payload - relay_mode is independent now
    const settings = {
      workflow: {
        permission_mode: newMode,
      },
    };

    // Persist to settings
    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save(settings);
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    }

    // Then sync with Claude Code
    const claudeMode = MODE_TO_CLAUDE[newMode];
    if (window.electronAPI?.claude?.setMode) {
      await window.electronAPI.claude.setMode(claudeMode);
    }

    currentMode = newMode;
    updateModeSwitchDisplay();
    console.log('Mode set successfully:', newMode, '(Claude:', claudeMode + ')');
  } catch (error) {
    console.error('Failed to set permission mode:', error);
  }
}

/**
 * Abort Claude processing (stop button / Escape key)
 */
async function abortClaude(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  console.log('[Controls] Abort requested');

  if (!window.electronAPI?.claude?.abort) {
    console.warn('[Controls] Claude API not available - cannot abort');
    return;
  }

  try {
    await window.electronAPI.claude.abort();
    console.log('[Controls] Claude aborted successfully');
    updateStopButtonState(false);
  } catch (error) {
    console.error('[Controls] Failed to abort Claude:', error);
  }
}

/**
 * Update stop button enabled/disabled state
 * @export
 */
export function updateStopButtonState(isProcessing) {
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.disabled = !isProcessing;
  }
}

/**
 * Handle Escape key for aborting Claude
 */
function handleEscapeKey(event) {
  if (event.key === 'Escape') {
    // Don't abort if focus is in a modal or popup
    const activeElement = document.activeElement;
    const isInModal = activeElement?.closest('.modal, .popup, .dropdown');
    if (isInModal) return;

    console.log('[Controls] Escape pressed - aborting Claude');
    abortClaude(event);
  }
}

/**
 * Clear session and start fresh
 */
async function clearSession(event) {
  event.preventDefault();
  event.stopPropagation();

  console.log('Clear button clicked');

  if (!window.electronAPI?.claude?.clear) {
    console.warn('Claude API not available - cannot clear session');
    return;
  }

  try {
    await window.electronAPI.claude.clear();
    console.log('Session cleared successfully');

    // Clear the message view
    const messageView = document.getElementById('message-view');
    if (messageView) {
      messageView.innerHTML = '';
    }

    // Reset stats display
    document.querySelectorAll('[data-stat]').forEach(el => {
      if (el.dataset.stat !== 'status-dot') {
        el.textContent = '—';
      }
    });

    // Reset panel states (23-2)
    resetFilePanel();
    resetDiffPanel();

    // 24-4: Clear changed files list and diff data
    clearChangedFiles();
    clearDiffs();

    // NOTE: Do NOT clear persona display (character-name, character-role)
    // Persona reflects the current theme configuration, not session state
    // Theme persists across session clears
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

/**
 * 23-4: Handle keyboard shortcut for compact command
 * Cmd+Shift+K (Mac) or Ctrl+Shift+K (Windows/Linux)
 */
function handleCompactShortcut(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;

  if (modifierKey && event.shiftKey && event.key === 'K') {
    event.preventDefault();
    event.stopPropagation();

    console.log('[Controls] Compact shortcut triggered (Cmd/Ctrl+Shift+K)');

    // Call executeCompact from stats-strip.js if available
    if (window.executeCompact) {
      window.executeCompact();
    } else {
      console.warn('[Controls] executeCompact not available');
    }
  }
}

// =============================================================================
// Relay Mode (MSSCI-12395)
// =============================================================================

/**
 * Update the relay mode toggle display (toolbar and settings panel)
 */
function updateRelayModeDisplay() {
  // Toolbar toggle
  const toggle = document.getElementById('relay-mode-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', relayModeEnabled ? 'true' : 'false');
    toggle.classList.toggle('active', relayModeEnabled);
  }

  // Settings panel toggle
  const settingsToggle = document.getElementById('settings-relay-toggle');
  if (settingsToggle) {
    const buttons = settingsToggle.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => {
      const isOn = btn.getAttribute('data-value') === 'on';
      const isActive = isOn === relayModeEnabled;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }
}

/**
 * Toggle relay mode on/off
 * MSSCI-12395: Independent auto-handoff toggle (formerly part of turbo)
 */
async function toggleRelayMode(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const newValue = !relayModeEnabled;
  console.log('[Controls] Toggling relay mode to:', newValue);

  try {
    const settings = {
      workflow: {
        relay_mode: newValue,
      },
    };

    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save(settings);
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    }

    relayModeEnabled = newValue;
    updateRelayModeDisplay();
    console.log('[Controls] Relay mode set successfully:', relayModeEnabled);
  } catch (error) {
    console.error('[Controls] Failed to toggle relay mode:', error);
  }
}

/**
 * Handle Cmd/Ctrl+4 keyboard shortcut for relay mode toggle
 * MSSCI-12395: Repurposed from turbo mode shortcut
 */
function handleRelayModeShortcut(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;

  if (modifierKey && !event.shiftKey && !event.altKey && event.key === '4') {
    event.preventDefault();
    event.stopPropagation();

    console.log('[Controls] Relay mode shortcut triggered (Cmd/Ctrl+4)');

    // Flash the relay toggle for visual feedback
    const toggle = document.getElementById('relay-mode-toggle');
    if (toggle) {
      toggle.classList.add('shortcut-flash');
      toggle.addEventListener('animationend', () => {
        toggle.classList.remove('shortcut-flash');
      }, { once: true });
    }

    toggleRelayMode();
  }
}

// =============================================================================
// Bell Mode (MSSCI-12275)
// =============================================================================

/**
 * Update the bell mode toggle display (toolbar and settings panel)
 */
function updateBellModeDisplay() {
  // Toolbar toggle
  const toggle = document.getElementById('bell-mode-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', bellModeEnabled ? 'true' : 'false');
  }

  // Settings panel toggle
  const settingsToggle = document.getElementById('settings-bell-toggle');
  if (settingsToggle) {
    const buttons = settingsToggle.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => {
      const isOn = btn.getAttribute('data-value') === 'on';
      const isActive = isOn === bellModeEnabled;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }
}

/**
 * Load bell mode state from settings
 */
async function loadBellModeFromSettings() {
  try {
    let settings;
    if (window.electronAPI?.settings?.get) {
      settings = await window.electronAPI.settings.get();
    } else {
      const response = await fetch('/api/settings');
      if (response.ok) {
        settings = await response.json();
      }
    }

    bellModeEnabled = settings?.workflow?.bell_mode || false;
    updateBellModeDisplay();
    // MSSCI-12275: Sync message queue bell mode state on load
    setMessageQueueBellMode(bellModeEnabled);
    console.log('[Controls] Bell mode loaded from settings:', bellModeEnabled);
  } catch (err) {
    console.warn('[Controls] Failed to load bell mode from settings:', err);
  }
}

/**
 * Toggle bell mode on/off
 */
async function toggleBellMode(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const newValue = !bellModeEnabled;
  console.log('[Controls] Toggling bell mode to:', newValue);

  try {
    const settings = {
      workflow: {
        bell_mode: newValue,
      },
    };

    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save(settings);
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    }

    bellModeEnabled = newValue;
    updateBellModeDisplay();
    // MSSCI-12275: Update message queue bell mode state
    setMessageQueueBellMode(newValue);
    console.log('[Controls] Bell mode set successfully:', bellModeEnabled);
  } catch (error) {
    console.error('[Controls] Failed to toggle bell mode:', error);
  }
}

/**
 * Handle Cmd/Ctrl+B keyboard shortcut for bell mode toggle
 */
function handleBellModeShortcut(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;

  if (modifierKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    event.stopPropagation();

    console.log('[Controls] Bell mode shortcut triggered (Cmd/Ctrl+B)');
    toggleBellMode();
  }
}

/**
 * MSSCI-12127 AC5: Handle keyboard shortcuts for mode switching
 * Cmd+1/2/3 (Mac) or Ctrl+1/2/3 (Windows/Linux)
 * MSSCI-12395: Cmd/Ctrl+4 is now relay toggle (handled separately)
 */
function handleModeShortcut(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;

  // Check for Cmd/Ctrl + 1/2/3 (without Shift) - not 4, that's relay now
  if (modifierKey && !event.shiftKey && !event.altKey) {
    const keyNum = parseInt(event.key, 10);
    if (keyNum >= 1 && keyNum <= 3) {
      const targetMode = MODE_INDEX[keyNum];
      if (targetMode) {
        event.preventDefault();
        event.stopPropagation();

        console.log(`[Controls] Mode shortcut triggered: Cmd/Ctrl+${keyNum} -> ${targetMode}`);

        // Flash the segment for visual feedback (AC6)
        flashSegment(targetMode);

        // Set the mode
        setPermissionMode(targetMode);
      }
    }
  }
}

/**
 * Initialize controls
 */
function initControls() {
  console.log('Initializing controls...');

  // 35-4: Mode switch (segmented control) - attach click handlers to each segment
  const modeSwitch = document.querySelector('[data-control="mode-switch"]');
  if (modeSwitch) {
    const segments = modeSwitch.querySelectorAll('.mode-switch-segment');
    console.log(`Found mode switch with ${segments.length} segments`);
    segments.forEach(segment => {
      segment.addEventListener('click', (event) => {
        const mode = segment.dataset.mode;
        setPermissionMode(mode, event);
      });
    });

    // MSSCI-12127: Initialize highlight position after layout settles
    requestAnimationFrame(() => {
      updateModeSwitchDisplay();
    });
  } else {
    console.error('Mode switch not found!');
  }

  // Clear button handler
  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) {
    console.log('Found clear button, attaching click handler');
    clearBtn.addEventListener('click', clearSession);
  } else {
    console.error('Clear button not found!');
  }

  // Stop button handler
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    console.log('[Controls] Found stop button, attaching click handler');
    stopBtn.addEventListener('click', abortClaude);
  } else {
    console.error('[Controls] Stop button not found!');
  }

  // Escape key to abort Claude
  document.addEventListener('keydown', handleEscapeKey);
  console.log('[Controls] Escape key handler registered for abort');

  // Initialize queue display
  initQueueDisplay();

  // Subscribe to Claude complete/error to reset stop button state
  if (window.electronAPI?.claude?.onComplete) {
    window.electronAPI.claude.onComplete(() => {
      console.log('[Controls] Claude processing complete');
      updateStopButtonState(false);
    });
  }

  if (window.electronAPI?.claude?.onError) {
    window.electronAPI.claude.onError((error) => {
      console.log('[Controls] Claude error:', error);
      updateStopButtonState(false);
    });
  }

  // Subscribe to Claude message to enable stop button when processing starts
  if (window.electronAPI?.claude?.onMessage) {
    let firstMessage = true;
    window.electronAPI.claude.onMessage(() => {
      if (firstMessage) {
        updateStopButtonState(true);
        firstMessage = false;
      }
    });
    // Reset firstMessage flag on complete
    if (window.electronAPI?.claude?.onComplete) {
      window.electronAPI.claude.onComplete(() => {
        firstMessage = true;
      });
    }
  }

  // Abort Claude process on page refresh/close to prevent orphaned processes
  window.addEventListener('beforeunload', () => {
    if (window.electronAPI?.claude?.abort) {
      window.electronAPI.claude.abort();
    }
  });

  // Load initial mode from settings (source of truth)
  loadModeFromSettings();

  // MSSCI-12395: Relay mode toggle (auto-handoff, formerly part of turbo)
  const relayModeToggle = document.getElementById('relay-mode-toggle');
  if (relayModeToggle) {
    relayModeToggle.addEventListener('click', toggleRelayMode);
  }

  // Settings panel relay toggle (mirrors toolbar toggle)
  const settingsRelayToggle = document.getElementById('settings-relay-toggle');
  if (settingsRelayToggle) {
    settingsRelayToggle.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newValue = btn.getAttribute('data-value') === 'on';
        if (newValue !== relayModeEnabled) {
          toggleRelayMode();
        }
      });
    });
  }

  // MSSCI-12275: Bell mode toggle
  const bellModeToggle = document.getElementById('bell-mode-toggle');
  if (bellModeToggle) {
    bellModeToggle.addEventListener('click', toggleBellMode);
    loadBellModeFromSettings();
  }

  // Settings panel bell toggle (mirrors toolbar toggle)
  const settingsBellToggle = document.getElementById('settings-bell-toggle');
  if (settingsBellToggle) {
    settingsBellToggle.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newValue = btn.getAttribute('data-value') === 'on';
        if (newValue !== bellModeEnabled) {
          toggleBellMode();
        }
      });
    });
  }

  // 23-4: Register global keyboard shortcut for compact (Cmd+Shift+K / Ctrl+Shift+K)
  document.addEventListener('keydown', handleCompactShortcut);
  console.log('[Controls] Compact keyboard shortcut registered (Cmd/Ctrl+Shift+K)');

  // MSSCI-12127 AC5: Register keyboard shortcuts for mode switching (Cmd/Ctrl+1/2/3)
  document.addEventListener('keydown', handleModeShortcut);
  console.log('[Controls] Mode keyboard shortcuts registered (Cmd/Ctrl+1/2/3)');

  // MSSCI-12395: Register keyboard shortcut for relay mode toggle (Cmd/Ctrl+4)
  document.addEventListener('keydown', handleRelayModeShortcut);
  console.log('[Controls] Relay mode keyboard shortcut registered (Cmd/Ctrl+4)');

  // MSSCI-12275: Register keyboard shortcut for bell mode toggle (Cmd/Ctrl+B)
  document.addEventListener('keydown', handleBellModeShortcut);
  console.log('[Controls] Bell mode keyboard shortcut registered (Cmd/Ctrl+B)');
}

// =============================================================================
// Queue Display (Bell Mode - MSSCI-12275)
// =============================================================================

/**
 * Render the inline queue display
 */
function renderQueueDisplay() {
  const queueContainer = document.getElementById('queue-inline');
  const queueList = queueContainer?.querySelector('.queue-inline-list');
  if (!queueContainer || !queueList) return;

  const messages = getMessageQueue();

  if (messages.length === 0) {
    queueContainer.style.display = 'none';
    return;
  }

  // Show container
  queueContainer.style.display = 'block';

  // Render messages
  queueList.innerHTML = messages.map((msg, index) => {
    const text = msg.text || msg;
    const truncated = text.length > 60 ? text.substring(0, 60) + '...' : text;
    const hasImages = msg.images && msg.images.length > 0;
    const imageIndicator = hasImages ? ` <span class="queue-image-indicator">📎${msg.images.length}</span>` : '';

    return `
      <li class="queue-inline-item" data-index="${index}">
        <span class="queue-inline-text">${escapeHtml(truncated)}${imageIndicator}</span>
        <button class="queue-inline-remove" data-index="${index}" title="Remove from queue">×</button>
      </li>
    `;
  }).join('');

  // Attach remove handlers
  queueList.querySelectorAll('.queue-inline-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      removeFromQueue(index);
    });
  });
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Initialize queue display and listeners
 */
function initQueueDisplay() {
  // Initial render
  renderQueueDisplay();

  // Subscribe to queue changes
  setOnQueueChange(() => {
    renderQueueDisplay();
  });

  // Clear button in queue header
  const clearQueueBtn = document.querySelector('.queue-clear-btn');
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
      clearMessageQueue();
    });
  }

  console.log('[Controls] Queue display initialized');
}

// =============================================================================
// System Banner Functions (MSSCI-12471)
// =============================================================================

/**
 * Add a system banner to the message view
 * @param {string} type - Banner type from BANNER_TYPES
 * @param {Object} options - Optional configuration
 * @export
 */
export function addSystemBanner(type, options = {}) {
  const messageView = document.getElementById('message-view');
  if (!messageView) {
    console.warn('[Controls] Message view not found for system banner');
    return;
  }

  const banner = createSystemBanner(type, options);
  messageView.appendChild(banner);

  // Scroll to show the banner
  banner.scrollIntoView({ behavior: 'smooth', block: 'end' });

  console.log('[Controls] System banner added:', type, options);
}

/**
 * Clear session with system banner instead of wiping messages
 * MSSCI-12471: Shows "Context cleared" banner instead of clearing message view
 * @export
 */
export async function clearSessionWithBanner() {
  console.log('[Controls] Clear session with banner');

  if (!window.electronAPI?.claude?.clear) {
    console.warn('[Controls] Claude API not available - cannot clear session');
    return;
  }

  try {
    await window.electronAPI.claude.clear();
    console.log('[Controls] Session cleared successfully');

    // Add system banner instead of clearing message view
    addSystemBanner(BANNER_TYPES.CONTEXT_CLEARED);

    // Reset stats display
    document.querySelectorAll('[data-stat]').forEach(el => {
      if (el.dataset.stat !== 'status-dot') {
        el.textContent = '—';
      }
    });

    // Reset panel states
    resetFilePanel();
    resetDiffPanel();

    // Clear changed files list and diff data
    clearChangedFiles();
    clearDiffs();

    // Clear STALE sidebar data (tasks, background-tasks, bikelane)
    clearTasks();
    clearBackgroundTasks();
    clearBikeLane();

    // NOTE: Do NOT clear story, git, or acceptance-criteria sections
    // These persist across context clears as they represent the current work session

  } catch (error) {
    console.error('[Controls] Failed to clear session:', error);
  }
}

/**
 * Handle TirePump context clear with banner
 * MSSCI-12471: Shows banner with next agent info
 * @param {string} nextAgent - The agent to load after clear
 * @export
 */
export async function handleTirePumpClear(nextAgent) {
  console.log('[Controls] TirePump clear for agent:', nextAgent);

  // Add banner with next agent info
  addSystemBanner(BANNER_TYPES.CONTEXT_CLEARED, { nextAgent });

  // Clear stale sidebar data
  clearTasks();
  clearBackgroundTasks();
  clearBikeLane();
}

// =============================================================================
// Context Clear Indicators (MSSCI-11840)
// =============================================================================

/**
 * Show an indicator that session is being cleared
 * Called when CONTEXT_CLEAR marker is detected
 */
export function showClearingIndicator() {
  console.log('[Controls] Showing clearing indicator');
  // Could show a toast or overlay
  // For now, just log - actual UI can be enhanced later
}

/**
 * Show an indicator that agent is being reloaded
 * Called after session clear completes
 */
export function showReloadingIndicator() {
  console.log('[Controls] Showing reloading indicator');
  // Could show a loading spinner or status message
}

/**
 * Hide clearing/reloading indicators
 * Called after reload completes
 */
export function hideClearingIndicator() {
  console.log('[Controls] Hiding clearing indicator');
  // Clear any UI indicators
}

/**
 * Check if relay mode is enabled
 * Used by quick-actions to auto-execute HANDOFF markers
 * @returns {boolean}
 */
export function isRelayModeEnabled() {
  return relayModeEnabled;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initControls);
} else {
  // DOM already loaded
  initControls();
}
