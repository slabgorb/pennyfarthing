/**
 * Welcome Message Display
 *
 * Connects to /ws/welcome WebSocket channel and displays a welcome
 * message when a new session starts. Shows an inline welcome in the
 * message view with the Pennyfarthing logo.
 */

let welcomeSocket = null;
let welcomeShown = false;

/**
 * Initialize the welcome WebSocket connection
 */
export function initWelcome() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/welcome`;

  welcomeSocket = new WebSocket(wsUrl);

  welcomeSocket.onopen = () => {
    console.log('[Welcome] WebSocket connected');
  };

  welcomeSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'welcome') {
        showWelcomeInline(data.project, data.theme);
      }
    } catch (err) {
      console.error('[Welcome] Failed to parse message:', err);
    }
  };

  welcomeSocket.onclose = () => {
    console.log('[Welcome] WebSocket closed, reconnecting...');
    setTimeout(initWelcome, 2000);
  };

  welcomeSocket.onerror = (err) => {
    console.error('[Welcome] WebSocket error:', err);
  };
}

/**
 * Show the welcome message inline in the message view
 */
function showWelcomeInline(project, theme) {
  // Only show once per page load
  if (welcomeShown) {
    return;
  }
  welcomeShown = true;

  // Find the message container
  const messageContainer = document.getElementById('message-container');
  if (!messageContainer) {
    console.warn('[Welcome] Message container not found');
    return;
  }

  // Create inline welcome message
  const welcomeEl = document.createElement('div');
  welcomeEl.className = 'welcome-inline';
  welcomeEl.innerHTML = `
    <div class="welcome-inline-content">
      <img src="/pennyfarthing-transparent.png" alt="Pennyfarthing" class="welcome-inline-logo">
      <div class="welcome-inline-text">
        <span class="welcome-inline-title">Welcome to Pennyfarthing</span>
        <span class="welcome-inline-details">
          ${project ? `${escapeHtml(project)}` : ''}${theme ? ` · ${escapeHtml(theme)}` : ''}
        </span>
      </div>
    </div>
  `;

  // Insert at the top of the message container
  messageContainer.insertBefore(welcomeEl, messageContainer.firstChild);

  console.log('[Welcome] Inline message displayed');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on module load
initWelcome();
