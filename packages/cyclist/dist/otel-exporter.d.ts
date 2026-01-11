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
import type { AgentSpan } from './telemetry-types.js';
import type { TokenStats } from './otlp-receiver.js';
/**
 * Result of an export operation
 */
export interface ExportResult {
    /** Whether the export succeeded */
    success: boolean;
    /** Number of spans exported (for traces) */
    spansExported?: number;
    /** Error message if export failed */
    error?: string;
}
/**
 * Exporter configuration
 */
export interface ExporterConfig {
    /** OTLP endpoint URL */
    endpoint?: string;
    /** Auth and custom headers */
    headers?: Record<string, string>;
}
/**
 * OTLP attribute value (one-of pattern)
 */
interface OTLPAttributeValue {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
}
/**
 * OTLP attribute (key-value pair)
 */
interface OTLPAttribute {
    key: string;
    value: OTLPAttributeValue;
}
/**
 * OTLP span event
 */
interface OTLPSpanEvent {
    name: string;
    timeUnixNano: string;
    attributes: OTLPAttribute[];
}
/**
 * OTLP span status
 */
interface OTLPSpanStatus {
    code: number;
    message?: string;
}
/**
 * OTLP span
 */
interface OTLPSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTimeUnixNano: string;
    endTimeUnixNano?: string;
    attributes: OTLPAttribute[];
    events: OTLPSpanEvent[];
    status: OTLPSpanStatus;
}
/**
 * OTLP scope spans (instrumentation scope)
 */
interface OTLPScopeSpans {
    scope?: {
        name: string;
        version?: string;
    };
    spans: OTLPSpan[];
}
/**
 * OTLP resource
 */
interface OTLPResource {
    attributes: OTLPAttribute[];
}
/**
 * OTLP resource spans (top-level traces structure)
 */
interface OTLPResourceSpans {
    resource: OTLPResource;
    scopeSpans: OTLPScopeSpans[];
}
/**
 * OTLP traces payload
 */
export interface OTLPTracesPayload {
    resourceSpans: OTLPResourceSpans[];
}
/**
 * OTLP metric data point
 */
interface OTLPDataPoint {
    attributes: OTLPAttribute[];
    asInt?: string;
    asDouble?: number;
    timeUnixNano: string;
}
/**
 * OTLP sum metric
 */
interface OTLPSum {
    dataPoints: OTLPDataPoint[];
    aggregationTemporality: number;
    isMonotonic: boolean;
}
/**
 * OTLP gauge metric
 */
interface OTLPGauge {
    dataPoints: OTLPDataPoint[];
}
/**
 * OTLP metric
 */
interface OTLPMetric {
    name: string;
    description?: string;
    unit?: string;
    sum?: OTLPSum;
    gauge?: OTLPGauge;
}
/**
 * OTLP scope metrics
 */
interface OTLPScopeMetrics {
    scope?: {
        name: string;
        version?: string;
    };
    metrics: OTLPMetric[];
}
/**
 * OTLP resource metrics
 */
interface OTLPResourceMetrics {
    resource: OTLPResource;
    scopeMetrics: OTLPScopeMetrics[];
}
/**
 * OTLP metrics payload
 */
export interface OTLPMetricsPayload {
    resourceMetrics: OTLPResourceMetrics[];
}
/**
 * Initialize the exporter from environment variables
 *
 * Reads:
 * - CYCLIST_OTEL_EXPORT_ENDPOINT: OTLP endpoint URL
 * - CYCLIST_OTEL_EXPORT_HEADERS: Comma-separated key=value pairs
 */
export declare function initExporter(): void;
/**
 * Check if exporter is enabled
 */
export declare function isExporterEnabled(): boolean;
/**
 * Get current exporter configuration
 */
export declare function getExporterConfig(): ExporterConfig;
/**
 * Reset exporter state (for testing)
 */
export declare function resetExporter(): void;
/**
 * Convert AgentSpan[] to OTLP traces payload
 */
export declare function convertSpansToOTLP(spans: AgentSpan[]): OTLPTracesPayload;
/**
 * Convert TokenStats to OTLP metrics payload
 */
export declare function convertTokenStatsToOTLP(stats: TokenStats): OTLPMetricsPayload;
/**
 * Export spans to the configured OTLP endpoint
 */
export declare function exportSpans(spans: AgentSpan[]): Promise<ExportResult>;
/**
 * Export token stats to the configured OTLP endpoint
 */
export declare function exportTokenStats(stats: TokenStats): Promise<ExportResult>;
export {};
//# sourceMappingURL=otel-exporter.d.ts.map