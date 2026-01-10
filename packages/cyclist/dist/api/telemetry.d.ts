/**
 * Telemetry API Router - Stories 19-6, 19-7
 *
 * REST API for telemetry data including TDD metrics, session stats,
 * tool usage, agent stats, and story costs.
 */
import { Router } from 'express';
/**
 * Create telemetry API router
 *
 * Endpoints:
 * - GET /tdd - Returns current TDD phase metrics
 * - GET /session - Returns session stats (tokens, cost, duration)
 * - GET /tools - Returns tool usage breakdown
 * - GET /agents - Returns per-agent token stats
 * - GET /stories - Returns per-story token stats
 */
export declare function createTelemetryRouter(): Router;
//# sourceMappingURL=telemetry.d.ts.map