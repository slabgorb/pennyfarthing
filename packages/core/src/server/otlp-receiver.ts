/**
 * OTLP receiver for server module.
 * Provides real OTLP processing for standalone mode (BikeRack/WheelHub)
 * without requiring Cyclist's provider.
 *
 * Supports a provider pattern: call setOTLPProvider() with the real implementation
 * (e.g. from cyclist's otlp-receiver) to wire live data through the API routes.
 * Without a provider, functions use in-memory stores for standalone operation.
 */

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
  setBackgroundTaskStartCallback(callback: (task: BackgroundTask) => void): void;
  setBackgroundTaskCallback(callback: (task: BackgroundTask) => void): void;

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
let _backgroundTaskStartCb: ((task: BackgroundTask) => void) | null = null;
let _backgroundTaskCompleteCb: ((task: BackgroundTask) => void) | null = null;
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

export function setBackgroundTaskStartCallback(callback: (task: BackgroundTask) => void): void {
  if (_provider) return _provider.setBackgroundTaskStartCallback(callback);
  _backgroundTaskStartCb = callback;
}

export function setBackgroundTaskCallback(callback: (task: BackgroundTask) => void): void {
  if (_provider) return _provider.setBackgroundTaskCallback(callback);
  _backgroundTaskCompleteCb = callback;
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
  _backgroundTaskStartCb = null;
  _backgroundTaskCompleteCb = null;
  _auditLog = [];
  _toolEventListeners = [];
  _userEmail = null;
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
      const entry: AuditLogEntry = {
        timestamp: event.timestamp,
        type: 'tool_result',
        tool: toolName,
        toolName,
        success,
      };
      _auditLog.push(entry);
      const toolEvent: ToolEvent = { toolName, success };
      for (const listener of _toolEventListeners) {
        listener(toolEvent);
      }
    }
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
  if (_backgroundTaskStartCb) _backgroundTaskStartCb(fullTask);
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
  if (_backgroundTaskCompleteCb) _backgroundTaskCompleteCb(task);
  return task;
}

export function addToolEventListener(callback: (event: ToolEvent) => void): void {
  _toolEventListeners.push(callback);
}

export function getUserEmail(): string | null {
  return _userEmail;
}

export function isOtelDebugEnabled(): boolean {
  return false;
}

export function clearAuditLog(): void {
  _auditLog = [];
}
