/**
 * Background Tasks API (Story 35-16)
 *
 * REST endpoint for querying tracked background tasks.
 * Integrates with otlp-receiver's background task tracking.
 */

import { Router } from 'express';
import { WebSocket } from 'ws';
import { getBackgroundTasks, BackgroundTask, setBackgroundTaskStartCallback, setBackgroundTaskCallback } from '../otlp-receiver.js';

// WebSocket clients for real-time updates
const backgroundTaskClients = new Set<WebSocket>();

/**
 * Get background task WebSocket clients set
 */
export function getBackgroundTaskClients(): Set<WebSocket> {
  return backgroundTaskClients;
}

/**
 * Broadcast task event to all connected WebSocket clients
 */
export function broadcastBackgroundTaskEvent(type: 'task:started' | 'task:completed', task: BackgroundTask): void {
  const message = JSON.stringify({ type, task });
  for (const client of backgroundTaskClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Initialize WebSocket broadcasts for background task events
 * Call this after setting up the WebSocket server
 */
export function initBackgroundTaskBroadcast(): void {
  setBackgroundTaskStartCallback((task) => {
    broadcastBackgroundTaskEvent('task:started', task);
  });

  setBackgroundTaskCallback((task) => {
    broadcastBackgroundTaskEvent('task:completed', task);
  });
}

/**
 * Create Express router for background tasks API
 */
export function createBackgroundTasksRouter(): Router {
  const router = Router();

  /**
   * GET /api/background-tasks
   * Returns list of all tracked background tasks
   */
  router.get('/', (_req, res) => {
    const tasks = getBackgroundTasks();
    res.json({ tasks });
  });

  return router;
}
