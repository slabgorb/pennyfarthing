/**
 * Server module stubs for @pennyfarthing/core.
 * STUB: Will be replaced with real implementation from cyclist/src/server.ts
 *
 * This is the main server entry point. After Story 98-17, this module
 * should contain the full WheelHub Express server with all API routes,
 * WebSocket support, port management, and settings initialization.
 */

import type { Express } from 'express';
import type { Server } from 'http';

// Re-exports that Cyclist depends on
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo, getAllReposGitInfo, getAllReposGitInfoAsync } from './api/index.js';
export type { GitInfo } from './api/index.js';
export { isBikeRackMode } from './env.js';

// STUB: Express app — null instead of real Express instance
export const app: Express = null as unknown as Express;

// STUB: Server factory — returns null instead of HTTP server
export function createTerminalServer(): Server {
  return null as unknown as Server;
}

// Port management stubs — always return wrong values for RED state
const PORT_FILE_NAME = '.cyclist-port';
const APPROVAL_PORT_FILE_NAME = '.cyclist-approval-port';
const PID_FILE_NAME = '.cyclist-pid';

export async function findAvailablePort(_startPort: number, _maxAttempts?: number): Promise<number> {
  return 0; // STUB: returns 0 instead of a real port
}

export function writePortFile(_projectDir: string, _port: number): void {
  // STUB: does nothing
}

export function cleanupPortFile(_projectDir: string): void {
  // STUB: does nothing
}

export function readPortFile(_projectDir: string): number | null {
  return null; // STUB: always returns null
}

export function writeApprovalPortFile(_projectDir: string, _port: number): void {
  // STUB: does nothing
}

export function cleanupApprovalPortFile(_projectDir: string): void {
  // STUB: does nothing
}

export function readApprovalPortFile(_projectDir: string): number | null {
  return null;
}

export function writePidFile(_projectDir: string, _pid: number): void {
  // STUB: does nothing
}

export function cleanupPidFile(_projectDir: string): void {
  // STUB: does nothing
}

export function readPidFile(_projectDir: string): number | null {
  return null;
}

export function isProcessRunning(_pid: number): boolean {
  return false;
}

export interface OtelConfig extends Record<string, string> {
  CLAUDE_CODE_ENABLE_TELEMETRY: string;
  OTEL_LOGS_EXPORTER: string;
  OTEL_METRICS_EXPORTER: string;
  OTEL_EXPORTER_OTLP_PROTOCOL: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
}

export function getOtelConfig(_projectDir: string): OtelConfig | null {
  return null; // STUB: always returns null
}
