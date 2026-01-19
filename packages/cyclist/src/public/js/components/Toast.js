/**
 * Toast Component (Story 35-9)
 *
 * Toast notification display for transient messages.
 * Auto-dismisses after timeout, supports action buttons.
 *
 * Exports:
 * - Toast object with show method
 */

// Module state
let toastContainer = null;
const DEFAULT_DURATION = 5000;

/**
 * Toast API
 */
export const Toast = {
  /**
   * Show a toast notification
   * @param {object} options - Toast configuration
   * @param {string} options.message - Toast message
   * @param {string} [options.type='info'] - Toast type (info, success, error, warning)
   * @param {number} [options.duration=5000] - Auto-dismiss duration in ms (0 = no auto-dismiss)
   * @param {object} [options.action] - Optional action button
   * @param {string} options.action.label - Action button label
   * @param {function} options.action.onClick - Action button click handler
   */
  show(options) {
    this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${options.type || 'info'}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    // Icon based on type
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
    };

    // Build toast content using DOM methods (safe from XSS)
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[options.type] || icons.info;
    toast.appendChild(iconSpan);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = options.message;
    toast.appendChild(messageSpan);

    // Action button if present
    if (options.action) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action';
      actionBtn.textContent = options.action.label;
      actionBtn.addEventListener('click', () => {
        options.action.onClick();
        this.dismiss(toast);
      });
      toast.appendChild(actionBtn);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      this.dismiss(toast);
    });
    toast.appendChild(closeBtn);

    // Add to container
    toastContainer.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto-dismiss
    const duration = options.duration ?? DEFAULT_DURATION;
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }

    return toast;
  },

  /**
   * Dismiss a toast
   * @param {HTMLElement} toast
   */
  dismiss(toast) {
    if (!toast) return;

    toast.classList.remove('show');
    toast.classList.add('hiding');

    // Remove after animation
    setTimeout(() => {
      toast.remove();
    }, 200);
  },

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    if (!toastContainer) return;
    toastContainer.querySelectorAll('.toast').forEach((toast) => {
      this.dismiss(toast);
    });
  },

  /**
   * Ensure toast container exists
   */
  ensureContainer() {
    if (toastContainer) return;

    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastContainer);
    }
  },
};
