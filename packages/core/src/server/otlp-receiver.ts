/**
 * OTLP receiver stub for server module.
 * Provides functions/types used by API routes without cyclist OTLP dependency.
 *
 * Supports a provider pattern: call setOTLPProvider() with the real implementation
 * (e.g. from cyclist's otlp-receiver) to wire live data through the API routes.
 * Without a provider, all functions return safe empty defaults.
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
// Delegating stubs — route through provider when set, empty defaults otherwise
// =============================================================================

export function getTokenStats(): TokenStats {
  if (_provider) return _provider.getTokenStats();
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCost: 0 };
}

export function addTokenStatsListener(callback: (stats: TokenStats) => void): void {
  if (_provider) return _provider.addTokenStatsListener(callback);
}

export function getBackgroundTasks(): BackgroundTask[] {
  if (_provider) return _provider.getBackgroundTasks();
  return [];
}

export function setBackgroundTaskStartCallback(callback: (task: BackgroundTask) => void): void {
  if (_provider) return _provider.setBackgroundTaskStartCallback(callback);
}

export function setBackgroundTaskCallback(callback: (task: BackgroundTask) => void): void {
  if (_provider) return _provider.setBackgroundTaskCallback(callback);
}

export function processOTLPLogs(body: unknown): void {
  if (_provider) return _provider.processOTLPLogs(body);
}

export function processOTLPMetrics(body: unknown): void {
  if (_provider) return _provider.processOTLPMetrics(body);
}

export function processOTLPTraces(body: unknown): void {
  if (_provider) return _provider.processOTLPTraces(body);
}

export function getAuditLog(): AuditLogEntry[] {
  if (_provider) return _provider.getAuditLog();
  return [];
}

export function getToolEventsFiltered(opts?: unknown): ToolEvent[] {
  if (_provider) return _provider.getToolEventsFiltered(opts);
  return [];
}

export function getToolTypes(): string[] {
  if (_provider) return _provider.getToolTypes();
  return [];
}

export function getAuditLogStats(): Record<string, unknown> {
  if (_provider) return _provider.getAuditLogStats();
  return {};
}

export function exportAuditLogAsJSON(toolType?: string): string {
  if (_provider) return _provider.exportAuditLogAsJSON(toolType);
  return '[]';
}

export function exportAuditLogAsCSV(toolType?: string): string {
  if (_provider) return _provider.exportAuditLogAsCSV(toolType);
  return '';
}

export function resetEventStore(): void {
  if (_provider) return _provider.resetEventStore();
}

// =============================================================================
// Plain stubs — NOT used by core's API routes, only imported directly by cyclist
// =============================================================================

export function getBackgroundTaskByToolId(_toolId: string): BackgroundTask | undefined {
  return undefined;
}

export function trackBackgroundTask(_task: Partial<BackgroundTask>): void {}
export function completeBackgroundTask(_taskId: string, _success: boolean, _result?: string, _error?: string): BackgroundTask | undefined {
  return undefined;
}

export function addToolEventListener(_callback: (event: ToolEvent) => void): void {}

export function getUserEmail(): string | null {
  return null;
}

export function isOtelDebugEnabled(): boolean {
  return false;
}

export function clearAuditLog(): void {}

export function parseOTLPMetrics(_body: unknown): unknown { return null; }
export function aggregateTokenStats(_data: unknown): TokenStats { return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCost: 0 }; }
export function parseOTLPLogs(_body: unknown): unknown { return null; }
export function processLogEvents(_events: unknown): void {}
