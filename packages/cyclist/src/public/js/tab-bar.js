/**
 * Tab Bar - Data-driven horizontal navigation for panels
 *
 * Features:
 * - Reads registered panels from PanelManager
 * - Dynamically renders tabs based on panel registry
 * - Syncs active state with panel manager
 * - Updates badges reactively
 * - Model indicator display
 *
 * The tab bar is purely presentational - all panel logic lives in PanelManager.
 */

import PanelManager from '/js/panel-manager.js';

let tabBar = null;
let tabBarLeft = null;
let modelIndicator = null;

/**
 * Create a tab button element
 */
function createTabButton(panel) {
  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.dataset.panel = panel.id;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-pressed', panel.isOpen ? 'true' : 'false');
  btn.setAttribute('aria-controls', panel.id);

  const shortcutHint = panel.shortcut ? ` (Cmd+${panel.shortcut})` : '';
  btn.title = `Toggle ${panel.label.toLowerCase()}${shortcutHint}`;

  // Label
  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = panel.label;
  btn.appendChild(label);

  // Badge (supports both numeric counts and string indicators like 🔔)
  const badge = document.createElement('span');
  badge.className = 'tab-badge';
  badge.id = `${panel.id}-tab-badge`;
  const badgeValue = panel.getBadgeCount?.() ?? panel.getBadge?.() ?? 0;
  // Handle both numeric and string badges
  if (typeof badgeValue === 'string') {
    badge.textContent = badgeValue;
  } else {
    badge.textContent = badgeValue > 0 ? String(badgeValue) : '';
  }
  btn.appendChild(badge);

  // Click handler
  btn.addEventListener('click', () => {
    PanelManager.toggle(panel.id);
  });

  return btn;
}

/**
 * Render all tabs from registered panels
 */
function renderTabs() {
  if (!tabBarLeft) return;

  // Clear existing tabs
  tabBarLeft.innerHTML = '';

  // Create tabs for all registered panels
  const panels = PanelManager.getPanels();
  panels.forEach(panel => {
    const btn = createTabButton(panel);
    tabBarLeft.appendChild(btn);
  });

  console.log('[TabBar] Rendered', panels.length, 'tabs');
}

/**
 * Update a single tab's active state
 */
function updateTabState(panelId, isOpen) {
  const btn = tabBarLeft?.querySelector(`[data-panel="${panelId}"]`);
  if (btn) {
    btn.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
  }
}

/**
 * Format badge value (handles both numbers and strings like 🔔)
 */
function formatBadgeValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  return value > 0 ? String(value) : '';
}

/**
 * Update all badge counts
 */
function updateBadges() {
  const panels = PanelManager.getPanels();
  panels.forEach(panel => {
    const badge = document.getElementById(`${panel.id}-tab-badge`);
    if (badge) {
      const badgeValue = panel.getBadgeCount?.() ?? panel.getBadge?.() ?? 0;
      const newText = formatBadgeValue(badgeValue);
      if (badge.textContent !== newText) {
        badge.textContent = newText;
        // Pulse animation on change
        if (newText) {
          badge.classList.add('pulse');
          setTimeout(() => badge.classList.remove('pulse'), 300);
        }
      }
    }
  });
}

/**
 * Update badge for a specific panel
 */
export function updateBadge(panelId) {
  const panel = PanelManager.getPanel(panelId);
  if (!panel) return;

  const badge = document.getElementById(`${panel.id}-tab-badge`);
  if (badge) {
    const badgeValue = panel.getBadgeCount?.() ?? panel.getBadge?.() ?? 0;
    badge.textContent = formatBadgeValue(badgeValue);
  }
}

/**
 * Set model indicator text
 */
export function setModelIndicator(modelName) {
  if (modelIndicator) {
    modelIndicator.textContent = modelName || '—';
  }
}

/**
 * Initialize tab bar
 */
export function init() {
  // Subscribe to badge-changed event for immediate updates (replaces polling)
  // 68-6: Use formatBadgeValue to handle both numeric and string badges (🔔)
  PanelManager.on('badge-changed', ({ panelId, count }) => {
    const badge = document.getElementById(`${panelId}-tab-badge`);
    if (badge) {
      const newText = formatBadgeValue(count);
      badge.textContent = newText;
      // Pulse animation on change (triggers for any non-empty badge)
      if (newText) {
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 300);
      }
    }
  });

  tabBar = document.getElementById('tab-bar');
  if (!tabBar) {
    console.warn('[TabBar] Tab bar element not found');
    return;
  }

  tabBarLeft = tabBar.querySelector('.tab-bar-left');
  modelIndicator = document.getElementById('tab-model-indicator');

  // Initial render
  renderTabs();

  // Listen for panel registration changes
  PanelManager.on('panel-registered', () => {
    renderTabs();
  });

  PanelManager.on('panel-unregistered', () => {
    renderTabs();
  });

  // Listen for panel state changes
  PanelManager.on('panel-changed', ({ panelId, isOpen }) => {
    updateTabState(panelId, isOpen);
  });

  console.log('[TabBar] Initialized');
}

/**
 * Cleanup
 */
export function destroy() {
  // No-op: Event-driven updates don't require cleanup
  // (PanelManager event subscriptions are module-scoped)
}

// Export for module use
export default {
  init,
  destroy,
  setModelIndicator,
  updateBadge,
  renderTabs,
};

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
