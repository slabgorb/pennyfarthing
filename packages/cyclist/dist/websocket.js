import { WebSocketServer, WebSocket } from 'ws';
import { getCurrentStats, getStatsClients } from './api/stats.js';
import { getPersonaClients, broadcastPersona } from './api/persona.js';
import { detectPennyfarthingProject, getCurrentPersona, watchAgentChanges } from './pennyfarthing.js';
// Setup WebSocket servers for stats and persona updates
export function setupWebSocketServers(server, getProjectDir) {
    // WebSocket server for terminal at /ws (deprecated but kept for compatibility)
    const wss = new WebSocketServer({ noServer: true });
    // WebSocket server for stats at /ws/stats
    const statsWss = new WebSocketServer({ noServer: true });
    // WebSocket server for persona at /ws/persona
    const personaWss = new WebSocketServer({ noServer: true });
    // Handle upgrade requests
    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
        if (pathname === '/ws') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
        else if (pathname === '/ws/stats') {
            statsWss.handleUpgrade(request, socket, head, (ws) => {
                statsWss.emit('connection', ws, request);
            });
        }
        else if (pathname === '/ws/persona') {
            personaWss.handleUpgrade(request, socket, head, (ws) => {
                personaWss.emit('connection', ws, request);
            });
        }
        else {
            // Reject connections to other paths
            socket.destroy();
        }
    });
    // Handle stats WebSocket connections
    const statsClients = getStatsClients();
    statsWss.on('connection', (ws) => {
        // Add client to broadcast set
        statsClients.add(ws);
        // Send initial stats on connection
        const currentStats = getCurrentStats();
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(currentStats));
        }
        // Remove client on disconnect
        ws.on('close', () => {
            statsClients.delete(ws);
        });
        // Handle errors gracefully
        ws.on('error', () => {
            statsClients.delete(ws);
        });
    });
    // Handle persona WebSocket connections
    const personaClients = getPersonaClients();
    personaWss.on('connection', (ws) => {
        // Add client to broadcast set
        personaClients.add(ws);
        // Send initial persona on connection
        const projectDir = getProjectDir();
        const sessionId = process.env.CYCLIST_SESSION_ID;
        const persona = getCurrentPersona(projectDir, sessionId);
        if (persona && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(persona));
        }
        // Remove client on disconnect
        ws.on('close', () => {
            personaClients.delete(ws);
        });
        // Handle errors gracefully
        ws.on('error', () => {
            personaClients.delete(ws);
        });
    });
    // Set up agent file watcher for persona broadcasts
    const projectDir = getProjectDir();
    const sessionId = process.env.CYCLIST_SESSION_ID;
    if (detectPennyfarthingProject(projectDir)) {
        watchAgentChanges(projectDir, sessionId, (_agentRole) => {
            // When agent changes, get the new persona and broadcast
            const persona = getCurrentPersona(projectDir, sessionId);
            if (persona) {
                broadcastPersona(persona);
            }
        });
    }
    // Note: Terminal WebSocket handler removed in E7-5
    // The app now uses Claude SDK in Electron mode instead of PTY
    // This /ws endpoint is kept for potential future use but does nothing
    wss.on('connection', (ws) => {
        console.log('WebSocket /ws connection - deprecated (use Electron mode with Claude SDK)');
        ws.close(1000, 'Terminal mode deprecated - use Electron app');
    });
}
//# sourceMappingURL=websocket.js.map