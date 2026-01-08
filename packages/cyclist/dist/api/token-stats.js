import { Router } from 'express';
import { WebSocket } from 'ws';
import { getTokenStats, setTokenStatsCallback } from '../otlp-receiver.js';
// Token stats WebSocket clients (for real-time updates)
const tokenStatsClients = new Set();
// Get token stats clients set (for WebSocket setup)
export function getTokenStatsClients() {
    return tokenStatsClients;
}
// Broadcast token stats to all connected WebSocket clients
export function broadcastTokenStats(stats) {
    const message = JSON.stringify(stats);
    for (const client of tokenStatsClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}
// Create token stats API router
export function createTokenStatsRouter() {
    const router = Router();
    // Token Stats API - GET current token stats
    router.get('/', (_req, res) => {
        res.json(getTokenStats());
    });
    return router;
}
// Initialize token stats callback for WebSocket broadcasts
// Called once during server setup
export function initTokenStatsBroadcast() {
    setTokenStatsCallback((stats) => {
        broadcastTokenStats(stats);
    });
}
//# sourceMappingURL=token-stats.js.map