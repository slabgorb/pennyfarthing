/**
 * OTLP Receiver - Parses OpenTelemetry metrics from Claude Code
 *
 * Receives OTLP HTTP/JSON format metrics and extracts token usage data.
 */
export interface TokenStats {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalCostUsd: number;
    lastUpdated: number;
}
export type PartialTokenStats = Partial<Omit<TokenStats, 'lastUpdated' | 'totalCostUsd'>>;
/**
 * Register callback for token stats updates
 * Called by main.ts to wire up IPC broadcast
 */
export declare function setTokenStatsCallback(callback: (stats: TokenStats) => void): void;
/**
 * Parse OTLP JSON payload and extract token usage metrics
 */
export declare function parseOTLPMetrics(body: unknown): PartialTokenStats;
/**
 * Aggregate parsed token stats into session totals
 */
export declare function aggregateTokenStats(parsed: PartialTokenStats): void;
/**
 * Get current session token stats
 */
export declare function getTokenStats(): TokenStats;
/**
 * Reset session token stats (for new session)
 */
export declare function resetTokenStats(): void;
//# sourceMappingURL=otlp-receiver.d.ts.map