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
 * Find an available port starting from the given port.
 * Tries ports sequentially until one is available or maxAttempts reached.
 * Used by both Electron mode and standalone server mode.
 */
export declare function findAvailablePort(startPort: number, maxAttempts?: number): Promise<number>;
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
 * Write the Claude process PID to .cyclist-pid file.
 * Used to track which Claude process belongs to this Cyclist instance.
 */
export declare function writePidFile(projectDir: string, pid: number): void;
/**
 * Remove the .cyclist-pid file during shutdown.
 * Prevents stale PID files from causing incorrect process termination.
 */
export declare function cleanupPidFile(projectDir: string): void;
/**
 * Read the PID from .cyclist-pid file.
 * Returns null if file doesn't exist, is empty, or contains invalid content.
 */
export declare function readPidFile(projectDir: string): number | null;
/**
 * Check if a process with the given PID is still running.
 * Returns true if process exists, false otherwise.
 */
export declare function isProcessRunning(pid: number): boolean;
/**
 * OTEL configuration type for Claude Code telemetry
 * Extends Record<string, string> for compatibility with process.env spreading
 */
export interface OtelConfig extends Record<string, string> {
    CLAUDE_CODE_ENABLE_TELEMETRY: string;
    OTEL_LOGS_EXPORTER: string;
    OTEL_METRICS_EXPORTER: string;
    OTEL_EXPORTER_OTLP_PROTOCOL: string;
    OTEL_EXPORTER_OTLP_ENDPOINT: string;
}
/**
 * Get OTEL configuration environment variables based on port file.
 * Returns null if no valid port file exists.
 *
 * Claude Code requires explicit opt-in for telemetry:
 * - CLAUDE_CODE_ENABLE_TELEMETRY=1 to enable telemetry
 * - OTEL_LOGS_EXPORTER=otlp to export tool events
 * - OTEL_METRICS_EXPORTER=otlp to export token metrics
 *
 * @see https://code.claude.com/docs/en/monitoring-usage
 */
export declare function getOtelConfig(projectDir: string): OtelConfig | null;
//# sourceMappingURL=server.d.ts.map