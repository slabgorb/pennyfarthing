/**
 * Evaluation API Router - Story 19-9
 *
 * REST API for agent evaluation data. Exposes metrics aggregated by
 * agent role, persona/theme, and task type with regression detection.
 */
import { Router } from 'express';
/**
 * Create evaluation API router
 *
 * Endpoints:
 * - GET /agents - All agent metrics
 * - GET /agents/:role - Specific agent metrics
 * - GET /personas - All persona metrics
 * - GET /tasks - Task type breakdown
 * - GET /regression - Regression alerts and trends
 * - GET /recommendations - Generated recommendations
 */
export declare function createEvaluationRouter(): Router;
//# sourceMappingURL=evaluation.d.ts.map