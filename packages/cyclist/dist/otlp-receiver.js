/**
 * OTLP Receiver - Parses OpenTelemetry metrics from Claude Code
 *
 * Receives OTLP HTTP/JSON format metrics and extracts token usage data.
 */
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
}
//# sourceMappingURL=otlp-receiver.js.map