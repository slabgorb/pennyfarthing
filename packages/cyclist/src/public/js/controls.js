/**
 * Controls Module - Permission mode toggle via IPC
 *
 * Cycles through Claude permission modes:
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
 * Mode cycle order
 */
const MODE_CYCLE = ['default', 'plan', 'acceptEdits'];

/**
 * Current mode state
 */
let currentMode = 'default';

/**
 * Mode display configuration
 */
const MODE_DISPLAY = {
  'default': { label: 'MANUAL', className: null },
  'plan': { label: 'PLAN', className: 'mode-plan' },
  'acceptEdits': { label: 'ACCEPT', className: 'mode-accept' }
};

/**
 * Update the mode button display
 */
function updateModeButtonDisplay() {
  const modeBtn = document.querySelector('[data-control="plan-mode"]');
  if (!modeBtn) return;

  const display = MODE_DISPLAY[currentMode] || { label: currentMode.toUpperCase(), className: null };

  modeBtn.textContent = display.label;
  modeBtn.classList.remove('mode-accept', 'mode-plan');
  if (display.className) {
    modeBtn.classList.add(display.className);
  }
}

/**
 * Cycle to the next permission mode
 */
async function cyclePermissionMode(event) {
  event.preventDefault();
  event.stopPropagation();

  console.log('Mode button clicked, current mode:', currentMode);

  if (!window.electronAPI?.claude?.setMode) {
    console.warn('Claude API not available - cannot toggle mode');
    return;
  }

  const currentIndex = MODE_CYCLE.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
  const newMode = MODE_CYCLE[nextIndex];

  console.log('Switching to mode:', newMode);

  try {
    await window.electronAPI.claude.setMode(newMode);
    currentMode = newMode;
    updateModeButtonDisplay();
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

  const modeBtn = document.querySelector('[data-control="plan-mode"]');
  if (modeBtn) {
    console.log('Found mode button, attaching click handler');
    modeBtn.addEventListener('click', cyclePermissionMode);
  } else {
    console.error('Mode button not found!');
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
        updateModeButtonDisplay();
      })
      .catch(err => console.error('Failed to get initial mode:', err));
  }

  // 23-4: Register global keyboard shortcut for compact (Cmd+Shift+K / Ctrl+Shift+K)
  document.addEventListener('keydown', handleCompactShortcut);
  console.log('[Controls] Compact keyboard shortcut registered (Cmd/Ctrl+Shift+K)');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initControls);
} else {
  // DOM already loaded
  initControls();
}
