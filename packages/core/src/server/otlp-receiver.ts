/**
 * OTLP receiver for BikeRack server module.
 * Provides real OTLP processing for standalone mode (BikeRack/WheelHub)
 * with full span correlation, file enrichment, and per-agent/story aggregation.
 *
 * Story 124-2: Moved from Cyclist to BikeRack for standalone operation.
 * Story 132-5: Standalone enrichment — pending tool inputs are stored locally
 *   and correlated with incoming log events for file/edit/bash enrichment.
 *
 * Supports a provider pattern: call setOTLPProvider() with an external implementation
 * to override default processing. Without a provider, uses in-memory stores.
 */

import {
  detectLanguage,
  calculateDiffSummary,
  getFileSize,
  getLineCount,
  getGitStatus,
  redactSecrets,
  createOutputSummary,
  extractExitCode,
} from './file-enrichment.js';


export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  [key: string]: unknown;
}

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

export interface ToolEvent {
  toolName: string;
  input?: string;
  success?: boolean;
  workingDirectory?: string;
  [key: string]: unknown;
}

export interface AuditLogEntry {
  timestamp: number;
  type: string;
  tool?: string;
  [key: string]: unknown;
}

// =============================================================================
// Provider interface — covers the 15 functions used by core's API routes
// =============================================================================

export interface OTLPProvider {
  // token-stats.ts
  getTokenStats(): TokenStats;
  addTokenStatsListener(callback: (stats: TokenStats) => void): void;

  // background-tasks.ts
  getBackgroundTasks(): BackgroundTask[];

  // otlp.ts
  processOTLPLogs(body: unknown): void;
  processOTLPMetrics(body: unknown): void;
  processOTLPTraces(body: unknown): void;

  // audit-log.ts
  getAuditLog(): AuditLogEntry[];
  getToolEventsFiltered(opts?: unknown): ToolEvent[];
  getToolTypes(): string[];
  getAuditLogStats(): Record<string, unknown>;
  exportAuditLogAsJSON(toolType?: string): string;
  exportAuditLogAsCSV(toolType?: string): string;
  resetEventStore(): void;

  // span-correlation.ts (Story 120-13: hook-based tool input forwarding)
  storePendingToolInput?(toolId: string, toolName: string, input: Record<string, unknown>): void;
}

let _provider: OTLPProvider | null = null;

export function setOTLPProvider(provider: OTLPProvider): void {
  _provider = provider;
}

// =============================================================================
// In-memory stores — standalone mode (used when no provider is set)
// =============================================================================

const _emptyStats = (): TokenStats => ({
  inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCost: 0,
});

let _tokenStats: TokenStats = _emptyStats();
let _tokenStatsListeners: Array<(stats: TokenStats) => void> = [];
let _backgroundTasks: BackgroundTask[] = [];
let _auditLog: AuditLogEntry[] = [];
let _toolEventListeners: Array<(event: ToolEvent) => void> = [];
let _userEmail: string | null = null;

// =============================================================================
// Delegating stubs — route through provider when set, local stores otherwise
// =============================================================================

export function getTokenStats(): TokenStats {
  if (_provider) return _provider.getTokenStats();
  return { ..._tokenStats };
}

export function addTokenStatsListener(callback: (stats: TokenStats) => void): void {
  if (_provider) return _provider.addTokenStatsListener(callback);
  _tokenStatsListeners.push(callback);
}

export function getBackgroundTasks(): BackgroundTask[] {
  if (_provider) return _provider.getBackgroundTasks();
  return [..._backgroundTasks];
}

export function processOTLPLogs(body: unknown): void {
  if (_provider) return _provider.processOTLPLogs(body);
  const events = parseOTLPLogs(body);
  if (Array.isArray(events)) processLogEvents(events);
}

export function processOTLPMetrics(body: unknown): void {
  if (_provider) return _provider.processOTLPMetrics(body);
  const parsed = parseOTLPMetrics(body);
  if (parsed && typeof parsed === 'object') aggregateTokenStats(parsed);
}

export function processOTLPTraces(body: unknown): void {
  if (_provider) return _provider.processOTLPTraces(body);
}

export function getAuditLog(): AuditLogEntry[] {
  if (_provider) return _provider.getAuditLog();
  return [..._auditLog];
}

export function getToolEventsFiltered(opts?: unknown): ToolEvent[] {
  if (_provider) return _provider.getToolEventsFiltered(opts);
  return [];
}

export function getToolTypes(): string[] {
  if (_provider) return _provider.getToolTypes();
  const types = new Set<string>();
  for (const entry of _auditLog) {
    if (entry.tool) types.add(entry.tool);
  }
  return [...types];
}

export function getAuditLogStats(): Record<string, unknown> {
  if (_provider) return _provider.getAuditLogStats();
  return { total: _auditLog.length };
}

export function exportAuditLogAsJSON(toolType?: string): string {
  if (_provider) return _provider.exportAuditLogAsJSON(toolType);
  const entries = toolType ? _auditLog.filter(e => e.tool === toolType) : _auditLog;
  return JSON.stringify(entries);
}

export function exportAuditLogAsCSV(toolType?: string): string {
  if (_provider) return _provider.exportAuditLogAsCSV(toolType);
  const entries = toolType ? _auditLog.filter(e => e.tool === toolType) : _auditLog;
  if (entries.length === 0) return '';
  const headers = ['timestamp', 'type', 'toolName', 'success'];
  const rows = entries.map(e =>
    [e.timestamp, e.type, e.tool ?? '', e.success ?? ''].join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function resetEventStore(): void {
  if (_provider) return _provider.resetEventStore();
  _tokenStats = _emptyStats();
  _tokenStatsListeners = [];
  _backgroundTasks = [];
  _auditLog = [];
  _toolEventListeners = [];
  _userEmail = null;
  _pendingToolInputs = [];
}

// =============================================================================
// Standalone pending tool input queue (Story 132-5)
// Tool inputs arrive from PreToolUse hook BEFORE OTEL tool_result log events.
// Store them here and consume when matching log events arrive.
// =============================================================================

interface PendingInput {
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
}

let _pendingToolInputs: PendingInput[] = [];
const PENDING_INPUT_MAX_AGE_MS = 10000;

function consumePendingInput(toolName: string): PendingInput | undefined {
  const now = Date.now();
  _pendingToolInputs = _pendingToolInputs.filter(p => now - p.timestamp < PENDING_INPUT_MAX_AGE_MS);
  const index = _pendingToolInputs.findIndex(p => p.toolName === toolName);
  if (index === -1) return undefined;
  const [match] = _pendingToolInputs.splice(index, 1);
  return match;
}

// Story 120-13: Pending tool input storage (hook-based forwarding)
// Story 132-5: Standalone mode now stores locally instead of no-op
export function storePendingToolInput(toolId: string, toolName: string, input: Record<string, unknown>): void {
  if (_provider?.storePendingToolInput) return _provider.storePendingToolInput(toolId, toolName, input);
  const now = Date.now();
  _pendingToolInputs = _pendingToolInputs.filter(p => now - p.timestamp < PENDING_INPUT_MAX_AGE_MS);
  _pendingToolInputs.push({ toolId, toolName, input, timestamp: now });
}

// =============================================================================
// Real implementations — standalone OTLP processing
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseOTLPMetrics(body: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  const payload = body as any;
  if (!payload?.resourceMetrics) return result;

  for (const rm of payload.resourceMetrics) {
    for (const sm of rm.scopeMetrics ?? []) {
      for (const metric of sm.metrics ?? []) {
        if (metric.name !== 'claude_code.token.usage') continue;
        for (const dp of metric.sum?.dataPoints ?? []) {
          const typeAttr = dp.attributes?.find((a: any) => a.key === 'type');
          if (!typeAttr) continue;
          const type = typeAttr.value?.stringValue as string;
          const value = dp.asInt as number;
          if (type === 'input') result.inputTokens = value;
          else if (type === 'output') result.outputTokens = value;
          else if (type === 'cacheRead') result.cacheReadTokens = value;
          else if (type === 'cacheCreation') result.cacheCreationTokens = value;
        }
      }
    }
  }
  return result;
}

export function aggregateTokenStats(data: unknown): TokenStats {
  const d = data as Partial<TokenStats>;
  _tokenStats.inputTokens += d.inputTokens ?? 0;
  _tokenStats.outputTokens += d.outputTokens ?? 0;
  _tokenStats.cacheCreationTokens += d.cacheCreationTokens ?? 0;
  _tokenStats.cacheReadTokens += d.cacheReadTokens ?? 0;
  for (const listener of _tokenStatsListeners) {
    listener({ ..._tokenStats });
  }
  return { ..._tokenStats };
}

export function parseOTLPLogs(body: unknown): Array<{ name: string; timestamp: number; attributes: Record<string, unknown> }> {
  const payload = body as any;
  const events: Array<{ name: string; timestamp: number; attributes: Record<string, unknown> }> = [];
  if (!payload?.resourceLogs) return events;

  for (const rl of payload.resourceLogs) {
    for (const sl of rl.scopeLogs ?? []) {
      for (const record of sl.logRecords ?? []) {
        const name = record.body?.stringValue ?? '';
        const timestampNs = Number(record.timeUnixNano);
        const timestamp = Math.floor(timestampNs / 1_000_000);
        const attributes: Record<string, unknown> = {};
        for (const attr of record.attributes ?? []) {
          if (attr.value?.stringValue !== undefined) attributes[attr.key] = attr.value.stringValue;
          else if (attr.value?.intValue !== undefined) attributes[attr.key] = attr.value.intValue;
          else if (attr.value?.boolValue !== undefined) attributes[attr.key] = attr.value.boolValue;
        }
        events.push({ name, timestamp, attributes });
      }
    }
  }
  return events;
}

export function processLogEvents(events: unknown): void {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    if (event.attributes?.['user.email']) {
      _userEmail = event.attributes['user.email'] as string;
    }
    if (event.name === 'claude_code.tool_result') {
      const toolName = (event.attributes?.tool_name as string) ?? 'unknown';
      const success = event.attributes?.success === 'true';
      const durationMs = parseInt(event.attributes?.duration_ms as string, 10) || 0;

      const entry: AuditLogEntry = {
        timestamp: event.timestamp,
        type: 'tool_result',
        tool: toolName,
        toolName,
        success,
        durationMs,
      };

      // Story 132-5: Consume pending tool input for enrichment
      const pendingInput = consumePendingInput(toolName);

      // Parse tool_parameters for input excerpt (matches Cyclist's enrichment)
      let input: string | undefined;
      const toolParams = event.attributes?.tool_parameters as string | undefined;
      let parsedParams: Record<string, unknown> | undefined;
      if (toolParams) {
        try {
          parsedParams = JSON.parse(toolParams);
          input = (parsedParams!.description || parsedParams!.full_command || parsedParams!.file_path || parsedParams!.command || parsedParams!.pattern || (Object.values(parsedParams!)[0] as string)) as string;
        } catch {
          input = toolParams;
        }
      }

      // Story 132-5: Enrich from pending tool input (has full params not in OTEL)
      const toolInput = pendingInput?.input ?? parsedParams;
      if (toolInput) {
        enrichEntrySync(entry, toolName, toolInput, success, durationMs);
        // Async enrichment updates entry in place (file size, line count, git status)
        enrichEntryAsync(entry, toolName, toolInput).catch(() => {});
      }

      _auditLog.push(entry);

      const toolEvent: ToolEvent = {
        toolName,
        input: input?.substring(0, 500),
        success,
        timestamp: event.timestamp,
        toolParameters: toolParams,
        durationMs,
        // Copy enrichment fields to tool event
        ...(entry.filePath ? { filePath: entry.filePath } : {}),
        ...(entry.language ? { language: entry.language } : {}),
        ...(entry.diff ? { diff: entry.diff } : {}),
        ...(entry.command ? { command: entry.command } : {}),
        ...(entry.exitCode !== undefined ? { exitCode: entry.exitCode } : {}),
        ...(entry.outputSummary ? { outputSummary: entry.outputSummary } : {}),
      };
      for (const listener of _toolEventListeners) {
        listener(toolEvent);
      }
    }
  }
}

/**
 * Synchronous enrichment — adds fields to audit entry immediately.
 * Story 132-5
 */
function enrichEntrySync(
  entry: AuditLogEntry,
  toolName: string,
  toolInput: Record<string, unknown>,
  success: boolean,
  durationMs: number,
): void {
  switch (toolName) {
    case 'Read':
    case 'Write': {
      const filePath = toolInput.file_path as string;
      if (filePath) {
        entry.filePath = filePath;
        entry.language = detectLanguage(filePath);
      }
      break;
    }
    case 'Edit': {
      const filePath = toolInput.file_path as string;
      if (filePath) {
        entry.filePath = filePath;
        entry.language = detectLanguage(filePath);
      }
      const oldStr = toolInput.old_string as string | undefined;
      const newStr = toolInput.new_string as string | undefined;
      if (oldStr !== undefined && newStr !== undefined) {
        entry.diff = calculateDiffSummary(oldStr, newStr);
      }
      break;
    }
    case 'Bash': {
      const command = toolInput.command as string;
      if (command) {
        entry.command = redactSecrets(command);
      }
      entry.exitCode = extractExitCode(undefined, undefined, success);
      entry.workingDirectory = (toolInput.cwd as string) || undefined;
      break;
    }
    case 'Grep':
    case 'Glob': {
      const pattern = toolInput.pattern as string;
      if (pattern) {
        entry.pattern = pattern;
      }
      break;
    }
  }
}

/**
 * Async enrichment — updates audit entry in place with filesystem data.
 * Fire-and-forget; failures are silently ignored.
 * Story 132-5
 */
async function enrichEntryAsync(
  entry: AuditLogEntry,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<void> {
  const filePath = toolInput.file_path as string;
  if (!filePath) return;

  if (toolName === 'Read' || toolName === 'Edit' || toolName === 'Write') {
    const [fileSize, lineCount, gitStatus] = await Promise.all([
      getFileSize(filePath),
      getLineCount(filePath),
      getGitStatus(filePath),
    ]);
    entry.fileSize = fileSize;
    entry.lineCount = lineCount;
    entry.gitStatus = gitStatus;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function trackBackgroundTask(task: Partial<BackgroundTask>): void {
  const fullTask: BackgroundTask = {
    taskId: task.taskId ?? '',
    description: task.description ?? '',
    subagentType: task.subagentType ?? '',
    startedAt: task.startedAt ?? Date.now(),
    status: 'pending',
  };
  _backgroundTasks.push(fullTask);
}

export function getBackgroundTaskByToolId(toolId: string): BackgroundTask | undefined {
  return _backgroundTasks.find(t => t.taskId === toolId);
}

export function completeBackgroundTask(taskId: string, success: boolean, result?: string, error?: string): BackgroundTask | undefined {
  const task = _backgroundTasks.find(t => t.taskId === taskId);
  if (!task) return undefined;
  task.status = 'completed';
  task.success = success;
  task.completedAt = Date.now();
  task.durationMs = task.completedAt - task.startedAt;
  if (result) task.output = result;
  if (error) task.error = error;
  return task;
}

export function addToolEventListener(callback: (event: ToolEvent) => void): void {
  _toolEventListeners.push(callback);
}

export function getUserEmail(): string | null {
  return _userEmail;
}

// =============================================================================
// OTEL Debug (Story 36-10)
// =============================================================================

let _otelDebugEnabled = false;

export function setOtelDebug(enabled: boolean): void {
  _otelDebugEnabled = enabled;
}

export function isOtelDebugEnabled(): boolean {
  return _otelDebugEnabled;
}

// =============================================================================
// Tool Event Recording and Retrieval
// =============================================================================

const _toolEvents: ToolEvent[] = [];

export function recordToolEvent(event: ToolEvent): void {
  _toolEvents.push(event);
}

export function getToolEvents(): ToolEvent[] {
  return [..._toolEvents];
}

export function resetTokenStats(): void {
  _tokenStats = _emptyStats();
  _tokenStatsListeners = [];
}

export function clearAuditLog(): void {
  _auditLog = [];
}
