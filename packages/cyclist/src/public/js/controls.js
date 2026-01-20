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
 * Map our mode names to Claude Code's permission mode names
 */
const MODE_TO_CLAUDE = {
  plan: 'plan',
  manual: 'default',
  accept: 'acceptEdits',
  turbo: 'dangerouslySkipPermissions',
};

/**
 * Current mode state
 */
let currentMode = 'manual';

/**
 * Update the mode switch display (segmented control)
 * Updates which segment is active based on current mode
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
 * Load permission mode from settings and sync with Claude Code
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

    const mode = settings?.workflow?.permission_mode || 'manual';
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
    // Persist to settings first
    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save({ workflow: { permission_mode: newMode } });
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: { permission_mode: newMode } }),
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

  // Load initial mode from settings (source of truth)
  loadModeFromSettings();

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
