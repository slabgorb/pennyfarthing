/**
 * Controls Module - Permission mode toggle via IPC
 *
 * Permission mode switch (4-way segmented control):
 * - plan: Read-only planning mode
 * - manual: Ask permission for everything (default)
 * - accept: Auto-accept file edits
 * - turbo: Auto-accept everything + auto-handoff to next agent
 *
 * Mode is persisted to settings and synced with Claude Code.
 *
 * 23-4: Adds Cmd+Shift+K keyboard shortcut for compact command
 * MSSCI-12127: Enhanced with sliding highlight, keyboard shortcuts, tooltips
 */

import { resetState as resetFilePanel } from './file-panel.js';
import { resetState as resetDiffPanel } from './diff-panel.js';
import { clear as clearChangedFiles } from './components/ChangedFilesList.js';
import { clearDiffs } from './components/DiffViewer.js';

/**
 * Valid modes for the segmented control (matches settings.ts PermissionMode)
 */
const VALID_MODES = ['plan', 'manual', 'accept', 'turbo'];

/**
 * Map mode index to mode name (for keyboard shortcuts)
 * MSSCI-12127 AC5
 */
const MODE_INDEX = {
  1: 'plan',
  2: 'manual',
  3: 'accept',
  4: 'turbo',
};

/**
 * Map our mode names to Claude Code's permission mode names
 * Note: turbo = acceptEdits + auto_handoff (handled separately)
 */
const MODE_TO_CLAUDE = {
  plan: 'plan',
  manual: 'default',
  accept: 'acceptEdits',
  turbo: 'acceptEdits', // turbo uses acceptEdits, auto_handoff is separate setting
};

/**
 * Current mode state
 */
let currentMode = 'manual';

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
 * Load permission mode from settings and sync with Claude Code
 * Detects turbo mode from permission_mode=turbo OR (accept + handoff_mode=auto)
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
    const handoffMode = settings?.workflow?.handoff_mode;

    // Detect turbo: explicit turbo OR (accept + auto handoff)
    if (mode === 'turbo' || (mode === 'accept' && handoffMode === 'auto')) {
      mode = 'turbo';
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
  } catch (err) {
    console.warn('[Controls] Failed to load mode from settings:', err);
  }
}

/**
 * Set permission mode directly (no cycling)
 * Persists to settings and syncs with Claude Code
 * Turbo mode = acceptEdits + auto_handoff enabled
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
    // Build settings payload
    // Turbo mode = acceptEdits + auto handoff
    const settings = {
      workflow: {
        permission_mode: newMode,
        handoff_mode: newMode === 'turbo' ? 'auto' : 'manual',
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
    console.log('Mode set successfully:', newMode, '(Claude:', claudeMode + ', handoff:', settings.workflow.handoff_mode + ')');
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

// =============================================================================
// Bell Mode (MSSCI-12275)
// =============================================================================

/**
 * Update the bell mode toggle display
 */
function updateBellModeDisplay() {
  const toggle = document.getElementById('bell-mode-toggle');
  if (!toggle) return;

  toggle.setAttribute('aria-pressed', bellModeEnabled ? 'true' : 'false');
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
 * Cmd+1/2/3/4 (Mac) or Ctrl+1/2/3/4 (Windows/Linux)
 */
function handleModeShortcut(event) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;

  // Check for Cmd/Ctrl + 1/2/3/4 (without Shift)
  if (modifierKey && !event.shiftKey && !event.altKey) {
    const keyNum = parseInt(event.key, 10);
    if (keyNum >= 1 && keyNum <= 4) {
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

  // Abort Claude process on page refresh/close to prevent orphaned processes
  window.addEventListener('beforeunload', () => {
    if (window.electronAPI?.claude?.abort) {
      window.electronAPI.claude.abort();
    }
  });

  // Load initial mode from settings (source of truth)
  loadModeFromSettings();

  // MSSCI-12275: Bell mode toggle
  const bellModeToggle = document.getElementById('bell-mode-toggle');
  if (bellModeToggle) {
    console.log('[Controls] Found bell mode toggle, attaching click handler');
    bellModeToggle.addEventListener('click', toggleBellMode);
    loadBellModeFromSettings();
  }

  // 23-4: Register global keyboard shortcut for compact (Cmd+Shift+K / Ctrl+Shift+K)
  document.addEventListener('keydown', handleCompactShortcut);
  console.log('[Controls] Compact keyboard shortcut registered (Cmd/Ctrl+Shift+K)');

  // MSSCI-12127 AC5: Register keyboard shortcuts for mode switching (Cmd/Ctrl+1/2/3/4)
  document.addEventListener('keydown', handleModeShortcut);
  console.log('[Controls] Mode keyboard shortcuts registered (Cmd/Ctrl+1/2/3/4)');

  // MSSCI-12275: Register keyboard shortcut for bell mode toggle (Cmd/Ctrl+B)
  document.addEventListener('keydown', handleBellModeShortcut);
  console.log('[Controls] Bell mode keyboard shortcut registered (Cmd/Ctrl+B)');
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
