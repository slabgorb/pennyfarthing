/**
 * OTEL Exporter - Export enriched telemetry to external backends
 *
 * Story 19-8: Cyclist acts as a telemetry enrichment layer:
 * 1. Receives raw Claude Code OTEL
 * 2. Enriches with agent/story context
 * 3. Exports to configured backend
 *
 * Supported backends (via OTLP HTTP/JSON):
 * - Grafana Cloud
 * - Honeycomb
 * - Datadog
 * - Any OTLP endpoint
 *
 * Configuration via env vars (matching claude_telemetry pattern):
 * - CYCLIST_OTEL_EXPORT_ENDPOINT: OTLP endpoint URL
 * - CYCLIST_OTEL_EXPORT_HEADERS: Comma-separated key=value pairs
 */
// =============================================================================
// State
// =============================================================================
let exporterConfig = {};
let exporterEnabled = false;
// =============================================================================
// Configuration Functions
// =============================================================================
/**
 * Initialize the exporter from environment variables
 *
 * Reads:
 * - CYCLIST_OTEL_EXPORT_ENDPOINT: OTLP endpoint URL
 * - CYCLIST_OTEL_EXPORT_HEADERS: Comma-separated key=value pairs
 */
export function initExporter() {
    const endpoint = process.env.CYCLIST_OTEL_EXPORT_ENDPOINT;
    const headersStr = process.env.CYCLIST_OTEL_EXPORT_HEADERS;
    exporterConfig = {
        endpoint: endpoint || undefined,
        headers: parseHeaders(headersStr),
    };
    exporterEnabled = !!endpoint;
}
/**
 * Parse headers from comma-separated key=value string
 */
function parseHeaders(headersStr) {
    if (!headersStr || headersStr.trim() === '') {
        return undefined;
    }
    const headers = {};
    const pairs = headersStr.split(',');
    for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
            headers[key.trim()] = valueParts.join('=').trim();
        }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
}
/**
 * Check if exporter is enabled
 */
export function isExporterEnabled() {
    return exporterEnabled;
}
/**
 * Get current exporter configuration
 */
export function getExporterConfig() {
    return { ...exporterConfig };
}
/**
 * Reset exporter state (for testing)
 */
export function resetExporter() {
    exporterConfig = {};
    exporterEnabled = false;
}
// =============================================================================
// Conversion Functions - Spans to OTLP
// =============================================================================
/**
 * Convert attribute value to OTLP format
 */
function toOTLPAttributeValue(value) {
    if (typeof value === 'string') {
        return { stringValue: value };
    }
    else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return { intValue: String(value) };
        }
        return { doubleValue: value };
    }
    else if (typeof value === 'boolean') {
        return { boolValue: value };
    }
    return { stringValue: String(value) };
}
/**
 * Convert attributes object to OTLP attribute array
 */
function toOTLPAttributes(attrs) {
    const result = [];
    for (const [key, value] of Object.entries(attrs)) {
        if (value !== undefined) {
            result.push({
                key,
                value: toOTLPAttributeValue(value),
            });
        }
    }
    return result;
}
/**
 * Convert millisecond timestamp to nanosecond string
 */
function toNanoseconds(ms) {
    if (ms === undefined) {
        return '0';
    }
    return String(ms * 1_000_000);
}
/**
 * Convert string ID to hex format
 *
 * OTLP expects trace IDs as 32 hex chars and span IDs as 16 hex chars.
 * This converts any string to its hex representation.
 */
function toHexId(id) {
    // If already hex, return as-is
    if (/^[a-fA-F0-9]+$/.test(id)) {
        return id;
    }
    // Convert string to hex
    return Buffer.from(id).toString('hex');
}
/**
 * Convert span status to OTLP status code
 */
function toOTLPStatusCode(status) {
    switch (status) {
        case 'error':
            return 2; // Error
        case 'completed':
            return 1; // OK
        case 'running':
        default:
            return 0; // Unset
    }
}
/**
 * Convert PromptEvent to OTLP span event
 */
function toOTLPSpanEvent(event) {
    return {
        name: event.name,
        timeUnixNano: toNanoseconds(event.timestamp),
        attributes: toOTLPAttributes(event.attributes),
    };
}
/**
 * Convert ToolSpan to OTLP span
 */
function toolSpanToOTLP(toolSpan) {
    return {
        traceId: toHexId(toolSpan.traceId),
        spanId: toHexId(toolSpan.spanId),
        parentSpanId: toHexId(toolSpan.parentSpanId),
        name: toolSpan.name,
        startTimeUnixNano: toNanoseconds(toolSpan.startTime),
        endTimeUnixNano: toolSpan.endTime ? toNanoseconds(toolSpan.endTime) : undefined,
        attributes: toOTLPAttributes(toolSpan.attributes),
        events: [],
        status: {
            code: toolSpan.attributes['tool.success'] ? 1 : 2,
        },
    };
}
/**
 * Convert AgentSpan to OTLP span
 */
function agentSpanToOTLP(agentSpan) {
    return {
        traceId: toHexId(agentSpan.traceId),
        spanId: toHexId(agentSpan.spanId),
        parentSpanId: agentSpan.parentSpanId ? toHexId(agentSpan.parentSpanId) : undefined,
        name: agentSpan.name,
        startTimeUnixNano: toNanoseconds(agentSpan.startTime),
        endTimeUnixNano: agentSpan.endTime ? toNanoseconds(agentSpan.endTime) : undefined,
        attributes: toOTLPAttributes(agentSpan.attributes),
        events: agentSpan.events.map(toOTLPSpanEvent),
        status: {
            code: toOTLPStatusCode(agentSpan.status),
        },
    };
}
/**
 * Convert AgentSpan[] to OTLP traces payload
 */
export function convertSpansToOTLP(spans) {
    // Flatten all spans (agent spans + their child tool spans)
    const allOTLPSpans = [];
    for (const agentSpan of spans) {
        // Add the agent span itself
        allOTLPSpans.push(agentSpanToOTLP(agentSpan));
        // Add all child tool spans
        for (const toolSpan of agentSpan.childSpans) {
            allOTLPSpans.push(toolSpanToOTLP(toolSpan));
        }
    }
    return {
        resourceSpans: [
            {
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'cyclist' } },
                        { key: 'service.version', value: { stringValue: '4.0.0' } },
                    ],
                },
                scopeSpans: [
                    {
                        scope: {
                            name: 'cyclist.otel-exporter',
                            version: '1.0.0',
                        },
                        spans: allOTLPSpans,
                    },
                ],
            },
        ],
    };
}
// =============================================================================
// Conversion Functions - TokenStats to OTLP
// =============================================================================
/**
 * Convert TokenStats to OTLP metrics payload
 */
export function convertTokenStatsToOTLP(stats) {
    const timestamp = toNanoseconds(stats.lastUpdated || Date.now());
    const dataPoints = [
        {
            attributes: [{ key: 'type', value: { stringValue: 'input' } }],
            asInt: String(stats.inputTokens),
            timeUnixNano: timestamp,
        },
        {
            attributes: [{ key: 'type', value: { stringValue: 'output' } }],
            asInt: String(stats.outputTokens),
            timeUnixNano: timestamp,
        },
        {
            attributes: [{ key: 'type', value: { stringValue: 'cacheRead' } }],
            asInt: String(stats.cacheReadTokens),
            timeUnixNano: timestamp,
        },
        {
            attributes: [{ key: 'type', value: { stringValue: 'cacheCreation' } }],
            asInt: String(stats.cacheCreationTokens),
            timeUnixNano: timestamp,
        },
    ];
    return {
        resourceMetrics: [
            {
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'cyclist' } },
                        { key: 'service.version', value: { stringValue: '4.0.0' } },
                    ],
                },
                scopeMetrics: [
                    {
                        scope: {
                            name: 'cyclist.otel-exporter',
                            version: '1.0.0',
                        },
                        metrics: [
                            {
                                name: 'cyclist.token.usage',
                                description: 'Token usage by type',
                                unit: 'tokens',
                                sum: {
                                    dataPoints,
                                    aggregationTemporality: 2, // CUMULATIVE
                                    isMonotonic: true,
                                },
                            },
                            {
                                name: 'cyclist.cost.usd',
                                description: 'Total cost in USD',
                                unit: 'USD',
                                gauge: {
                                    dataPoints: [
                                        {
                                            attributes: [],
                                            asDouble: stats.totalCostUsd,
                                            timeUnixNano: timestamp,
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
// =============================================================================
// Export Functions
// =============================================================================
/**
 * Export spans to the configured OTLP endpoint
 */
export async function exportSpans(spans) {
    // If disabled, return success with 0 spans (not an error)
    if (!exporterEnabled) {
        return { success: true, spansExported: 0 };
    }
    // If no spans, skip the HTTP call
    if (spans.length === 0) {
        return { success: true, spansExported: 0 };
    }
    const endpoint = exporterConfig.endpoint;
    const url = endpoint.endsWith('/') ? `${endpoint}v1/traces` : `${endpoint}/v1/traces`;
    const payload = convertSpansToOTLP(spans);
    const totalSpans = payload.resourceSpans[0].scopeSpans[0].spans.length;
    const headers = {
        'Content-Type': 'application/json',
        ...exporterConfig.headers,
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorMsg = `HTTP ${response.status}: Export failed`;
            console.error(`[OTEL Export] ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
        return { success: true, spansExported: totalSpans };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[OTEL Export] Export failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}
/**
 * Export token stats to the configured OTLP endpoint
 */
export async function exportTokenStats(stats) {
    // If disabled, return success (not an error)
    if (!exporterEnabled) {
        return { success: true };
    }
    const endpoint = exporterConfig.endpoint;
    const url = endpoint.endsWith('/') ? `${endpoint}v1/metrics` : `${endpoint}/v1/metrics`;
    const payload = convertTokenStatsToOTLP(stats);
    const headers = {
        'Content-Type': 'application/json',
        ...exporterConfig.headers,
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorMsg = `HTTP ${response.status}: Export failed`;
            console.error(`[OTEL Export] ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
        return { success: true };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[OTEL Export] Export failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
}
//# sourceMappingURL=otel-exporter.js.map