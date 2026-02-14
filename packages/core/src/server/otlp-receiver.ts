/**
 * OTLP receiver stub for server module.
 * Provides functions/types used by API routes without cyclist OTLP dependency.
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
  success?: boolean;
  isBackground?: boolean;
  [key: string]: unknown;
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

export function getTokenStats(): TokenStats {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCost: 0 };
}

export function addTokenStatsListener(_callback: (stats: TokenStats) => void): void {}

export function getBackgroundTasks(): BackgroundTask[] {
  return [];
}

export function getBackgroundTaskByToolId(_toolId: string): BackgroundTask | undefined {
  return undefined;
}

export function setBackgroundTaskStartCallback(_callback: (task: BackgroundTask) => void): void {}
export function setBackgroundTaskCallback(_callback: (task: BackgroundTask) => void): void {}

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

export function getAuditLog(): AuditLogEntry[] {
  return [];
}

export function clearAuditLog(): void {}

export function processOTLPLogs(_body: unknown): void {}
export function processOTLPMetrics(_body: unknown): void {}
export function processOTLPTraces(_body: unknown): void {}

// Additional exports used by API routes
export function getToolEventsFiltered(_opts?: unknown): ToolEvent[] { return []; }
export function getToolTypes(): string[] { return []; }
export function getAuditLogStats(): Record<string, unknown> { return {}; }
export function exportAuditLogAsJSON(): string { return '[]'; }
export function exportAuditLogAsCSV(): string { return ''; }
export function resetEventStore(): void {}
export function parseOTLPMetrics(_body: unknown): unknown { return null; }
export function aggregateTokenStats(_data: unknown): TokenStats { return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalCost: 0 }; }
export function parseOTLPLogs(_body: unknown): unknown { return null; }
export function processLogEvents(_events: unknown): void {}
