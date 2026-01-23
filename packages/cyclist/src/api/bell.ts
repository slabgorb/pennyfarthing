/**
 * Bell Mode API - WebSocket broadcast for message consumption
 *
 * When the PostToolUse hook consumes a queued message, it calls /api/bell-consumed.
 * This module broadcasts to connected browsers so they can:
 * 1. Dequeue the message from in-memory queue
 * 2. Display the injected message in the conversation stream
 */

import { WebSocket } from 'ws';

// Bell WebSocket clients
const bellClients = new Set<WebSocket>();

/**
 * Get bell clients set (for WebSocket setup)
 */
export function getBellClients(): Set<WebSocket> {
  return bellClients;
}

/**
 * Broadcast bell consumed event to all connected browsers
 * @param text - The message text that was injected into Claude's context
 */
export function broadcastBellConsumed(text: string): void {
  const message = JSON.stringify({
    type: 'bell-consumed',
    text,
    timestamp: Date.now(),
  });

  for (const client of bellClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
