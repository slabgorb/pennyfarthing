/**
 * Welcome Message Display
 *
 * Connects to /ws/welcome WebSocket channel and displays a welcome
 * banner when a new session starts. Shows the Pennyfarthing logo
 * and a friendly greeting.
 */

let welcomeSocket = null;
let welcomeTimeout = null;

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
        showWelcomeBanner(data.project, data.theme);
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
 * Show the welcome banner with pennyfarthing logo
 */
function showWelcomeBanner(project, theme) {
  // Remove any existing banner
  const existingBanner = document.getElementById('welcome-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  // Clear any pending timeout
  if (welcomeTimeout) {
    clearTimeout(welcomeTimeout);
  }

  // Create banner element
  const banner = document.createElement('div');
  banner.id = 'welcome-banner';
  banner.className = 'welcome-banner';
  banner.innerHTML = `
    <div class="welcome-content">
      <div class="welcome-logo">
        <img src="/portraits/default.png" alt="Pennyfarthing" onerror="this.style.display='none'">
        <div class="welcome-logo-fallback">🚲</div>
      </div>
      <div class="welcome-text">
        <div class="welcome-title">Welcome to Pennyfarthing</div>
        <div class="welcome-subtitle">
          ${project ? `Project: <strong>${escapeHtml(project)}</strong>` : ''}
          ${theme ? ` • Theme: <strong>${escapeHtml(theme)}</strong>` : ''}
        </div>
        <div class="welcome-tagline">Agent-powered development with style</div>
      </div>
      <button class="welcome-close" onclick="this.parentElement.parentElement.remove()" aria-label="Close">×</button>
    </div>
  `;

  // Add to document
  document.body.appendChild(banner);

  // Trigger animation
  requestAnimationFrame(() => {
    banner.classList.add('visible');
  });

  // Auto-hide after 5 seconds
  welcomeTimeout = setTimeout(() => {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 300);
  }, 5000);
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
