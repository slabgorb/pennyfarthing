/**
 * OTLP Receiver - Parses OpenTelemetry metrics and logs from Claude Code
 *
 * Receives OTLP HTTP/JSON format metrics and extracts token usage data.
 * Story 19-1: Extended to parse tool and prompt events from OTLP logs.
 * Story 19-4: Extended with per-agent token aggregation.
 * Story 19-5: Extended with per-story token aggregation.
 */
import { aggregateTokensForAgent, resetAgentTokenStats } from './agent-context.js';
import { aggregateTokensForStory, resetStoryTokenStats } from './story-context.js';
// Session event stores (in-memory)
let toolEvents = [];
let promptEvents = [];
// Session token state (in-memory)
let sessionTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: 0,
    lastUpdated: 0,
};
// Callback for when token stats are updated (set by main.ts for IPC broadcast)
let onTokenStatsUpdate = null;
/**
 * Register callback for token stats updates
 * Called by main.ts to wire up IPC broadcast
 */
export function setTokenStatsCallback(callback) {
    onTokenStatsUpdate = callback;
}
/**
 * Parse OTLP JSON payload and extract token usage metrics
 */
export function parseOTLPMetrics(body) {
    const result = {};
    try {
        const payload = body;
        if (!payload?.resourceMetrics) {
            return result;
        }
        for (const resourceMetric of payload.resourceMetrics) {
            if (!resourceMetric?.scopeMetrics)
                continue;
            for (const scopeMetric of resourceMetric.scopeMetrics) {
                if (!scopeMetric?.metrics)
                    continue;
                for (const metric of scopeMetric.metrics) {
                    // Only process claude_code.token.usage metrics
                    if (metric.name !== 'claude_code.token.usage')
                        continue;
                    if (!metric.sum?.dataPoints)
                        continue;
                    for (const dataPoint of metric.sum.dataPoints) {
                        const value = dataPoint.asInt ?? dataPoint.asDouble ?? 0;
                        // Find the type attribute
                        const typeAttr = dataPoint.attributes?.find((attr) => attr.key === 'type');
                        const tokenType = typeAttr?.value?.stringValue;
                        // Map token type to result field
                        switch (tokenType) {
                            case 'input':
                                result.inputTokens = (result.inputTokens ?? 0) + value;
                                break;
                            case 'output':
                                result.outputTokens = (result.outputTokens ?? 0) + value;
                                break;
                            case 'cacheRead':
                                result.cacheReadTokens = (result.cacheReadTokens ?? 0) + value;
                                break;
                            case 'cacheCreation':
                                result.cacheCreationTokens = (result.cacheCreationTokens ?? 0) + value;
                                break;
                        }
                    }
                }
            }
        }
    }
    catch {
        // Malformed payload - return empty result
    }
    return result;
}
/**
 * Aggregate parsed token stats into session totals
 */
export function aggregateTokenStats(parsed) {
    const hadUpdate = parsed.inputTokens !== undefined ||
        parsed.outputTokens !== undefined ||
        parsed.cacheReadTokens !== undefined ||
        parsed.cacheCreationTokens !== undefined;
    if (parsed.inputTokens !== undefined) {
        sessionTokens.inputTokens += parsed.inputTokens;
    }
    if (parsed.outputTokens !== undefined) {
        sessionTokens.outputTokens += parsed.outputTokens;
    }
    if (parsed.cacheReadTokens !== undefined) {
        sessionTokens.cacheReadTokens += parsed.cacheReadTokens;
    }
    if (parsed.cacheCreationTokens !== undefined) {
        sessionTokens.cacheCreationTokens += parsed.cacheCreationTokens;
    }
    if (hadUpdate) {
        sessionTokens.lastUpdated = Date.now();
        // Story 19-4: Track tokens by agent
        aggregateTokensForAgent(parsed);
        // Story 19-5: Track tokens by story
        aggregateTokensForStory(parsed);
        // Notify callback (triggers IPC broadcast in Electron)
        if (onTokenStatsUpdate) {
            onTokenStatsUpdate({ ...sessionTokens });
        }
    }
}
/**
 * Get current session token stats
 */
export function getTokenStats() {
    return { ...sessionTokens };
}
/**
 * Reset session token stats (for new session)
 */
export function resetTokenStats() {
    sessionTokens = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
        lastUpdated: 0,
    };
    // Story 19-4: Also reset per-agent stats
    resetAgentTokenStats();
    // Story 19-5: Also reset per-story stats
    resetStoryTokenStats();
}
/**
 * Parse OTLP logs payload and extract raw events
 */
export function parseOTLPLogs(body) {
    const events = [];
    try {
        const payload = body;
        if (!payload?.resourceLogs) {
            return events;
        }
        for (const resourceLog of payload.resourceLogs) {
            if (!resourceLog?.scopeLogs)
                continue;
            for (const scopeLog of resourceLog.scopeLogs) {
                if (!scopeLog?.logRecords)
                    continue;
                for (const logRecord of scopeLog.logRecords) {
                    const eventName = logRecord.body?.stringValue;
                    if (!eventName)
                        continue;
                    // Convert nanoseconds to milliseconds
                    const timestamp = logRecord.timeUnixNano
                        ? Math.floor(Number(logRecord.timeUnixNano) / 1_000_000)
                        : Date.now();
                    // Extract attributes into a flat object
                    const attributes = {};
                    if (logRecord.attributes) {
                        for (const attr of logRecord.attributes) {
                            if (attr.value.stringValue !== undefined) {
                                attributes[attr.key] = attr.value.stringValue;
                            }
                            else if (attr.value.intValue !== undefined) {
                                attributes[attr.key] = attr.value.intValue;
                            }
                            else if (attr.value.boolValue !== undefined) {
                                attributes[attr.key] = attr.value.boolValue;
                            }
                        }
                    }
                    events.push({
                        name: eventName,
                        timestamp,
                        traceId: logRecord.traceId,
                        spanId: logRecord.spanId,
                        attributes,
                    });
                }
            }
        }
    }
    catch {
        // Malformed payload - return empty array
    }
    return events;
}
/**
 * Record a tool event to session storage
 */
export function recordToolEvent(event) {
    toolEvents.push(event);
}
/**
 * Record a prompt event to session storage
 */
export function recordPromptEvent(event) {
    promptEvents.push(event);
}
/**
 * Get all stored tool events
 */
export function getToolEvents() {
    return [...toolEvents];
}
/**
 * Get all stored prompt events
 */
export function getPromptEvents() {
    return [...promptEvents];
}
/**
 * Reset event stores (for new session or testing)
 */
export function resetEventStore() {
    toolEvents = [];
    promptEvents = [];
}
// =============================================================================
// Audit Log Functions (Story 22-6)
// =============================================================================
/**
 * Get tool events filtered by tool type
 * @param toolType - Optional tool name to filter by (e.g., 'Bash', 'Read', 'Write')
 * @returns Filtered array of tool events
 */
export function getToolEventsFiltered(toolType) {
    if (!toolType)
        return getToolEvents();
    return toolEvents.filter(e => e.toolName === toolType);
}
/**
 * Get unique tool types from all recorded events
 * @returns Array of unique tool names
 */
export function getToolTypes() {
    const types = new Set(toolEvents.map(e => e.toolName));
    return Array.from(types).sort();
}
/**
 * Export audit log as JSON string
 * @param toolType - Optional filter by tool type
 * @returns JSON string of tool events
 */
export function exportAuditLogAsJSON(toolType) {
    const events = getToolEventsFiltered(toolType);
    return JSON.stringify(events, null, 2);
}
/**
 * Export audit log as CSV string
 * @param toolType - Optional filter by tool type
 * @returns CSV string of tool events
 */
export function exportAuditLogAsCSV(toolType) {
    const events = getToolEventsFiltered(toolType);
    // CSV header
    const header = 'timestamp,toolName,input,durationMs,success,error';
    // Escape CSV field (handle commas, quotes, newlines)
    const escapeCSV = (value) => {
        if (value === undefined || value === null)
            return '';
        const str = String(value);
        // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    // Format each event as CSV row
    const rows = events.map(e => {
        const timestamp = new Date(e.timestamp).toISOString();
        return [
            escapeCSV(timestamp),
            escapeCSV(e.toolName),
            escapeCSV(e.input?.substring(0, 200)), // Truncate long inputs
            escapeCSV(e.durationMs),
            escapeCSV(e.success),
            escapeCSV(e.error),
        ].join(',');
    });
    return [header, ...rows].join('\n');
}
/**
 * Get audit log statistics
 * @returns Summary statistics of tool events
 */
export function getAuditLogStats() {
    const byType = {};
    let successCount = 0;
    let errorCount = 0;
    for (const event of toolEvents) {
        byType[event.toolName] = (byType[event.toolName] || 0) + 1;
        if (event.success) {
            successCount++;
        }
        else {
            errorCount++;
        }
    }
    return {
        total: toolEvents.length,
        byType,
        successCount,
        errorCount,
    };
}
/**
 * Process raw log events and store them appropriately
 * Called by the /v1/logs endpoint
 */
export function processLogEvents(rawEvents) {
    for (const event of rawEvents) {
        if (event.name === 'claude_code.tool_result') {
            const toolEvent = {
                toolName: event.attributes['tool.name'] || 'unknown',
                input: event.attributes['tool.input'],
                output: event.attributes['tool.output'],
                durationMs: event.attributes['tool.duration_ms'],
                success: event.attributes['tool.success'] ?? true,
                error: event.attributes['tool.error'],
                timestamp: event.timestamp,
                traceId: event.traceId,
                spanId: event.spanId,
            };
            recordToolEvent(toolEvent);
        }
        else if (event.name === 'claude_code.user_prompt') {
            const promptEvent = {
                promptText: event.attributes['prompt.text'] || '',
                tokens: event.attributes['prompt.tokens'],
                timestamp: event.timestamp,
                traceId: event.traceId,
                spanId: event.spanId,
            };
            recordPromptEvent(promptEvent);
        }
        // Other event types (like claude_code.api_request) are ignored for now
    }
}
//# sourceMappingURL=otlp-receiver.js.map