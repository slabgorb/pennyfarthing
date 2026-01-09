import { Router } from 'express';
import { WebSocket } from 'ws';
import { detectPennyfarthingProject, getCurrentPersona, getFullPersonaDetails } from '../pennyfarthing.js';
// Persona WebSocket clients (for real-time persona updates)
const personaClients = new Set();
// Get persona clients set (for WebSocket setup)
export function getPersonaClients() {
    return personaClients;
}
// Broadcast persona to all connected clients
export function broadcastPersona(persona) {
    const message = JSON.stringify(persona);
    for (const client of personaClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}
// Create persona API router
export function createPersonaRouter(getProjectDir) {
    const router = Router();
    // Persona API - GET current persona
    router.get('/', (_req, res) => {
        const projectDir = getProjectDir();
        const sessionId = process.env.CYCLIST_SESSION_ID;
        if (!detectPennyfarthingProject(projectDir)) {
            return res.status(404).json({ error: 'Not a Pennyfarthing project' });
        }
        const persona = getCurrentPersona(projectDir, sessionId);
        if (!persona) {
            return res.status(404).json({ error: 'No active persona' });
        }
        res.json(persona);
    });
    // Full persona API - GET complete persona details for popup
    router.get('/full', (_req, res) => {
        const projectDir = getProjectDir();
        const sessionId = process.env.CYCLIST_SESSION_ID;
        if (!detectPennyfarthingProject(projectDir)) {
            return res.status(404).json({ error: 'Not a Pennyfarthing project' });
        }
        const fullPersona = getFullPersonaDetails(projectDir, sessionId);
        if (!fullPersona) {
            return res.status(404).json({ error: 'No active persona' });
        }
        res.json(fullPersona);
    });
    return router;
}
//# sourceMappingURL=persona.js.map