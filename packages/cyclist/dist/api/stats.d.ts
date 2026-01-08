import { Router } from 'express';
import { WebSocket } from 'ws';
import { ParsedStats } from '../parser.js';
export declare function getCurrentStats(): {
    model: string;
    status: string;
    context: string;
};
export declare function getStatsClients(): Set<WebSocket>;
export declare function broadcastStats(stats: ParsedStats): void;
export declare function createStatsRouter(): Router;
//# sourceMappingURL=stats.d.ts.map