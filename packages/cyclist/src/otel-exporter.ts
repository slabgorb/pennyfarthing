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
 * - PF_OTEL_EXPORT_ENDPOINT: OTLP endpoint URL
 * - PF_OTEL_EXPORT_HEADERS: Comma-separated key=value pairs
 */

import type { AgentSpan, ToolSpan, PromptEvent } from './telemetry-types.js';
import type { TokenStats } from './otlp-receiver.js';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// OTLP Format Types (JSON encoding)
// =============================================================================

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
  code: number; // 0 = Unset, 1 = OK, 2 = Error
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

// =============================================================================
// State
// =============================================================================

let exporterConfig: ExporterConfig = {};
let exporterEnabled = false;

// =============================================================================
// Configuration Functions
// =============================================================================

/**
 * Initialize the exporter from environment variables
 *
 * Reads:
 * - PF_OTEL_EXPORT_ENDPOINT: OTLP endpoint URL
 * - PF_OTEL_EXPORT_HEADERS: Comma-separated key=value pairs
 */
export function initExporter(): void {
  const endpoint = process.env.PF_OTEL_EXPORT_ENDPOINT;
  const headersStr = process.env.PF_OTEL_EXPORT_HEADERS;

  exporterConfig = {
    endpoint: endpoint || undefined,
    headers: parseHeaders(headersStr),
  };

  exporterEnabled = !!endpoint;
}

/**
 * Parse headers from comma-separated key=value string
 */
function parseHeaders(headersStr: string | undefined): Record<string, string> | undefined {
  if (!headersStr || headersStr.trim() === '') {
    return undefined;
  }

  const headers: Record<string, string> = {};
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
export function isExporterEnabled(): boolean {
  return exporterEnabled;
}

/**
 * Get current exporter configuration
 */
export function getExporterConfig(): ExporterConfig {
  return { ...exporterConfig };
}

/**
 * Reset exporter state (for testing)
 */
export function resetExporter(): void {
  exporterConfig = {};
  exporterEnabled = false;
}

// =============================================================================
// Conversion Functions - Spans to OTLP
// =============================================================================

/**
 * Convert attribute value to OTLP format
 */
function toOTLPAttributeValue(value: string | number | boolean): OTLPAttributeValue {
  if (typeof value === 'string') {
    return { stringValue: value };
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { intValue: String(value) };
    }
    return { doubleValue: value };
  } else if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  return { stringValue: String(value) };
}

/**
 * Convert attributes object to OTLP attribute array
 */
function toOTLPAttributes(attrs: Record<string, string | number | boolean | undefined>): OTLPAttribute[] {
  const result: OTLPAttribute[] = [];

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
function toNanoseconds(ms: number | undefined): string {
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
function toHexId(id: string): string {
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
function toOTLPStatusCode(status: 'running' | 'completed' | 'error'): number {
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
function toOTLPSpanEvent(event: PromptEvent): OTLPSpanEvent {
  return {
    name: event.name,
    timeUnixNano: toNanoseconds(event.timestamp),
    attributes: toOTLPAttributes(event.attributes),
  };
}

/**
 * Convert ToolSpan to OTLP span
 */
function toolSpanToOTLP(toolSpan: ToolSpan): OTLPSpan {
  return {
    traceId: toHexId(toolSpan.traceId),
    spanId: toHexId(toolSpan.spanId),
    parentSpanId: toHexId(toolSpan.parentSpanId),
    name: toolSpan.name,
    startTimeUnixNano: toNanoseconds(toolSpan.startTime),
    endTimeUnixNano: toolSpan.endTime ? toNanoseconds(toolSpan.endTime) : undefined,
    attributes: toOTLPAttributes(toolSpan.attributes as unknown as Record<string, string | number | boolean>),
    events: [],
    status: {
      code: toolSpan.attributes['tool.success'] ? 1 : 2,
    },
  };
}

/**
 * Convert AgentSpan to OTLP span
 */
function agentSpanToOTLP(agentSpan: AgentSpan): OTLPSpan {
  return {
    traceId: toHexId(agentSpan.traceId),
    spanId: toHexId(agentSpan.spanId),
    parentSpanId: agentSpan.parentSpanId ? toHexId(agentSpan.parentSpanId) : undefined,
    name: agentSpan.name,
    startTimeUnixNano: toNanoseconds(agentSpan.startTime),
    endTimeUnixNano: agentSpan.endTime ? toNanoseconds(agentSpan.endTime) : undefined,
    attributes: toOTLPAttributes(agentSpan.attributes as unknown as Record<string, string | number | boolean>),
    events: agentSpan.events.map(toOTLPSpanEvent),
    status: {
      code: toOTLPStatusCode(agentSpan.status),
    },
  };
}

/**
 * Convert AgentSpan[] to OTLP traces payload
 */
export function convertSpansToOTLP(spans: AgentSpan[]): OTLPTracesPayload {
  // Flatten all spans (agent spans + their child tool spans)
  const allOTLPSpans: OTLPSpan[] = [];

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
export function convertTokenStatsToOTLP(stats: TokenStats): OTLPMetricsPayload {
  const timestamp = toNanoseconds(stats.lastUpdated || Date.now());

  const dataPoints: OTLPDataPoint[] = [
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
export async function exportSpans(spans: AgentSpan[]): Promise<ExportResult> {
  // If disabled, return success with 0 spans (not an error)
  if (!exporterEnabled) {
    return { success: true, spansExported: 0 };
  }

  // If no spans, skip the HTTP call
  if (spans.length === 0) {
    return { success: true, spansExported: 0 };
  }

  const endpoint = exporterConfig.endpoint!;
  const url = endpoint.endsWith('/') ? `${endpoint}v1/traces` : `${endpoint}/v1/traces`;

  const payload = convertSpansToOTLP(spans);
  const totalSpans = payload.resourceSpans[0].scopeSpans[0].spans.length;

  const headers: Record<string, string> = {
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[OTEL Export] Export failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Export token stats to the configured OTLP endpoint
 */
export async function exportTokenStats(stats: TokenStats): Promise<ExportResult> {
  // If disabled, return success (not an error)
  if (!exporterEnabled) {
    return { success: true };
  }

  const endpoint = exporterConfig.endpoint!;
  const url = endpoint.endsWith('/') ? `${endpoint}v1/metrics` : `${endpoint}/v1/metrics`;

  const payload = convertTokenStatsToOTLP(stats);

  const headers: Record<string, string> = {
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[OTEL Export] Export failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
