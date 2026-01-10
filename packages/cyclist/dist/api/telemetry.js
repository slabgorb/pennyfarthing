/**
 * Telemetry API Router - Stories 19-6, 19-7
 *
 * REST API for telemetry data including TDD metrics, session stats,
 * tool usage, agent stats, and story costs.
 */
import { Router } from 'express';
import { getTDDMetrics } from '../tdd-metrics.js';
import { getSpanHierarchy } from '../span-hierarchy.js';
import { getTokenStatsByAgent } from '../agent-context.js';
import { getTokenStatsByStory } from '../story-context.js';
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
export function createTelemetryRouter() {
    const router = Router();
    /**
     * GET /api/telemetry/tdd
     *
     * Returns TDD phase timing metrics for the current story.
     */
    router.get('/tdd', (_req, res) => {
        const metrics = getTDDMetrics();
        if (!metrics) {
            return res.status(404).json({ error: 'No TDD metrics available' });
        }
        res.json(metrics);
    });
    /**
     * GET /api/telemetry/session
     *
     * Returns aggregate session statistics including token counts,
     * total cost, duration, and span count.
     */
    router.get('/session', (_req, res) => {
        const spans = getSpanHierarchy();
        if (!spans || spans.length === 0) {
            return res.status(404).json({ error: 'No session data available' });
        }
        // Calculate session stats from spans
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCacheRead = 0;
        let totalCost = 0;
        let spanCount = 0;
        let minStartTime = Infinity;
        let maxEndTime = 0;
        for (const span of spans) {
            // Count parent span
            spanCount++;
            // Aggregate tokens from span
            if (span.tokenUsage) {
                totalInputTokens += span.tokenUsage.input || 0;
                totalOutputTokens += span.tokenUsage.output || 0;
                totalCacheRead += span.tokenUsage.cache_read || 0;
            }
            // Track timing
            if (span.startTime) {
                minStartTime = Math.min(minStartTime, span.startTime);
            }
            if (span.endTime) {
                maxEndTime = Math.max(maxEndTime, span.endTime);
            }
            // Count child spans (tools)
            if (span.childSpans) {
                spanCount += span.childSpans.length;
                for (const child of span.childSpans) {
                    if (child.startTime) {
                        minStartTime = Math.min(minStartTime, child.startTime);
                    }
                    if (child.endTime) {
                        maxEndTime = Math.max(maxEndTime, child.endTime);
                    }
                }
            }
        }
        const duration = maxEndTime > minStartTime ? maxEndTime - minStartTime : 0;
        res.json({
            totalTokens: {
                input: totalInputTokens,
                output: totalOutputTokens,
                cache_read: totalCacheRead,
            },
            totalCost,
            duration,
            spanCount,
        });
    });
    /**
     * GET /api/telemetry/tools
     *
     * Returns tool usage breakdown with count, totalDuration, and avgDuration
     * per tool type.
     */
    router.get('/tools', (_req, res) => {
        const spans = getSpanHierarchy();
        if (!spans || spans.length === 0) {
            return res.status(404).json({ error: 'No tool data available' });
        }
        // Collect all tool spans
        const toolStats = {};
        for (const span of spans) {
            if (span.childSpans) {
                for (const child of span.childSpans) {
                    const toolName = child.attributes?.['tool.name'] || 'unknown';
                    const duration = child.attributes?.['tool.duration_ms'] || child.durationMs || 0;
                    if (!toolStats[toolName]) {
                        toolStats[toolName] = { count: 0, totalDuration: 0 };
                    }
                    toolStats[toolName].count++;
                    toolStats[toolName].totalDuration += duration;
                }
            }
        }
        // If no tools found, return 404
        if (Object.keys(toolStats).length === 0) {
            return res.status(404).json({ error: 'No tool data available' });
        }
        // Calculate avgDuration and format response
        const tools = {};
        for (const [toolName, stats] of Object.entries(toolStats)) {
            tools[toolName] = {
                count: stats.count,
                totalDuration: stats.totalDuration,
                avgDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
            };
        }
        res.json({ tools });
    });
    /**
     * GET /api/telemetry/agents
     *
     * Returns per-agent token statistics for performance comparison.
     */
    router.get('/agents', (_req, res) => {
        const agentStats = getTokenStatsByAgent();
        if (!agentStats || Object.keys(agentStats).length === 0) {
            return res.status(404).json({ error: 'No agent data available' });
        }
        res.json(agentStats);
    });
    /**
     * GET /api/telemetry/stories
     *
     * Returns per-story token statistics for budget tracking.
     */
    router.get('/stories', (_req, res) => {
        const storyStats = getTokenStatsByStory();
        if (!storyStats || Object.keys(storyStats).length === 0) {
            return res.status(404).json({ error: 'No story data available' });
        }
        res.json(storyStats);
    });
    return router;
}
//# sourceMappingURL=telemetry.js.map