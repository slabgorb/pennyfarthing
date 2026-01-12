/**
 * DangerousPathModal.js (Story 22-4)
 *
 * Renderer-side modal component for dangerous path approval workflow.
 * Displays path and category, with approve/reject/always-allow buttons.
 *
 * Follows the same pattern as ApprovalModal.js (22-3).
 */

// Modal state
let modalVisible = false;
let currentPath = '';
let currentToolId = '';
let currentCategory = '';
let responseCallback = null;

// DOM element references (lazily initialized)
let modalElement = null;
let pathDisplayElement = null;
let categoryIndicatorElement = null;

/**
 * Initialize modal element references
 */
function initElements() {
  if (modalElement) return;

  modalElement = document.getElementById('dangerous-path-modal');
  if (modalElement) {
    pathDisplayElement = modalElement.querySelector('.path-display');
    categoryIndicatorElement = modalElement.querySelector('.category-indicator');

    // Wire up button handlers
    const approveBtn = modalElement.querySelector('[data-action="approve"]');
    const rejectBtn = modalElement.querySelector('[data-action="reject"]');
    const alwaysAllowBtn = modalElement.querySelector('[data-action="always-allow"]');

    if (approveBtn) approveBtn.addEventListener('click', handleApprove);
    if (rejectBtn) rejectBtn.addEventListener('click', handleReject);
    if (alwaysAllowBtn) alwaysAllowBtn.addEventListener('click', handleAlwaysAllow);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
  }
}

/**
 * Handle keyboard shortcuts when modal is visible
 */
function handleKeydown(event) {
  if (!modalVisible) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    handleApprove();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleReject();
  }
}

/**
 * Get category display label and styling class
 */
function getCategoryInfo(category) {
  const categories = {
    secrets: { label: 'Secrets', className: 'category-secrets' },
    git: { label: 'Git Internals', className: 'category-git' },
    dependencies: { label: 'Dependencies', className: 'category-dependencies' },
    system: { label: 'System Path', className: 'category-system' },
  };
  return categories[category] || { label: category, className: '' };
}

/**
 * Show the dangerous path approval modal
 */
export function showDangerousPathModal(path, toolId, category) {
  initElements();

  currentPath = path;
  currentToolId = toolId;
  currentCategory = category;
  modalVisible = true;

  if (modalElement) {
    // Update path display
    if (pathDisplayElement) {
      pathDisplayElement.textContent = path;
    }

    // Update category indicator
    if (categoryIndicatorElement) {
      const categoryInfo = getCategoryInfo(category);
      categoryIndicatorElement.textContent = categoryInfo.label;
      categoryIndicatorElement.className = `category-indicator ${categoryInfo.className}`;
    }

    // Show modal
    modalElement.classList.remove('hidden');
    modalElement.setAttribute('aria-hidden', 'false');
    modalElement.focus();
  }
}

/**
 * Hide the dangerous path approval modal
 */
export function hideDangerousPathModal() {
  modalVisible = false;

  if (modalElement) {
    modalElement.classList.add('hidden');
    modalElement.setAttribute('aria-hidden', 'true');
  }

  // Clear state after hiding
  currentPath = '';
  currentToolId = '';
  currentCategory = '';
}

/**
 * Check if modal is currently visible
 */
export function isModalVisible() {
  return modalVisible;
}

/**
 * Get the currently displayed path
 */
export function getDisplayedPath() {
  return currentPath;
}

/**
 * Get the currently displayed category
 */
export function getDisplayedCategory() {
  return currentCategory;
}

/**
 * Set the callback for sending responses via IPC
 */
export function setResponseCallback(callback) {
  responseCallback = callback;
}

/**
 * Handle approve button click
 */
export function handleApprove() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      alwaysAllow: false,
    });
  }
  hideDangerousPathModal();
}

/**
 * Handle reject button click
 */
export function handleReject() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: false,
      alwaysAllow: false,
    });
  }
  hideDangerousPathModal();
}

/**
 * Handle always-allow button click
 */
export function handleAlwaysAllow() {
  if (responseCallback) {
    responseCallback({
      toolId: currentToolId,
      approved: true,
      alwaysAllow: true,
    });
  }
  hideDangerousPathModal();
}

/**
 * Get keyboard shortcuts for modal actions
 */
export function getKeyboardShortcuts() {
  return {
    approve: 'Enter',
    reject: 'Escape',
  };
}

/**
 * Initialize modal when DOM is ready
 * Also wire up IPC listener for approval requests
 */
export function init() {
  initElements();

  // Wire up IPC listener if electronAPI is available
  if (window.electronAPI?.path?.onApprovalRequest) {
    window.electronAPI.path.onApprovalRequest((_event, data) => {
      const { path, toolId, category } = data;
      showDangerousPathModal(path, toolId, category);
    });

    // Set response callback to send via IPC
    setResponseCallback((response) => {
      if (window.electronAPI?.path?.sendApprovalResponse) {
        window.electronAPI.path.sendApprovalResponse(response);
      }
    });
  }
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
