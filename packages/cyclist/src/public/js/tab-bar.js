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
let badgeUpdateInterval = null;

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

  // Badge
  const badge = document.createElement('span');
  badge.className = 'tab-badge';
  badge.id = `${panel.id}-tab-badge`;
  const count = panel.getBadgeCount();
  badge.textContent = count > 0 ? String(count) : '';
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
 * Update all badge counts
 */
function updateBadges() {
  const panels = PanelManager.getPanels();
  panels.forEach(panel => {
    const badge = document.getElementById(`${panel.id}-tab-badge`);
    if (badge) {
      const count = panel.getBadgeCount();
      const newText = count > 0 ? String(count) : '';
      if (badge.textContent !== newText) {
        badge.textContent = newText;
        // Pulse animation on change
        if (count > 0) {
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
    const count = panel.getBadgeCount();
    badge.textContent = count > 0 ? String(count) : '';
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

  // Periodic badge updates (panels may update counts independently)
  badgeUpdateInterval = setInterval(updateBadges, 500);

  console.log('[TabBar] Initialized');
}

/**
 * Cleanup
 */
export function destroy() {
  if (badgeUpdateInterval) {
    clearInterval(badgeUpdateInterval);
  }
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
