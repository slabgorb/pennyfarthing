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
// Background task store
let backgroundTasks = [];
// Callback for task completion notifications
let onBackgroundTaskComplete = null;
/**
 * Register callback for background task completion
 */
export function setBackgroundTaskCallback(callback) {
    onBackgroundTaskComplete = callback;
}
/**
 * Track a new background task
 */
export function trackBackgroundTask(task) {
    backgroundTasks.push({ ...task, status: 'pending' });
}
/**
 * Get all tracked background tasks
 */
export function getBackgroundTasks() {
    return [...backgroundTasks];
}
/**
 * Reset background task store
 */
export function resetBackgroundTasks() {
    backgroundTasks = [];
}
// 35-2: User info extracted from OTEL spans
let userEmail = null;
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
// Callback for when tool events are recorded (set by main.ts for IPC broadcast)
let onToolEventRecorded = null;
/**
 * Register callback for tool event recording
 * Called by main.ts to wire up IPC broadcast to renderer
 */
export function setToolEventCallback(callback) {
    onToolEventRecorded = callback;
}
// 35-2: Callback for when user email is discovered
let onUserEmailUpdate = null;
/**
 * Register callback for user email updates
 * Called by main.ts to wire up IPC broadcast
 */
export function setUserEmailCallback(callback) {
    onUserEmailUpdate = callback;
}
/**
 * Get the current user email (extracted from OTEL spans)
 */
export function getUserEmail() {
    return userEmail;
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
 * Record a tool event to session storage and notify listeners
 */
export function recordToolEvent(event) {
    toolEvents.push(event);
    // Broadcast to renderer if callback registered
    if (onToolEventRecorded) {
        onToolEventRecorded(event);
    }
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
    userEmail = null; // 35-2: Reset user email on session reset
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
 *
 * Actual Claude Code OTEL format (discovered via debug):
 * - tool_name (not tool.name)
 * - success as string "true"/"false" (not boolean)
 * - duration_ms (not tool.duration_ms)
 * - tool_parameters as JSON string (not tool.input)
 */
export function processLogEvents(rawEvents) {
    for (const event of rawEvents) {
        // 35-2: Extract user.email from any event that has it (only store once)
        if (!userEmail && event.attributes['user.email']) {
            userEmail = event.attributes['user.email'];
            if (onUserEmailUpdate) {
                onUserEmailUpdate(userEmail);
            }
        }
        if (event.name === 'claude_code.tool_result') {
            // Parse tool_parameters JSON to extract input
            let input;
            const toolParams = event.attributes['tool_parameters'];
            if (toolParams) {
                try {
                    const params = JSON.parse(toolParams);
                    // Use description if available, otherwise full_command or first param value
                    input = params.description || params.full_command || params.file_path || params.command || params.pattern || Object.values(params)[0];
                }
                catch {
                    input = toolParams; // Use raw string if not valid JSON
                }
            }
            // Parse duration_ms - could be string or number
            const rawDuration = event.attributes['duration_ms'];
            const durationMs = typeof rawDuration === 'string' ? parseInt(rawDuration, 10) : rawDuration;
            // Parse success - comes as string "true"/"false"
            const rawSuccess = event.attributes['success'];
            const success = rawSuccess === 'true' || rawSuccess === true;
            const toolName = event.attributes['tool_name'] || 'unknown';
            // 31-15: Track background Task spans
            if (toolName === 'Task' && toolParams) {
                try {
                    const params = JSON.parse(toolParams);
                    if (params.run_in_background === true) {
                        const taskId = event.attributes['task_id'];
                        if (taskId) {
                            trackBackgroundTask({
                                taskId,
                                description: params.description || '',
                                subagentType: params.subagent_type || '',
                                startedAt: event.timestamp,
                            });
                        }
                    }
                }
                catch { /* ignore parse errors */ }
            }
            // 31-15: Handle TaskOutput completion
            if (toolName === 'TaskOutput') {
                try {
                    const params = toolParams ? JSON.parse(toolParams) : {};
                    const taskId = params.task_id || event.attributes['task_id'];
                    const taskStatus = event.attributes['task_status'];
                    if (taskId && taskStatus === 'completed') {
                        const task = backgroundTasks.find(t => t.taskId === taskId);
                        if (task) {
                            task.status = 'completed';
                            task.success = success;
                            // Truncate output to avoid memory bloat
                            const rawOutput = event.attributes['tool_output'];
                            task.output = rawOutput?.substring(0, 2000);
                            if (onBackgroundTaskComplete) {
                                onBackgroundTaskComplete({ ...task });
                            }
                        }
                    }
                }
                catch { /* ignore parse errors */ }
            }
            const toolEvent = {
                toolName,
                input: input?.substring(0, 500),
                output: event.attributes['tool_output']?.substring(0, 2000),
                durationMs: isNaN(durationMs) ? undefined : durationMs,
                success,
                error: event.attributes['error'],
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