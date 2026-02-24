import { Router } from 'express';
import { WebSocket } from 'ws';
import { detectPennyfarthingProject, getCurrentPersona, getFullPersonaDetails, Persona } from '../pennyfarthing.js';

// Persona WebSocket clients (for real-time persona updates)
const personaClients = new Set<WebSocket>();

// Track streaming state for persona broadcasts (Story 94-1: MSSCI-14660)
let currentlyStreaming = false;

// Get persona clients set (for WebSocket setup)
export function getPersonaClients() {
  return personaClients;
}

// Get current streaming state (for initial persona payload on connection)
export function getStreamingState(): boolean {
  return currentlyStreaming;
}

// Broadcast persona to all connected clients
export function broadcastPersona(persona: Persona): void {
  const message = JSON.stringify({ ...persona, isStreaming: currentlyStreaming });
  for (const client of personaClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Update streaming state and broadcast to persona clients (Story 94-1: MSSCI-14660)
export function setStreamingState(streaming: boolean): void {
  if (currentlyStreaming === streaming) return;
  currentlyStreaming = streaming;
  const message = JSON.stringify({ type: 'streaming', isStreaming: streaming });
  for (const client of personaClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Create persona API router
export function createPersonaRouter(getProjectDir: () => string): Router {
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
