import { Router } from 'express';
import { WebSocket } from 'ws';
import { Persona } from '../pennyfarthing.js';
export declare function getPersonaClients(): Set<WebSocket>;
export declare function broadcastPersona(persona: Persona): void;
export declare function createPersonaRouter(getProjectDir: () => string): Router;
//# sourceMappingURL=persona.d.ts.map