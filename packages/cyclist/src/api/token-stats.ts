import { Router } from 'express';
import { WebSocket } from 'ws';
import { getTokenStats, addTokenStatsListener, TokenStats } from '../otlp-receiver.js';

// Token stats WebSocket clients (for real-time updates)
const tokenStatsClients = new Set<WebSocket>();

// Get token stats clients set (for WebSocket setup)
export function getTokenStatsClients(): Set<WebSocket> {
  return tokenStatsClients;
}

// Broadcast token stats to all connected WebSocket clients
export function broadcastTokenStats(stats: TokenStats): void {
  const message = JSON.stringify(stats);
  for (const client of tokenStatsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Create token stats API router
export function createTokenStatsRouter(): Router {
  const router = Router();

  // Token Stats API - GET current token stats
  router.get('/', (_req, res) => {
    res.json(getTokenStats());
  });

  return router;
}

// Initialize token stats listener for WebSocket broadcasts
// Called once during server setup
// Uses addTokenStatsListener to support multiple subscribers (e.g., IPC + WebSocket)
export function initTokenStatsBroadcast(): void {
  addTokenStatsListener((stats) => {
    broadcastTokenStats(stats);
  });
}
