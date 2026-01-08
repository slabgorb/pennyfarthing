import { Router } from 'express';
import { WebSocket } from 'ws';
import { TokenStats } from '../otlp-receiver.js';
export declare function getTokenStatsClients(): Set<WebSocket>;
export declare function broadcastTokenStats(stats: TokenStats): void;
export declare function createTokenStatsRouter(): Router;
export declare function initTokenStatsBroadcast(): void;
//# sourceMappingURL=token-stats.d.ts.map