/**
 * MSSCI-12123: Welcome Webview Adapter
 *
 * Frontend JavaScript for the Welcome panel webview.
 * Handles button clicks, command execution, and dismiss functionality.
 */

// VS Code API accessor
const vscode = acquireVsCodeApi();

/**
 * Send a message to the extension host.
 */
function sendMessage(type, data = {}) {
  vscode.postMessage({ type, ...data });
}

/**
 * Execute a VS Code command via the extension host.
 */
function executeCommand(command, ...args) {
  sendMessage('executeCommand', { command, args });
}

/**
 * Open an external URL via the extension host.
 */
function openExternal(url) {
  sendMessage('openExternal', { url });
}

/**
 * Dismiss the welcome view (don't show again).
 */
function dismissWelcome() {
  sendMessage('dismiss');
}

/**
 * Initialize event listeners.
 */
function init() {
  // Handle action buttons
  document.querySelectorAll('.action-button').forEach((button) => {
    button.addEventListener('click', () => {
      const command = button.dataset.command;
      if (command) {
        executeCommand(command);
      }
    });
  });

  // Handle links
  document.querySelectorAll('.link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) {
        openExternal(url);
      }
    });
  });

  // Handle dismiss button
  const dismissBtn = document.getElementById('dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      dismissWelcome();
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
