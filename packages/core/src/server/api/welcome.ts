/**
 * Welcome API - Broadcasts welcome messages on session start
 *
 * When the SessionStart hook runs, it calls POST /api/welcome with
 * project name and theme. This module broadcasts that to all connected
 * WebSocket clients on /ws/welcome so Cyclist can display a welcome
 * message with the pennyfarthing logo.
 */

import { WebSocket } from 'ws';

// WebSocket clients subscribed to welcome events
const welcomeClients = new Set<WebSocket>();

export interface WelcomeMessage {
  project: string;
  theme: string;
}

/**
 * Get the set of connected welcome clients
 */
export function getWelcomeClients(): Set<WebSocket> {
  return welcomeClients;
}

/**
 * Broadcast a welcome message to all connected clients
 */
export function broadcastWelcome(message: WelcomeMessage): void {
  const payload = JSON.stringify({
    type: 'welcome',
    project: message.project,
    theme: message.theme,
    timestamp: Date.now(),
  });

  for (const client of welcomeClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }

  console.log(`[Welcome] Broadcast to ${welcomeClients.size} clients:`, message);
}
