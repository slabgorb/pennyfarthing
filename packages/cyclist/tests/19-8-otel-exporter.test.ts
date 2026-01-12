/**
 * Story 19-8: OTEL Export to External Backends Tests
 *
 * Tests for exporting enriched telemetry to external OTEL backends.
 * Cyclist acts as a telemetry enrichment layer: receives raw OTEL from
 * Claude Code, enriches with agent/story context, exports to configured backend.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the otel-exporter.ts module.
 *
 * Acceptance Criteria:
 * 1. CYCLIST_OTEL_EXPORT_ENDPOINT configurable
 * 2. Enriched spans exported to external backend
 * 3. Works with Grafana Cloud (tested - manual)
 * 4. Graceful fallback if export fails
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Types from telemetry-types.ts (already implemented in 19-2)
import type { AgentSpan, ToolSpan, PromptEvent, TokenUsage } from '../src/telemetry-types.js';

// Types from otlp-receiver.ts
import type { TokenStats } from '../src/otlp-receiver.js';

// Functions that don't exist yet - imports will fail until Dev implements
// otel-exporter.ts
import {
  initExporter,
  exportSpans,
  exportTokenStats,
  isExporterEnabled,
  getExporterConfig,
  resetExporter,
  convertSpansToOTLP,
  convertTokenStatsToOTLP,
} from '../src/otel-exporter.js';

// =============================================================================
// Test Fixtures - Sample spans and token stats for export
// =============================================================================

/**
 * Sample AgentSpan with enriched Pennyfarthing context
 */
const sampleAgentSpan: AgentSpan = {
  traceId: 'trace-export-123',
  spanId: 'agent-span-001',
  name: 'claude.agent.run',
  startTime: 1704844800000, // 2024-01-10T00:00:00Z
  endTime: 1704844860000,   // 60 seconds later
  attributes: {
    'gen_ai.system': 'claude',
    'gen_ai.request.model': 'claude-sonnet-4-20250514',
    'gen_ai.usage.input_tokens': 1500,
    'gen_ai.usage.output_tokens': 500,
    'pennyfarthing.agent': 'dev',
    'pennyfarthing.story_id': '19-8',
    'pennyfarthing.theme': 'alice-in-wonderland',
  },
  events: [
    {
      name: 'user.prompt',
      timestamp: 1704844800000,
      attributes: {
        'prompt.text': 'Implement the OTEL exporter',
        'prompt.tokens': 25,
      },
    },
  ],
  childSpans: [
    {
      traceId: 'trace-export-123',
      spanId: 'tool-span-001',
      parentSpanId: 'agent-span-001',
      name: 'tool.Read',
      startTime: 1704844810000,
      endTime: 1704844811000,
      attributes: {
        'tool.name': 'Read',
        'tool.input': '/path/to/file.ts',
        'tool.success': true,
        'tool.duration_ms': 1000,
      },
    },
  ],
  status: 'completed',
};

/**
 * Sample AgentSpan with error status
 */
const errorAgentSpan: AgentSpan = {
  traceId: 'trace-error-456',
  spanId: 'agent-span-error',
  name: 'claude.agent.run',
  startTime: 1704844900000,
  endTime: 1704844905000,
  attributes: {
    'gen_ai.system': 'claude',
    'gen_ai.request.model': 'claude-sonnet-4-20250514',
    'pennyfarthing.agent': 'tea',
    'pennyfarthing.story_id': '19-8',
  },
  events: [],
  childSpans: [
    {
      traceId: 'trace-error-456',
      spanId: 'tool-span-error',
      parentSpanId: 'agent-span-error',
      name: 'tool.Bash',
      startTime: 1704844901000,
      endTime: 1704844902000,
      attributes: {
        'tool.name': 'Bash',
        'tool.input': 'npm test',
        'tool.success': false,
        'tool.error': 'Tests failed',
        'tool.duration_ms': 1000,
      },
    },
  ],
  status: 'error',
};

/**
 * Multiple spans for batch export testing
 */
const multipleSpans: AgentSpan[] = [
  sampleAgentSpan,
  {
    ...sampleAgentSpan,
    traceId: 'trace-export-789',
    spanId: 'agent-span-002',
    startTime: 1704844870000,
    endTime: 1704844930000,
    attributes: {
      ...sampleAgentSpan.attributes,
      'pennyfarthing.agent': 'reviewer',
    },
    childSpans: [],
    events: [],
  },
];

/**
 * Sample token stats for metrics export
 */
const sampleTokenStats: TokenStats = {
  inputTokens: 10000,
  outputTokens: 3500,
  cacheReadTokens: 5000,
  cacheCreationTokens: 500,
  totalCostUsd: 0.42,
  lastUpdated: 1704844800000,
};

// =============================================================================
// Mock fetch for HTTP testing
// =============================================================================

let fetchMock: Mock;

function setupFetchMock(status = 200, response = {}) {
  fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
  vi.stubGlobal('fetch', fetchMock);
}

function setupFetchError(errorMessage: string) {
  fetchMock = vi.fn().mockRejectedValue(new Error(errorMessage));
  vi.stubGlobal('fetch', fetchMock);
}

// =============================================================================
// AC1: CYCLIST_OTEL_EXPORT_ENDPOINT configurable
// =============================================================================

describe('Story 19-8: OTEL Export to External Backends', () => {

  describe('AC1: CYCLIST_OTEL_EXPORT_ENDPOINT configurable', () => {

    beforeEach(() => {
      resetExporter();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('should read endpoint from CYCLIST_OTEL_EXPORT_ENDPOINT env var', () => {
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.grafana.net/otlp');

      initExporter();
      const config = getExporterConfig();

      expect(config.endpoint).toBe('https://otlp.grafana.net/otlp');
    });

    it('should read auth headers from CYCLIST_OTEL_EXPORT_HEADERS env var', () => {
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');
      vi.stubEnv('CYCLIST_OTEL_EXPORT_HEADERS', 'authorization=Bearer token123,x-custom=value');

      initExporter();
      const config = getExporterConfig();

      expect(config.headers).toBeDefined();
      expect(config.headers!['authorization']).toBe('Bearer token123');
      expect(config.headers!['x-custom']).toBe('value');
    });

    it('should be disabled when endpoint env var is not set', () => {
      // No env vars set
      initExporter();

      expect(isExporterEnabled()).toBe(false);
    });

    it('should be enabled when endpoint env var is set', () => {
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');

      initExporter();

      expect(isExporterEnabled()).toBe(true);
    });

    it('should handle endpoint with trailing slash', () => {
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com/');

      initExporter();
      const config = getExporterConfig();

      // Should normalize: either strip trailing slash or handle it
      expect(config.endpoint).toMatch(/^https:\/\/otlp\.example\.com\/?$/);
    });

    it('should handle empty headers gracefully', () => {
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');
      vi.stubEnv('CYCLIST_OTEL_EXPORT_HEADERS', '');

      initExporter();
      const config = getExporterConfig();

      // Empty headers should result in undefined or empty object
      expect(config.headers === undefined || Object.keys(config.headers).length === 0).toBe(true);
    });

    it('should reset configuration via resetExporter()', () => {
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');
      initExporter();
      expect(isExporterEnabled()).toBe(true);

      resetExporter();
      expect(isExporterEnabled()).toBe(false);
    });

  });

  // =============================================================================
  // AC2: Enriched spans exported to external backend
  // =============================================================================

  describe('AC2: Enriched spans exported to external backend', () => {

    beforeEach(() => {
      resetExporter();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');
      vi.stubEnv('CYCLIST_OTEL_EXPORT_HEADERS', 'authorization=Bearer test-token');
      setupFetchMock(200);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('should convert AgentSpan[] to OTLP traces format', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      expect(otlpPayload).toBeDefined();
      expect(otlpPayload.resourceSpans).toBeDefined();
      expect(Array.isArray(otlpPayload.resourceSpans)).toBe(true);
      expect(otlpPayload.resourceSpans.length).toBeGreaterThan(0);
    });

    it('should include resource attributes in OTLP format', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      const resourceSpan = otlpPayload.resourceSpans[0];
      expect(resourceSpan.resource).toBeDefined();
      expect(resourceSpan.resource.attributes).toBeDefined();

      // Should include service name
      const serviceAttr = resourceSpan.resource.attributes.find(
        (attr: any) => attr.key === 'service.name'
      );
      expect(serviceAttr).toBeDefined();
    });

    it('should include scope spans in OTLP format', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      const resourceSpan = otlpPayload.resourceSpans[0];
      expect(resourceSpan.scopeSpans).toBeDefined();
      expect(Array.isArray(resourceSpan.scopeSpans)).toBe(true);
      expect(resourceSpan.scopeSpans.length).toBeGreaterThan(0);
    });

    it('should convert span attributes to OTLP attribute format', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.attributes).toBeDefined();

      // Find pennyfarthing.agent attribute
      const agentAttr = span.attributes.find(
        (attr: any) => attr.key === 'pennyfarthing.agent'
      );
      expect(agentAttr).toBeDefined();
      expect(agentAttr.value.stringValue).toBe('dev');
    });

    it('should include child spans in OTLP format', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      // Parent and child should both be in the spans array
      const allSpans = otlpPayload.resourceSpans[0].scopeSpans[0].spans;
      expect(allSpans.length).toBe(2); // Agent span + 1 tool span

      // Find the tool span
      const toolSpan = allSpans.find((s: any) => s.name === 'tool.Read');
      expect(toolSpan).toBeDefined();
      expect(toolSpan.parentSpanId).toBeDefined();
    });

    it('should include span events in OTLP format', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.events).toBeDefined();
      expect(span.events.length).toBe(1);
      expect(span.events[0].name).toBe('user.prompt');
    });

    it('should convert timestamps to nanoseconds', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];
      // startTime in ms * 1_000_000 = nanoseconds
      expect(span.startTimeUnixNano).toBe(String(sampleAgentSpan.startTime * 1_000_000));
      expect(span.endTimeUnixNano).toBe(String(sampleAgentSpan.endTime! * 1_000_000));
    });

    it('should POST spans to /v1/traces endpoint', async () => {
      initExporter();
      await exportSpans([sampleAgentSpan]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/v1/traces');
    });

    it('should include auth headers in request', async () => {
      initExporter();
      await exportSpans([sampleAgentSpan]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['authorization']).toBe('Bearer test-token');
    });

    it('should include Content-Type header as application/json', async () => {
      initExporter();
      await exportSpans([sampleAgentSpan]);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should send OTLP JSON payload in request body', async () => {
      initExporter();
      await exportSpans([sampleAgentSpan]);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.resourceSpans).toBeDefined();
    });

    it('should handle multiple spans in single export', async () => {
      initExporter();
      await exportSpans(multipleSpans);

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);

      // All spans should be in the payload
      const allSpans = body.resourceSpans[0].scopeSpans[0].spans;
      expect(allSpans.length).toBeGreaterThanOrEqual(2);
    });

    it('should return success result when export succeeds', async () => {
      initExporter();
      const result = await exportSpans([sampleAgentSpan]);

      expect(result.success).toBe(true);
      expect(result.spansExported).toBe(2); // Agent span + tool span
    });

    it('should not call fetch when exporter is disabled', async () => {
      // Reset without env vars
      resetExporter();
      vi.unstubAllEnvs();
      initExporter();

      await exportSpans([sampleAgentSpan]);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should return empty result when spans array is empty', async () => {
      initExporter();
      const result = await exportSpans([]);

      expect(result.spansExported).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

  });

  // =============================================================================
  // AC3: Token stats export (metrics endpoint)
  // =============================================================================

  describe('Token stats export (metrics endpoint)', () => {

    beforeEach(() => {
      resetExporter();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');
      vi.stubEnv('CYCLIST_OTEL_EXPORT_HEADERS', 'authorization=Bearer test-token');
      setupFetchMock(200);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('should convert TokenStats to OTLP metrics format', () => {
      const otlpPayload = convertTokenStatsToOTLP(sampleTokenStats);

      expect(otlpPayload).toBeDefined();
      expect(otlpPayload.resourceMetrics).toBeDefined();
      expect(Array.isArray(otlpPayload.resourceMetrics)).toBe(true);
    });

    it('should include token usage metrics in OTLP format', () => {
      const otlpPayload = convertTokenStatsToOTLP(sampleTokenStats);

      const scopeMetrics = otlpPayload.resourceMetrics[0].scopeMetrics[0];
      expect(scopeMetrics.metrics).toBeDefined();

      // Should have token usage metric
      const tokenMetric = scopeMetrics.metrics.find(
        (m: any) => m.name === 'cyclist.token.usage'
      );
      expect(tokenMetric).toBeDefined();
    });

    it('should include all token types as data points', () => {
      const otlpPayload = convertTokenStatsToOTLP(sampleTokenStats);

      const tokenMetric = otlpPayload.resourceMetrics[0].scopeMetrics[0].metrics.find(
        (m: any) => m.name === 'cyclist.token.usage'
      );

      const dataPoints = tokenMetric.sum?.dataPoints || tokenMetric.gauge?.dataPoints;
      expect(dataPoints).toBeDefined();

      // Should have data points for each token type
      const types = dataPoints.map((dp: any) =>
        dp.attributes.find((a: any) => a.key === 'type')?.value?.stringValue
      );
      expect(types).toContain('input');
      expect(types).toContain('output');
      expect(types).toContain('cacheRead');
      expect(types).toContain('cacheCreation');
    });

    it('should POST token stats to /v1/metrics endpoint', async () => {
      initExporter();
      await exportTokenStats(sampleTokenStats);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/v1/metrics');
    });

    it('should include auth headers in metrics request', async () => {
      initExporter();
      await exportTokenStats(sampleTokenStats);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['authorization']).toBe('Bearer test-token');
    });

    it('should return success result for token stats export', async () => {
      initExporter();
      const result = await exportTokenStats(sampleTokenStats);

      expect(result.success).toBe(true);
    });

  });

  // =============================================================================
  // AC4: Graceful fallback if export fails
  // =============================================================================

  describe('AC4: Graceful fallback if export fails', () => {

    beforeEach(() => {
      resetExporter();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.stubEnv('CYCLIST_OTEL_EXPORT_ENDPOINT', 'https://otlp.example.com');
      vi.stubEnv('CYCLIST_OTEL_EXPORT_HEADERS', 'authorization=Bearer test-token');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('should not throw when HTTP request fails', async () => {
      setupFetchError('Network error');
      initExporter();

      // Should not throw - graceful handling
      await expect(exportSpans([sampleAgentSpan])).resolves.not.toThrow();
    });

    it('should return error result when HTTP request fails', async () => {
      setupFetchError('Network error');
      initExporter();

      const result = await exportSpans([sampleAgentSpan]);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });

    it('should return error result when HTTP status is not 2xx', async () => {
      setupFetchMock(503, { error: 'Service unavailable' });
      initExporter();

      const result = await exportSpans([sampleAgentSpan]);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error result for 401 Unauthorized', async () => {
      setupFetchMock(401, { error: 'Unauthorized' });
      initExporter();

      const result = await exportSpans([sampleAgentSpan]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('should return error result for 429 Rate Limited', async () => {
      setupFetchMock(429, { error: 'Rate limited' });
      initExporter();

      const result = await exportSpans([sampleAgentSpan]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('429');
    });

    it('should log export failures for debugging', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setupFetchError('Connection refused');
      initExporter();

      await exportSpans([sampleAgentSpan]);

      // Should have logged the error
      expect(consoleSpy).toHaveBeenCalled();
      const logMessage = consoleSpy.mock.calls.flat().join(' ');
      expect(logMessage).toMatch(/export|error|failed/i);

      consoleSpy.mockRestore();
    });

    it('should handle timeout gracefully', async () => {
      fetchMock = vi.fn().mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );
      vi.stubGlobal('fetch', fetchMock);
      initExporter();

      const result = await exportSpans([sampleAgentSpan]);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed response gracefully', async () => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
        text: () => Promise.resolve('not json'),
      });
      vi.stubGlobal('fetch', fetchMock);
      initExporter();

      // Should not throw even with malformed response
      await expect(exportSpans([sampleAgentSpan])).resolves.not.toThrow();
    });

    it('should gracefully handle token stats export failure', async () => {
      setupFetchError('Connection refused');
      initExporter();

      const result = await exportTokenStats(sampleTokenStats);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should skip export and return success when disabled', async () => {
      // No env vars = disabled
      resetExporter();
      vi.unstubAllEnvs();
      initExporter();

      const result = await exportSpans([sampleAgentSpan]);

      // Not an error - just skipped because disabled
      expect(result.success).toBe(true);
      expect(result.spansExported).toBe(0);
    });

  });

  // =============================================================================
  // OTLP Format Compliance
  // =============================================================================

  describe('OTLP Format Compliance', () => {

    beforeEach(() => {
      resetExporter();
    });

    it('should produce valid OTLP trace JSON structure', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);

      // Top-level structure
      expect(otlpPayload).toHaveProperty('resourceSpans');
      expect(Array.isArray(otlpPayload.resourceSpans)).toBe(true);

      // ResourceSpan structure
      const resourceSpan = otlpPayload.resourceSpans[0];
      expect(resourceSpan).toHaveProperty('resource');
      expect(resourceSpan).toHaveProperty('scopeSpans');

      // Resource structure
      expect(resourceSpan.resource).toHaveProperty('attributes');
      expect(Array.isArray(resourceSpan.resource.attributes)).toBe(true);

      // ScopeSpans structure
      expect(Array.isArray(resourceSpan.scopeSpans)).toBe(true);
      const scopeSpan = resourceSpan.scopeSpans[0];
      expect(scopeSpan).toHaveProperty('spans');
      expect(Array.isArray(scopeSpan.spans)).toBe(true);
    });

    it('should produce valid OTLP span structure', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

      // Required span fields per OTLP spec
      expect(span).toHaveProperty('traceId');
      expect(span).toHaveProperty('spanId');
      expect(span).toHaveProperty('name');
      expect(span).toHaveProperty('startTimeUnixNano');
      expect(span).toHaveProperty('endTimeUnixNano');
      expect(span).toHaveProperty('attributes');

      // Trace and span IDs should be hex strings
      expect(typeof span.traceId).toBe('string');
      expect(typeof span.spanId).toBe('string');
    });

    it('should produce valid OTLP attribute structure', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];
      const attr = span.attributes[0];

      // OTLP attribute format: { key: string, value: { stringValue|intValue|... } }
      expect(attr).toHaveProperty('key');
      expect(attr).toHaveProperty('value');
      expect(typeof attr.key).toBe('string');
      expect(typeof attr.value).toBe('object');
    });

    it('should produce valid OTLP metrics JSON structure', () => {
      const otlpPayload = convertTokenStatsToOTLP(sampleTokenStats);

      // Top-level structure
      expect(otlpPayload).toHaveProperty('resourceMetrics');
      expect(Array.isArray(otlpPayload.resourceMetrics)).toBe(true);

      // ResourceMetrics structure
      const resourceMetric = otlpPayload.resourceMetrics[0];
      expect(resourceMetric).toHaveProperty('resource');
      expect(resourceMetric).toHaveProperty('scopeMetrics');

      // ScopeMetrics structure
      expect(Array.isArray(resourceMetric.scopeMetrics)).toBe(true);
      const scopeMetric = resourceMetric.scopeMetrics[0];
      expect(scopeMetric).toHaveProperty('metrics');
      expect(Array.isArray(scopeMetric.metrics)).toBe(true);
    });

    it('should include span status in OTLP format', () => {
      const otlpPayload = convertSpansToOTLP([errorAgentSpan]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

      // OTLP status format
      expect(span).toHaveProperty('status');
      expect(span.status).toHaveProperty('code');
      // Error status code is 2 in OTLP
      expect(span.status.code).toBe(2);
    });

    it('should handle completed status correctly', () => {
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(span.status).toHaveProperty('code');
      // OK status code is 1 in OTLP, Unset is 0
      expect([0, 1]).toContain(span.status.code);
    });

    it('should encode hex trace and span IDs correctly', () => {
      // OTLP requires trace_id to be 32 hex chars, span_id to be 16 hex chars
      const otlpPayload = convertSpansToOTLP([sampleAgentSpan]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

      // IDs should be valid hex or base64 encoded strings
      expect(span.traceId).toMatch(/^[a-fA-F0-9]+$|^[A-Za-z0-9+/]+=*$/);
      expect(span.spanId).toMatch(/^[a-fA-F0-9]+$|^[A-Za-z0-9+/]+=*$/);
    });

  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    beforeEach(() => {
      resetExporter();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('should handle span with no child spans', () => {
      const spanWithoutChildren: AgentSpan = {
        ...sampleAgentSpan,
        childSpans: [],
      };

      const otlpPayload = convertSpansToOTLP([spanWithoutChildren]);
      const spans = otlpPayload.resourceSpans[0].scopeSpans[0].spans;

      expect(spans.length).toBe(1); // Just the agent span
    });

    it('should handle span with no events', () => {
      const spanWithoutEvents: AgentSpan = {
        ...sampleAgentSpan,
        events: [],
      };

      const otlpPayload = convertSpansToOTLP([spanWithoutEvents]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(span.events).toEqual([]);
    });

    it('should handle span without endTime (running)', () => {
      const runningSpan: AgentSpan = {
        ...sampleAgentSpan,
        endTime: undefined,
        status: 'running',
      };

      const otlpPayload = convertSpansToOTLP([runningSpan]);
      const span = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0];

      // endTimeUnixNano should be undefined or 0 for running spans
      expect(span.endTimeUnixNano === undefined || span.endTimeUnixNano === '0').toBe(true);
    });

    it('should handle optional Pennyfarthing attributes', () => {
      const minimalSpan: AgentSpan = {
        traceId: 'trace-minimal',
        spanId: 'span-minimal',
        name: 'claude.agent.run',
        startTime: Date.now(),
        attributes: {
          'gen_ai.system': 'claude',
          'gen_ai.request.model': 'claude-sonnet-4-20250514',
          // No pennyfarthing.* attributes
        },
        events: [],
        childSpans: [],
        status: 'completed',
      };

      // Should not throw
      expect(() => convertSpansToOTLP([minimalSpan])).not.toThrow();
    });

    it('should handle very large span batches', () => {
      const largeSpanBatch: AgentSpan[] = Array(100).fill(null).map((_, i) => ({
        ...sampleAgentSpan,
        traceId: `trace-large-${i}`,
        spanId: `span-large-${i}`,
      }));

      const otlpPayload = convertSpansToOTLP(largeSpanBatch);

      // Should handle all spans
      const allSpans = otlpPayload.resourceSpans[0].scopeSpans[0].spans;
      expect(allSpans.length).toBe(200); // 100 agent spans + 100 tool spans
    });

    it('should handle zero token stats', () => {
      const zeroStats: TokenStats = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalCostUsd: 0,
        lastUpdated: Date.now(),
      };

      const otlpPayload = convertTokenStatsToOTLP(zeroStats);
      expect(otlpPayload.resourceMetrics).toBeDefined();
    });

    it('should handle special characters in attribute values', () => {
      const spanWithSpecialChars: AgentSpan = {
        ...sampleAgentSpan,
        attributes: {
          ...sampleAgentSpan.attributes,
          'pennyfarthing.theme': 'alice-in-wonderland "with quotes"',
        },
      };

      const otlpPayload = convertSpansToOTLP([spanWithSpecialChars]);

      // Should not throw and should preserve special characters
      const themeAttr = otlpPayload.resourceSpans[0].scopeSpans[0].spans[0]
        .attributes.find((a: any) => a.key === 'pennyfarthing.theme');
      expect(themeAttr?.value?.stringValue).toContain('"with quotes"');
    });

  });

});
