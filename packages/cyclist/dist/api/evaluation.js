/**
 * Evaluation API Router - Story 19-9
 *
 * REST API for agent evaluation data. Exposes metrics aggregated by
 * agent role, persona/theme, and task type with regression detection.
 */
import { Router } from 'express';
import { getEvaluation, detectTrend, generateRecommendations, } from '../agent-evaluation.js';
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
export function createEvaluationRouter() {
    const router = Router();
    /**
     * GET /api/evaluation/agents
     *
     * Returns metrics for all agents.
     *
     * Response 200: Record<string, AgentMetrics>
     * Response 404: { error: 'No evaluation data available' }
     */
    router.get('/agents', (_req, res) => {
        const evaluation = getEvaluation();
        if (!evaluation) {
            return res.status(404).json({ error: 'No evaluation data available' });
        }
        res.json(evaluation.agentMetrics);
    });
    /**
     * GET /api/evaluation/agents/:role
     *
     * Returns metrics for a specific agent role.
     *
     * Response 200: AgentMetrics
     * Response 404: { error: 'No evaluation data available' } or { error: 'Agent not found: X' }
     */
    router.get('/agents/:role', (req, res) => {
        const evaluation = getEvaluation();
        if (!evaluation) {
            return res.status(404).json({ error: 'No evaluation data available' });
        }
        const role = req.params.role.toLowerCase();
        const metrics = evaluation.agentMetrics[role];
        if (!metrics) {
            return res.status(404).json({ error: `Agent not found: ${req.params.role}` });
        }
        res.json(metrics);
    });
    /**
     * GET /api/evaluation/personas
     *
     * Returns metrics for all personas/themes.
     *
     * Response 200: Record<string, PersonaMetrics>
     * Response 404: { error: 'No evaluation data available' }
     */
    router.get('/personas', (_req, res) => {
        const evaluation = getEvaluation();
        if (!evaluation) {
            return res.status(404).json({ error: 'No evaluation data available' });
        }
        res.json(evaluation.personaMetrics);
    });
    /**
     * GET /api/evaluation/tasks
     *
     * Returns metrics broken down by task type.
     *
     * Response 200: Record<string, TaskMetrics>
     * Response 404: { error: 'No evaluation data available' }
     */
    router.get('/tasks', (_req, res) => {
        const evaluation = getEvaluation();
        if (!evaluation) {
            return res.status(404).json({ error: 'No evaluation data available' });
        }
        res.json(evaluation.taskTypeMetrics);
    });
    /**
     * GET /api/evaluation/regression
     *
     * Returns regression alerts and trend information.
     *
     * Response 200: { alerts: RegressionAlert[], trends: Record<string, TrendDirection> }
     * Response 404: { error: 'No evaluation data available' }
     */
    router.get('/regression', (_req, res) => {
        const evaluation = getEvaluation();
        if (!evaluation) {
            return res.status(404).json({ error: 'No evaluation data available' });
        }
        // Calculate trends for each agent
        const trends = {};
        for (const role of Object.keys(evaluation.agentMetrics)) {
            trends[role] = detectTrend(role);
        }
        res.json({
            alerts: evaluation.regressionAlerts,
            trends,
        });
    });
    /**
     * GET /api/evaluation/recommendations
     *
     * Returns generated recommendations based on current evaluation.
     *
     * Response 200: string[]
     * Response 404: { error: 'No evaluation data available' }
     */
    router.get('/recommendations', (_req, res) => {
        const evaluation = getEvaluation();
        if (!evaluation) {
            return res.status(404).json({ error: 'No evaluation data available' });
        }
        const recommendations = generateRecommendations(evaluation);
        res.json(recommendations);
    });
    return router;
}
//# sourceMappingURL=evaluation.js.map