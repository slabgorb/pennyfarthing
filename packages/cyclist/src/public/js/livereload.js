/**
 * Livereload Client - Automatic page refresh during development
 *
 * Connects to /ws/livereload and reloads the page when files change.
 * Only activates in development mode (localhost).
 */

// Only activate in development (localhost)
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  console.log('[Livereload] Initializing livereload client');

  let ws = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_DELAY_BASE = 1000; // Start with 1 second

  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws/livereload`);

    ws.onopen = () => {
      console.log('[Livereload] Connected to server');
      reconnectAttempts = 0; // Reset on successful connection
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'reload') {
          console.log('[Livereload] Reloading page...');
          location.reload();
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      console.log('[Livereload] Disconnected from server');
      ws = null;

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttempts);
        console.log(`[Livereload] Reconnecting in ${Math.round(delay / 1000)}s...`);
        setTimeout(() => {
          reconnectAttempts++;
          connect();
        }, delay);
      } else {
        console.log('[Livereload] Max reconnect attempts reached. Reload page manually if server restarts.');
      }
    };

    ws.onerror = () => {
      // Error will trigger onclose, so no need to handle here
    };
  }

  // Initial connection
  connect();
}
