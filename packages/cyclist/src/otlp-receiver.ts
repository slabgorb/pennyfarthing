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

// =============================================================================
// Tool Event Types (Story 19-1)
// =============================================================================

/**
 * Parsed tool execution event from OTLP logs
 */
export interface ToolEvent {
  /** Tool name (e.g., 'Read', 'Write', 'Bash', 'Grep') */
  toolName: string;
  /** Tool input (file path, command, pattern, etc.) */
  input?: string;
  /** Tool output (file contents, command output, etc.) */
  output?: string;
  /** Tool execution duration in milliseconds */
  durationMs?: number;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Error message if tool failed */
  error?: string;
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Trace ID for correlation */
  traceId?: string;
  /** Span ID for correlation */
  spanId?: string;
}

/**
 * Parsed user prompt event from OTLP logs
 */
export interface ParsedPromptEvent {
  /** The prompt text */
  promptText: string;
  /** Token count for the prompt */
  tokens?: number;
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Trace ID for correlation */
  traceId?: string;
  /** Span ID for correlation */
  spanId?: string;
}

/**
 * Raw parsed log event before categorization
 */
interface RawLogEvent {
  name: string;
  timestamp: number;
  traceId?: string;
  spanId?: string;
  attributes: Record<string, string | number | boolean | undefined>;
}

// Session event stores (in-memory)
let toolEvents: ToolEvent[] = [];
let promptEvents: ParsedPromptEvent[] = [];

// Token stats interface
export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  lastUpdated: number;
}

// Partial token stats for parsing/aggregation
export type PartialTokenStats = Partial<Omit<TokenStats, 'lastUpdated' | 'totalCostUsd'>>;

// Session token state (in-memory)
let sessionTokens: TokenStats = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  totalCostUsd: 0,
  lastUpdated: 0,
};

// Callback for when token stats are updated (set by main.ts for IPC broadcast)
let onTokenStatsUpdate: ((stats: TokenStats) => void) | null = null;

/**
 * Register callback for token stats updates
 * Called by main.ts to wire up IPC broadcast
 */
export function setTokenStatsCallback(callback: (stats: TokenStats) => void): void {
  onTokenStatsUpdate = callback;
}

// OTLP JSON structure types
interface OTLPAttribute {
  key: string;
  value: { stringValue?: string; intValue?: number };
}

interface OTLPDataPoint {
  asInt?: number;
  asDouble?: number;
  attributes?: OTLPAttribute[];
}

interface OTLPMetric {
  name: string;
  sum?: {
    dataPoints?: OTLPDataPoint[];
  };
}

interface OTLPScopeMetrics {
  metrics?: OTLPMetric[];
}

interface OTLPResourceMetrics {
  scopeMetrics?: OTLPScopeMetrics[];
}

interface OTLPPayload {
  resourceMetrics?: OTLPResourceMetrics[];
}

/**
 * Parse OTLP JSON payload and extract token usage metrics
 */
export function parseOTLPMetrics(body: unknown): PartialTokenStats {
  const result: PartialTokenStats = {};

  try {
    const payload = body as OTLPPayload;

    if (!payload?.resourceMetrics) {
      return result;
    }

    for (const resourceMetric of payload.resourceMetrics) {
      if (!resourceMetric?.scopeMetrics) continue;

      for (const scopeMetric of resourceMetric.scopeMetrics) {
        if (!scopeMetric?.metrics) continue;

        for (const metric of scopeMetric.metrics) {
          // Only process claude_code.token.usage metrics
          if (metric.name !== 'claude_code.token.usage') continue;

          if (!metric.sum?.dataPoints) continue;

          for (const dataPoint of metric.sum.dataPoints) {
            const value = dataPoint.asInt ?? dataPoint.asDouble ?? 0;

            // Find the type attribute
            const typeAttr = dataPoint.attributes?.find(
              (attr) => attr.key === 'type'
            );
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
  } catch {
    // Malformed payload - return empty result
  }

  return result;
}

/**
 * Aggregate parsed token stats into session totals
 */
export function aggregateTokenStats(parsed: PartialTokenStats): void {
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
export function getTokenStats(): TokenStats {
  return { ...sessionTokens };
}

/**
 * Reset session token stats (for new session)
 */
export function resetTokenStats(): void {
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

// =============================================================================
// OTLP Logs Parsing (Story 19-1)
// =============================================================================

// OTLP Logs JSON structure types
interface OTLPLogAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: number;
    boolValue?: boolean;
  };
}

interface OTLPLogRecord {
  timeUnixNano?: string;
  body?: { stringValue?: string };
  traceId?: string;
  spanId?: string;
  attributes?: OTLPLogAttribute[];
}

interface OTLPScopeLogs {
  logRecords?: OTLPLogRecord[];
}

interface OTLPResourceLogs {
  scopeLogs?: OTLPScopeLogs[];
}

interface OTLPLogsPayload {
  resourceLogs?: OTLPResourceLogs[];
}

/**
 * Parse OTLP logs payload and extract raw events
 */
export function parseOTLPLogs(body: unknown): RawLogEvent[] {
  const events: RawLogEvent[] = [];

  try {
    const payload = body as OTLPLogsPayload;

    if (!payload?.resourceLogs) {
      return events;
    }

    for (const resourceLog of payload.resourceLogs) {
      if (!resourceLog?.scopeLogs) continue;

      for (const scopeLog of resourceLog.scopeLogs) {
        if (!scopeLog?.logRecords) continue;

        for (const logRecord of scopeLog.logRecords) {
          const eventName = logRecord.body?.stringValue;
          if (!eventName) continue;

          // Convert nanoseconds to milliseconds
          const timestamp = logRecord.timeUnixNano
            ? Math.floor(Number(logRecord.timeUnixNano) / 1_000_000)
            : Date.now();

          // Extract attributes into a flat object
          const attributes: Record<string, string | number | boolean | undefined> = {};
          if (logRecord.attributes) {
            for (const attr of logRecord.attributes) {
              if (attr.value.stringValue !== undefined) {
                attributes[attr.key] = attr.value.stringValue;
              } else if (attr.value.intValue !== undefined) {
                attributes[attr.key] = attr.value.intValue;
              } else if (attr.value.boolValue !== undefined) {
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
  } catch {
    // Malformed payload - return empty array
  }

  return events;
}

/**
 * Record a tool event to session storage
 */
export function recordToolEvent(event: ToolEvent): void {
  toolEvents.push(event);
}

/**
 * Record a prompt event to session storage
 */
export function recordPromptEvent(event: ParsedPromptEvent): void {
  promptEvents.push(event);
}

/**
 * Get all stored tool events
 */
export function getToolEvents(): ToolEvent[] {
  return [...toolEvents];
}

/**
 * Get all stored prompt events
 */
export function getPromptEvents(): ParsedPromptEvent[] {
  return [...promptEvents];
}

/**
 * Reset event stores (for new session or testing)
 */
export function resetEventStore(): void {
  toolEvents = [];
  promptEvents = [];
}

/**
 * Process raw log events and store them appropriately
 * Called by the /v1/logs endpoint
 */
export function processLogEvents(rawEvents: RawLogEvent[]): void {
  for (const event of rawEvents) {
    if (event.name === 'claude_code.tool_result') {
      const toolEvent: ToolEvent = {
        toolName: event.attributes['tool.name'] as string || 'unknown',
        input: event.attributes['tool.input'] as string | undefined,
        output: event.attributes['tool.output'] as string | undefined,
        durationMs: event.attributes['tool.duration_ms'] as number | undefined,
        success: event.attributes['tool.success'] as boolean ?? true,
        error: event.attributes['tool.error'] as string | undefined,
        timestamp: event.timestamp,
        traceId: event.traceId,
        spanId: event.spanId,
      };
      recordToolEvent(toolEvent);
    } else if (event.name === 'claude_code.user_prompt') {
      const promptEvent: ParsedPromptEvent = {
        promptText: event.attributes['prompt.text'] as string || '',
        tokens: event.attributes['prompt.tokens'] as number | undefined,
        timestamp: event.timestamp,
        traceId: event.traceId,
        spanId: event.spanId,
      };
      recordPromptEvent(promptEvent);
    }
    // Other event types (like claude_code.api_request) are ignored for now
  }
}
