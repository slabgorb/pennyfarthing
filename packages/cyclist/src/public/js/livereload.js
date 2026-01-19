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
  const RECONNECT_DELAY = 2000; // Fixed 2s reconnection

  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws/livereload`);

    ws.onopen = () => {
      console.log('[Livereload] Connected to server');
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
      ws = null;
      console.log('[Livereload] Server disconnected. Retrying every 2s...');
      setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      // Error will trigger onclose, so no need to handle here
    };
  }

  // Initial connection
  connect();
}
