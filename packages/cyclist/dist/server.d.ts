import { Express } from 'express';
import { Server } from 'http';
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo } from './api/index.js';
export type { GitInfo } from './api/index.js';
export declare const app: Express;
export declare function createTerminalServer(): Server;
/**
 * Write the server port to a .cyclist-port file for auto-discovery.
 * Called when Cyclist server starts to enable hook-based OTEL configuration.
 */
export declare function writePortFile(projectDir: string, port: number): void;
/**
 * Remove the .cyclist-port file during shutdown.
 * Prevents stale port files from pointing to non-existent servers.
 */
export declare function cleanupPortFile(projectDir: string): void;
/**
 * Read the port number from .cyclist-port file.
 * Returns null if file doesn't exist, is empty, or contains invalid content.
 */
export declare function readPortFile(projectDir: string): number | null;
/**
 * Get OTEL configuration environment variables based on port file.
 * Returns null if no valid port file exists.
 */
export declare function getOtelConfig(projectDir: string): {
    OTEL_EXPORTER_OTLP_PROTOCOL: string;
    OTEL_EXPORTER_OTLP_ENDPOINT: string;
} | null;
//# sourceMappingURL=server.d.ts.map