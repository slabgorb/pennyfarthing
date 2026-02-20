/**
 * OTLP Receiver - Parses OpenTelemetry metrics and logs from Claude Code
 *
 * Receives OTLP HTTP/JSON format metrics and extracts token usage data.
 * Story 19-1: Extended to parse tool and prompt events from OTLP logs.
 * Story 19-4: Extended with per-agent token aggregation.
 * Story 19-5: Extended with per-story token aggregation.
 */

import { appendFileSync } from 'fs';
import { aggregateTokensForAgent, resetAgentTokenStats } from './agent-context.js';
import { aggregateTokensForStory, resetStoryTokenStats } from './story-context.js';
// Story 36-7: Import span correlation and enrichment modules
// Story 36-8: Added consumePendingToolInput for Claude message stream correlation
import { correlateSpan, resetCorrelations, consumePendingToolInput, type MessageContext } from './span-correlation.js';
import {
  enrichReadSpan,
  enrichEditSpan,
  enrichWriteSpan,
  enrichBashSpan,
  type DiffSummary,
  type OutputSummary,
} from './file-enrichment.js';

// Story 36-10: Debug flag for OTEL capture
// Toggle via: setOtelDebug(true) or env OTEL_DEBUG=true or just cyclist-electron true
let otelDebugEnabled = process.env.OTEL_DEBUG === 'true';
const OTEL_CAPTURE_FILE = '/tmp/otel-capture.jsonl';

/** Enable/disable OTEL debug logging at runtime */
export function setOtelDebug(enabled: boolean): void {
  otelDebugEnabled = enabled;
  if (enabled) {
    console.log(`[OTEL] Debug logging enabled. Capturing to ${OTEL_CAPTURE_FILE}`);
  } else {
    console.log('[OTEL] Debug logging disabled');
  }
}

/** Check if OTEL debug is enabled */
export function isOtelDebugEnabled(): boolean {
  return otelDebugEnabled;
}

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
  // Story 36-7: Enrichment fields for Read/Edit tools
  /** File size in bytes (Read/Edit tools) */
  fileSize?: number;
  /** Line count (Read tool) */
  lineCount?: number;
  /** Detected programming language */
  language?: string;
  /** Git status of the file */
  gitStatus?: 'clean' | 'modified' | 'new' | 'untracked' | null;
  /** Diff summary for Edit operations */
  diff?: DiffSummary;
  // Story 36-10: File path from pending input for UI display
  /** Resolved file path for Read/Edit tools */
  filePath?: string;
  // Story 36-3: Bash tool enrichment fields
  /** Command executed (secrets redacted) */
  command?: string;
  /** Exit code from command execution */
  exitCode?: number | null;
  /** Output summary with first/last lines */
  outputSummary?: OutputSummary;
  /** Working directory where command was executed */
  workingDirectory?: string;
  // Story 36-5: Task tool enrichment fields
  /** Subagent type for Task tool (e.g., 'general-purpose', 'Explore') */
  subagentType?: string;
  /** Prompt summary - first 200 chars of task prompt */
  promptSummary?: string;
  /** Result summary when task completes (TaskOutput) */
  resultSummary?: string;
  /** Whether task runs in background */
  isBackground?: boolean;
  // Note: diffOriginal/diffModified removed in MSSCI-14238 - now using git diff instead
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

// =============================================================================
// Background Task Tracking (Story 31-15)
// =============================================================================

/**
 * Background task data tracked from Task tool spans
 */
export interface BackgroundTask {
  taskId: string;
  description: string;
  subagentType: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: 'pending' | 'completed';
  success?: boolean;
  output?: string;
  error?: string;
  isBackground?: boolean;
}

// Background task store
let backgroundTasks: BackgroundTask[] = [];

/**
 * Track a new background task
 */
export function trackBackgroundTask(task: Omit<BackgroundTask, 'status'>): void {
  const newTask: BackgroundTask = { ...task, status: 'pending' };
  backgroundTasks.push(newTask);
}

/**
 * Get all tracked background tasks
 */
export function getBackgroundTasks(): BackgroundTask[] {
  return [...backgroundTasks];
}

/**
 * Get a background task by its tool_use_id (taskId)
 * Used to enrich messages with subagent context (MSSCI-12776)
 */
export function getBackgroundTaskByToolId(toolId: string): BackgroundTask | null {
  return backgroundTasks.find(t => t.taskId === toolId) ?? null;
}

/**
 * Reset background task store
 */
export function resetBackgroundTasks(): void {
  backgroundTasks = [];
}

/**
 * Complete a background task by its tool_use_id
 * Called when tool_result is received in message stream
 */
export function completeBackgroundTask(
  taskId: string,
  success: boolean,
  output?: string,
  error?: string
): BackgroundTask | null {
  const task = backgroundTasks.find(t => t.taskId === taskId);
  if (task && task.status === 'pending') {
    const completedAt = Date.now();
    task.status = 'completed';
    task.completedAt = completedAt;
    task.durationMs = completedAt - task.startedAt;
    task.success = success;
    task.output = output;
    task.error = error;
    return task;
  }
  return null;
}

// 35-2: User info extracted from OTEL spans
let userEmail: string | null = null;

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

// Additional listeners for token stats (for WebSocket broadcast, etc.)
const tokenStatsListeners: ((stats: TokenStats) => void)[] = [];

/**
 * Register callback for token stats updates
 * Called by main.ts to wire up IPC broadcast
 */
export function setTokenStatsCallback(callback: (stats: TokenStats) => void): void {
  onTokenStatsUpdate = callback;
}

/**
 * Add a listener for token stats updates (supports multiple subscribers)
 * Returns unsubscribe function
 */
export function addTokenStatsListener(listener: (stats: TokenStats) => void): () => void {
  tokenStatsListeners.push(listener);
  return () => {
    const index = tokenStatsListeners.indexOf(listener);
    if (index > -1) {
      tokenStatsListeners.splice(index, 1);
    }
  };
}

/**
 * Notify all token stats listeners
 * Called internally when token stats are updated
 */
function notifyTokenStatsListeners(stats: TokenStats): void {
  // Call the primary callback (IPC broadcast)
  if (onTokenStatsUpdate) {
    onTokenStatsUpdate(stats);
  }
  // Call all additional listeners (WebSocket, etc.)
  for (const listener of tokenStatsListeners) {
    try {
      listener(stats);
    } catch (e) {
      console.error('[OTLP] Error in token stats listener:', e);
    }
  }
}

// Callback for when tool events are recorded (set by main.ts for IPC broadcast)
let onToolEventRecorded: ((event: ToolEvent) => void) | null = null;

// Additional listeners for tool events (for WebSocket broadcast, etc.)
const toolEventListeners: ((event: ToolEvent) => void)[] = [];

/**
 * Register callback for tool event recording
 * Called by main.ts to wire up IPC broadcast to renderer
 */
export function setToolEventCallback(callback: (event: ToolEvent) => void): void {
  onToolEventRecorded = callback;
}

/**
 * Add a listener for tool events (supports multiple subscribers)
 * Returns unsubscribe function
 */
export function addToolEventListener(listener: (event: ToolEvent) => void): () => void {
  toolEventListeners.push(listener);
  return () => {
    const index = toolEventListeners.indexOf(listener);
    if (index > -1) {
      toolEventListeners.splice(index, 1);
    }
  };
}

/**
 * Notify all tool event listeners
 * Called internally when a tool event is recorded
 */
function notifyToolEventListeners(event: ToolEvent): void {
  // Call the primary callback (IPC broadcast)
  if (onToolEventRecorded) {
    onToolEventRecorded(event);
  }
  // Call all additional listeners (WebSocket, etc.)
  for (const listener of toolEventListeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('[OTLP] Error in tool event listener:', e);
    }
  }
}

// 35-2: Callback for when user email is discovered
let onUserEmailUpdate: ((email: string) => void) | null = null;

/**
 * Register callback for user email updates
 * Called by main.ts to wire up IPC broadcast
 */
export function setUserEmailCallback(callback: (email: string) => void): void {
  onUserEmailUpdate = callback;
}

/**
 * Get the current user email (extracted from OTEL spans)
 */
export function getUserEmail(): string | null {
  return userEmail;
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
    // Notify all listeners (IPC broadcast + WebSocket)
    notifyTokenStatsListeners({ ...sessionTokens });
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

          // Story 36-10: Capture raw OTEL data for skill documentation
          if (otelDebugEnabled) {
            const capture = {
              timestamp: new Date().toISOString(),
              eventName,
              logRecordKeys: Object.keys(logRecord),
              traceId: logRecord.traceId,
              spanId: logRecord.spanId,
              attributes: logRecord.attributes,
            };
            console.log('[OTEL-CAPTURE]', JSON.stringify(capture));
            try {
              appendFileSync(OTEL_CAPTURE_FILE, JSON.stringify(capture) + '\n');
            } catch { /* ignore file write errors */ }
          }

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
 * Record a tool event to session storage and notify listeners
 */
export function recordToolEvent(event: ToolEvent): void {
  toolEvents.push(event);
  // Broadcast to all listeners (IPC, WebSocket, etc.)
  notifyToolEventListeners(event);
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
  userEmail = null; // 35-2: Reset user email on session reset
  resetCorrelations(); // 36-7: Reset span correlations on session reset
}

// =============================================================================
// Audit Log Functions (Story 22-6)
// =============================================================================

/**
 * Get tool events filtered by tool type
 * @param toolType - Optional tool name to filter by (e.g., 'Bash', 'Read', 'Write')
 * @returns Filtered array of tool events
 */
export function getToolEventsFiltered(toolType?: string): ToolEvent[] {
  if (!toolType) return getToolEvents();
  return toolEvents.filter(e => e.toolName === toolType);
}

/**
 * Get unique tool types from all recorded events
 * @returns Array of unique tool names
 */
export function getToolTypes(): string[] {
  const types = new Set(toolEvents.map(e => e.toolName));
  return Array.from(types).sort();
}

/**
 * Export audit log as JSON string
 * @param toolType - Optional filter by tool type
 * @returns JSON string of tool events
 */
export function exportAuditLogAsJSON(toolType?: string): string {
  const events = getToolEventsFiltered(toolType);
  return JSON.stringify(events, null, 2);
}

/**
 * Export audit log as CSV string
 * @param toolType - Optional filter by tool type
 * @returns CSV string of tool events
 */
export function exportAuditLogAsCSV(toolType?: string): string {
  const events = getToolEventsFiltered(toolType);

  // CSV header
  const header = 'timestamp,toolName,input,durationMs,success,error';

  // Escape CSV field (handle commas, quotes, newlines)
  const escapeCSV = (value: string | number | boolean | undefined): string => {
    if (value === undefined || value === null) return '';
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
export function getAuditLogStats(): {
  total: number;
  byType: Record<string, number>;
  successCount: number;
  errorCount: number;
} {
  const byType: Record<string, number> = {};
  let successCount = 0;
  let errorCount = 0;

  for (const event of toolEvents) {
    byType[event.toolName] = (byType[event.toolName] || 0) + 1;
    if (event.success) {
      successCount++;
    } else {
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
export async function processLogEvents(rawEvents: RawLogEvent[]): Promise<void> {
  for (const event of rawEvents) {
    // 35-2: Extract user.email from any event that has it (only store once)
    if (!userEmail && event.attributes['user.email']) {
      userEmail = event.attributes['user.email'] as string;
      if (onUserEmailUpdate) {
        onUserEmailUpdate(userEmail);
      }
    }

    if (event.name === 'claude_code.tool_result') {
      // Parse tool_parameters JSON to extract input
      let input: string | undefined;
      const toolParams = event.attributes['tool_parameters'] as string | undefined;
      if (toolParams) {
        try {
          const params = JSON.parse(toolParams);
          // Use description if available, otherwise full_command or first param value
          input = params.description || params.full_command || params.file_path || params.command || params.pattern || Object.values(params)[0] as string;
        } catch {
          input = toolParams; // Use raw string if not valid JSON
        }
      }

      // Parse duration_ms - could be string or number
      const rawDuration = event.attributes['duration_ms'];
      const durationMs = typeof rawDuration === 'string' ? parseInt(rawDuration, 10) : rawDuration as number | undefined;

      // Parse success - comes as string "true"/"false"
      const rawSuccess = event.attributes['success'];
      const success = rawSuccess === 'true' || rawSuccess === true;

      const toolName = event.attributes['tool_name'] as string || 'unknown';

      // NOTE: Task detection moved to main.ts message stream handler.
      // OTEL logs do NOT emit tool_parameters for Task tools, so the
      // previous detection code here never worked. Task start is now
      // detected from Claude message stream tool_use events.

      // 31-15: Handle TaskOutput completion
      if (toolName === 'TaskOutput') {
        try {
          const params = toolParams ? JSON.parse(toolParams) : {};
          const taskId = params.task_id || event.attributes['task_id'] as string;
          const taskStatus = event.attributes['task_status'] as string;
          if (taskId && taskStatus === 'completed') {
            const task = backgroundTasks.find(t => t.taskId === taskId);
            if (task) {
              task.status = 'completed';
              task.success = success;
              // Truncate output to avoid memory bloat
              const rawOutput = event.attributes['tool_output'] as string;
              task.output = rawOutput?.substring(0, 2000);
            }
          }
        } catch { /* ignore parse errors */ }
      }

      const toolEvent: ToolEvent = {
        toolName,
        input: input?.substring(0, 500),
        output: (event.attributes['tool_output'] as string)?.substring(0, 2000),
        durationMs: isNaN(durationMs as number) ? undefined : durationMs,
        success,
        error: event.attributes['error'] as string | undefined,
        timestamp: event.timestamp,
        traceId: event.traceId,
        spanId: event.spanId,
      };

      // Story 36-7: Correlate span and enrich Read/Edit tools
      // Story 36-8: Get tool input from Claude message stream instead of OTEL params
      // Story 36-9: Claude Code OTEL logs don't include traceId/spanId at logRecord level,
      // so we use the pending tool input's toolId as the correlation key instead
      // Story 36-10: Pass parsed tool_parameters for precise file_path matching
      let parsedToolParams: Record<string, unknown> | undefined;
      if (toolParams) {
        try {
          parsedToolParams = JSON.parse(toolParams);
        } catch { /* ignore parse errors */ }
      }
      const pendingInput = consumePendingToolInput(toolName, parsedToolParams);
      const toolInput = pendingInput?.input;

      // Story 36-10: Add file_path to toolEvent for UI display (Read/Edit tools)
      if (toolInput?.file_path) {
        toolEvent.filePath = toolInput.file_path as string;
      }

      // Complete background Task when its tool_result arrives via OTEL
      // Task starts are tracked in main.ts from the message stream; completions
      // arrive here as tool_result events but were previously unhandled.
      if (toolName === 'Task' && pendingInput) {
        completeBackgroundTask(pendingInput.toolId, success,
          success ? (event.attributes['tool_output'] as string)?.substring(0, 2000) : undefined,
          success ? undefined : (event.attributes['error'] as string || 'Task failed'));
      }

      // Only correlate and enrich if we have a pending input (from Claude message stream)
      if (pendingInput) {
        // Use toolId as the correlation key since OTEL spanId is unavailable
        const correlationId = pendingInput.toolId;

        // Create correlation with message context
        const messageContext: MessageContext = {
          messageId: correlationId,
          toolName,
          input: toolInput,
        };

        // Use toolId as spanId for correlation map (synthetic, but consistent)
        correlateSpan(correlationId, {
          traceId: correlationId, // Synthetic traceId from toolId
          spanId: correlationId,  // Synthetic spanId from toolId
          toolName,
          toolUseId: correlationId,
          timestamp: event.timestamp,
          enriched: false,
          messageContext,
        });

        // Update toolEvent with correlation ID for downstream use
        toolEvent.traceId = correlationId;
        toolEvent.spanId = correlationId;

        // Enrich Read/Edit/Bash spans - await to include enrichment data in toolEvent
        try {
          if (toolName === 'Read') {
            const enrichment = await enrichReadSpan(correlationId);
            if (!enrichment.error && !enrichment.skipped) {
              toolEvent.fileSize = enrichment.fileSize;
              toolEvent.lineCount = enrichment.lineCount;
              toolEvent.language = enrichment.language;
              toolEvent.gitStatus = enrichment.gitStatus;
            }
          } else if (toolName === 'Edit') {
            const enrichment = await enrichEditSpan(correlationId);
            if (!enrichment.error && !enrichment.skipped) {
              toolEvent.fileSize = enrichment.fileSize;
              toolEvent.language = enrichment.language;
              toolEvent.gitStatus = enrichment.gitStatus;
              toolEvent.diff = enrichment.diff;
            }
            // Note: diffOriginal/diffModified removed in MSSCI-14238 - now using git diff
          } else if (toolName === 'Write') {
            // Story 36-11: Write tool enrichment
            const enrichment = await enrichWriteSpan(correlationId);
            if (!enrichment.error && !enrichment.skipped) {
              toolEvent.fileSize = enrichment.fileSize;
              toolEvent.lineCount = enrichment.lineCount;
              toolEvent.language = enrichment.language;
              toolEvent.gitStatus = enrichment.gitStatus;
            }
            // Note: diffOriginal/diffModified removed in MSSCI-14238 - now using git diff
          } else if (toolName === 'Bash') {
            // Story 36-3: Bash tool enrichment
            const enrichment = enrichBashSpan(correlationId, {
              output: toolEvent.output,
              error: toolEvent.error,
              success: toolEvent.success,
              durationMs: toolEvent.durationMs,
            });
            if (!enrichment.error && !enrichment.skipped) {
              toolEvent.command = enrichment.command;
              toolEvent.exitCode = enrichment.exitCode;
              toolEvent.outputSummary = enrichment.outputSummary;
              toolEvent.workingDirectory = enrichment.workingDirectory;
            }
          }
        } catch { /* ignore enrichment errors */ }
      }

      // Story 36-5: Task tool enrichment (works without pendingInput)
      if (toolName === 'Task' && parsedToolParams) {
        toolEvent.subagentType = parsedToolParams.subagent_type as string | undefined;
        toolEvent.promptSummary = (parsedToolParams.prompt as string)?.substring(0, 200);
        toolEvent.isBackground = parsedToolParams.run_in_background === true || parsedToolParams.run_in_background === 'true';
      }

      // Story 36-5: TaskOutput result summary enrichment
      if (toolName === 'TaskOutput') {
        const rawOutput = event.attributes['tool_output'] as string;
        if (rawOutput) {
          toolEvent.resultSummary = rawOutput.substring(0, 200);
        }
      }

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
