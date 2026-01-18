/**
 * Controls Module - Permission mode toggle via IPC
 *
 * 35-4: Three-way mode switch (segmented control)
 * Direct selection of Claude permission modes:
 * - default (MANUAL): Ask permission for everything
 * - plan (PLAN): Read-only planning mode
 * - acceptEdits (ACCEPT): Auto-accept file edits
 *
 * 23-4: Adds Cmd+Shift+K keyboard shortcut for compact command
 */

import { resetState as resetFilePanel } from './file-panel.js';
import { resetState as resetDiffPanel } from './diff-panel.js';
import { clear as clearChangedFiles } from './components/ChangedFilesList.js';
import { clearDiffs } from './components/DiffViewer.js';

/**
 * Valid modes for the segmented control
 */
const VALID_MODES = ['default', 'plan', 'acceptEdits'];

/**
 * Current mode state
 */
let currentMode = 'default';

/**
 * Update the mode switch display (segmented control)
 * 35-4: Updates which segment is active based on current mode
 */
function updateModeSwitchDisplay() {
  const modeSwitch = document.querySelector('[data-control="mode-switch"]');
  if (!modeSwitch) return;

  const segments = modeSwitch.querySelectorAll('.mode-switch-segment');
  segments.forEach(segment => {
    const segmentMode = segment.dataset.mode;
    const isActive = segmentMode === currentMode;
    segment.classList.toggle('active', isActive);
    segment.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}

/**
 * Set permission mode directly (no cycling)
 * 35-4: Direct mode selection from segmented control
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

  if (!window.electronAPI?.claude?.setMode) {
    console.warn('Claude API not available - cannot set mode');
    return;
  }

  try {
    await window.electronAPI.claude.setMode(newMode);
    currentMode = newMode;
    updateModeSwitchDisplay();
    console.log('Mode set successfully:', newMode);
  } catch (error) {
    console.error('Failed to set permission mode:', error);
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

    // Clear agent panel persona display (23-2 fix: use correct IDs)
    const nameEl = document.getElementById('character-name');
    const roleEl = document.getElementById('character-role');
    if (nameEl) nameEl.textContent = '';
    if (roleEl) roleEl.textContent = '';
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

  // Abort Claude process on page refresh/close to prevent orphaned processes
  window.addEventListener('beforeunload', () => {
    if (window.electronAPI?.claude?.abort) {
      window.electronAPI.claude.abort();
    }
  });

  // Get initial mode from backend
  if (window.electronAPI?.claude?.getMode) {
    window.electronAPI.claude.getMode()
      .then(mode => {
        console.log('Initial mode from backend:', mode);
        currentMode = mode;
        updateModeSwitchDisplay();
      })
      .catch(err => console.error('Failed to get initial mode:', err));
  }

  // 23-4: Register global keyboard shortcut for compact (Cmd+Shift+K / Ctrl+Shift+K)
  document.addEventListener('keydown', handleCompactShortcut);
  console.log('[Controls] Compact keyboard shortcut registered (Cmd/Ctrl+Shift+K)');
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initControls);
} else {
  // DOM already loaded
  initControls();
}
