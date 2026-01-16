/**
 * Confirm Dialog Component (Story 35-9)
 *
 * Modal confirmation dialog for user decisions.
 * Supports customizable title, message, and button configuration.
 *
 * Exports:
 * - ConfirmDialog object with show method
 */

// Module state
let currentResolver = null;
let isDialogOpen = false;

/**
 * Confirm Dialog API
 */
export const ConfirmDialog = {
  /**
   * Show a confirmation dialog
   * @param {object} options - Dialog configuration
   * @param {string} options.title - Dialog title
   * @param {string} options.message - Dialog message
   * @param {Array<{label: string, value: string, variant?: string}>} options.buttons - Button configurations
   * @returns {Promise<string>} - Resolves with the clicked button's value
   */
  show(options) {
    return new Promise((resolve) => {
      currentResolver = resolve;
      isDialogOpen = true;

      const dialog = document.getElementById('confirm-dialog');
      if (!dialog) {
        // Create dialog if it doesn't exist
        this.createDialog();
      }

      this.render(options);

      const dialogEl = document.getElementById('confirm-dialog');
      if (dialogEl) {
        dialogEl.classList.remove('hidden');
        dialogEl.setAttribute('aria-hidden', 'false');
        dialogEl.focus();
      }

      // Setup keyboard listener
      document.addEventListener('keydown', this.handleKeydown);
    });
  },

  /**
   * Hide the dialog
   */
  hide() {
    isDialogOpen = false;
    const dialog = document.getElementById('confirm-dialog');
    if (dialog) {
      dialog.classList.add('hidden');
      dialog.setAttribute('aria-hidden', 'true');
    }
    document.removeEventListener('keydown', this.handleKeydown);
  },

  /**
   * Handle button click
   * @param {string} value - Button value
   */
  handleClick(value) {
    this.hide();
    if (currentResolver) {
      currentResolver(value);
      currentResolver = null;
    }
  },

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event
   */
  handleKeydown(event) {
    if (!isDialogOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      ConfirmDialog.handleClick('cancel');
    }
  },

  /**
   * Create the dialog element
   */
  createDialog() {
    const dialog = document.createElement('div');
    dialog.id = 'confirm-dialog';
    dialog.className = 'confirm-dialog hidden';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    dialog.innerHTML = `
      <div class="dialog-overlay" data-action="cancel"></div>
      <div class="dialog-content">
        <div class="dialog-header">
          <h3 class="dialog-title" id="dialog-title"></h3>
        </div>
        <div class="dialog-body">
          <p class="dialog-message" id="dialog-message"></p>
        </div>
        <div class="dialog-footer"></div>
      </div>
    `;

    // Wire up overlay click
    dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
      this.handleClick('cancel');
    });

    document.body.appendChild(dialog);
  },

  /**
   * Render dialog content
   * @param {object} options
   */
  render(options) {
    const dialog = document.getElementById('confirm-dialog');
    if (!dialog) return;

    // Set title
    const title = dialog.querySelector('.dialog-title');
    if (title) {
      title.textContent = options.title || 'Confirm';
    }
    dialog.setAttribute('aria-labelledby', 'dialog-title');

    // Set message
    const message = dialog.querySelector('.dialog-message');
    if (message) {
      message.textContent = options.message || '';
    }

    // Render buttons
    const footer = dialog.querySelector('.dialog-footer');
    if (footer) {
      footer.innerHTML = '';
      (options.buttons || []).forEach((btn) => {
        const button = document.createElement('button');
        button.className = `dialog-btn ${btn.variant || 'secondary'}`;
        button.textContent = btn.label;
        button.dataset.value = btn.value;
        button.addEventListener('click', () => this.handleClick(btn.value));
        footer.appendChild(button);
      });
    }
  },
};
