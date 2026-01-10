import { Router } from 'express';
import { WebSocket } from 'ws';
// Stats state (in-memory for prototype)
// Context is handled separately via dedicated context IPC channel (B-19)
let currentStats = {
    model: '—', // Unknown until parsed from PTY output
    status: '—',
};
// Stats WebSocket clients (for real-time updates)
const statsClients = new Set();
// Debounce state for stats broadcasts
let pendingStats = null;
let debounceTimer = null;
const DEBOUNCE_MS = 100;
// Get current stats state
export function getCurrentStats() {
    return currentStats;
}
// Get stats clients set (for WebSocket setup)
export function getStatsClients() {
    return statsClients;
}
// Broadcast stats to all connected clients (debounced)
export function broadcastStats(stats) {
    // Merge with pending stats
    pendingStats = pendingStats ? { ...pendingStats, ...stats } : stats;
    // Clear existing timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    // Schedule broadcast after debounce period
    debounceTimer = setTimeout(() => {
        if (pendingStats) {
            const message = JSON.stringify(pendingStats);
            for (const client of statsClients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            }
            pendingStats = null;
        }
        debounceTimer = null;
    }, DEBOUNCE_MS);
}
// Create stats API router
export function createStatsRouter() {
    const router = Router();
    // Stats API - GET current stats
    router.get('/', (_req, res) => {
        res.json(currentStats);
    });
    // Stats API - SET stats (partial update supported)
    // Context is handled separately via dedicated context IPC channel (B-19)
    router.post('/', (req, res) => {
        const { model, status } = req.body;
        // Validate types if provided
        if (model !== undefined && typeof model !== 'string') {
            return res.status(400).json({ error: 'model must be a string' });
        }
        if (status !== undefined && typeof status !== 'string') {
            return res.status(400).json({ error: 'status must be a string' });
        }
        // Partial update - merge with existing stats
        currentStats = {
            ...currentStats,
            ...(model !== undefined && { model }),
            ...(status !== undefined && { status }),
        };
        res.json({ success: true, ...currentStats });
    });
    return router;
}
//# sourceMappingURL=stats.js.map