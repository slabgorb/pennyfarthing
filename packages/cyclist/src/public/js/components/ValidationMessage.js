/**
 * Validation Message Component (Story 35-9)
 *
 * Inline error display for form validation.
 * Shows error messages below form inputs with appropriate styling.
 *
 * Exports:
 * - ValidationMessage object with show/hide methods
 */

/**
 * Validation Message API
 */
export const ValidationMessage = {
  /**
   * Show a validation error for an input
   * @param {HTMLElement} input - The input element
   * @param {string} message - Error message to display
   */
  show(input, message) {
    if (!input) return;

    // Add error class to input
    input.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');

    // Create or update error message element
    let errorEl = this.getErrorElement(input);
    if (!errorEl) {
      errorEl = document.createElement('span');
      errorEl.className = 'validation-error error-message';
      errorEl.setAttribute('role', 'alert');
      errorEl.id = `${input.id}_error`;
      input.setAttribute('aria-describedby', errorEl.id);

      // Insert after input
      input.parentNode.insertBefore(errorEl, input.nextSibling);
    }

    errorEl.textContent = message;
  },

  /**
   * Hide validation error for an input
   * @param {HTMLElement} input - The input element
   */
  hide(input) {
    if (!input) return;

    // Remove error class from input
    input.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');

    // Remove error message element
    const errorEl = this.getErrorElement(input);
    if (errorEl) {
      errorEl.remove();
    }
  },

  /**
   * Get the error element for an input
   * @param {HTMLElement} input
   * @returns {HTMLElement|null}
   */
  getErrorElement(input) {
    if (!input) return null;
    return input.parentNode.querySelector(`.validation-error[id="${input.id}_error"]`);
  },

  /**
   * Clear all validation errors in a container
   * @param {HTMLElement} container
   */
  clearAll(container) {
    if (!container) return;

    // Remove error classes
    container.querySelectorAll('.has-error').forEach((el) => {
      el.classList.remove('has-error');
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    });

    // Remove error message elements
    container.querySelectorAll('.validation-error').forEach((el) => {
      el.remove();
    });
  },
};
