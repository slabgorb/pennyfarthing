/**
 * Vitest setup file
 *
 * Configures testing environment with:
 * - @testing-library/jest-dom matchers
 * - Global test utilities
 * - WebSocket mock (happy-dom v20.1.0 rejects path-based WS URLs)
 */

import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Mock WebSocket to allow path-based URLs (e.g., ws://localhost/ws/context)
// happy-dom v20.1.0 throws SyntaxError on paths, but our app uses them extensively
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  readyState = 1; // OPEN

  constructor(public url: string) {
    // Accept any URL including paths (e.g., /ws/context, /ws/stats, /ws/story)
    // Simulate async connection and send initial empty data
    setTimeout(() => {
      if (this.onopen) {
        this.onopen();
      }

      // Send initial empty data based on the endpoint
      // This prevents components from being stuck in loading state
      if (this.onmessage) {
        if (url.includes('/ws/todos')) {
          this.onmessage({ data: JSON.stringify({ type: 'init', todos: [] }) });
        } else if (url.includes('/ws/story')) {
          this.onmessage({ data: JSON.stringify({ type: 'init', id: null, title: null }) });
        } else if (url.includes('/ws/sprint')) {
          this.onmessage({
            data: JSON.stringify({
              type: 'init',
              currentStory: null,
              nextStory: null,
              epics: [],
              futureEpics: [],
              sprint: { number: 0, name: '', done: 0, remaining: 0, inProgress: 0, endDate: '' }
            })
          });
        }
      }
    }, 0);
  }

  send(data: string) {
    // No-op in tests
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose();
    }
  }

  addEventListener(event: string, handler: any) {
    if (event === 'open') this.onopen = handler;
    else if (event === 'message') this.onmessage = handler;
    else if (event === 'close') this.onclose = handler;
    else if (event === 'error') this.onerror = handler;
  }

  removeEventListener(event: string, handler: any) {
    if (event === 'open' && this.onopen === handler) this.onopen = null;
    else if (event === 'message' && this.onmessage === handler) this.onmessage = null;
    else if (event === 'close' && this.onclose === handler) this.onclose = null;
    else if (event === 'error' && this.onerror === handler) this.onerror = null;
  }

  // Test helper to simulate server message
  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// Install mock globally
vi.stubGlobal('WebSocket', MockWebSocket);

// Inject CSS styles for testing (happy-dom doesn't auto-load stylesheets)
// These styles are from src/public/styles/tailwind.css
const testStyles = `
  .agent-popup-details {
    padding: 16px;
    overflow-y: auto;
    min-height: 380px;
    max-height: calc(80vh - 60px);
    transition: opacity 0.15s ease;
  }

  .popup-portrait {
    width: 200px;
    height: 200px;
    margin: 0 auto 16px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-alt, #252526);
  }

  .popup-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .popup-detail {
    margin-bottom: 12px;
    max-height: 4.5em;
    overflow: hidden;
  }

  .popup-detail span {
    font-size: 0.9rem;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .popup-detail label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--text-muted, #888);
    margin-bottom: 2px;
  }
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = testStyles;
  document.head.appendChild(style);
}
