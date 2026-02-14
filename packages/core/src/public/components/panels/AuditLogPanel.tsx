/**
 * AuditLogPanel - Tool execution audit log viewer
 *
 * Features:
 * - View tool events with filtering by type and status
 * - Real-time updates via WebSocket
 * - Export as JSON or CSV
 * - Statistics display
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

// =============================================================================
// Types
// =============================================================================

interface DiffSummary {
  added: number;
  removed: number;
}

interface OutputSummary {
  firstLines: string[];
  lastLines: string[];
  totalLines: number;
  truncated: boolean;
}

interface ToolEvent {
  toolName: string;
  input?: string;
  output?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  timestamp: number;
  // File enrichment (Read/Edit/Write)
  filePath?: string;
  fileSize?: number;
  lineCount?: number;
  language?: string;
  gitStatus?: 'clean' | 'modified' | 'new' | 'untracked' | null;
  diff?: DiffSummary;
  // Bash enrichment
  command?: string;
  exitCode?: number | null;
  outputSummary?: OutputSummary;
  workingDirectory?: string;
  // Task enrichment
  subagentType?: string;
  promptSummary?: string;
  resultSummary?: string;
  isBackground?: boolean;
}

interface AuditLogStats {
  total: number;
  byType: Record<string, number>;
  successCount: number;
  errorCount: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateInput(input: string | undefined, maxLength = 60): string {
  if (!input) return '-';
  if (input.length <= maxLength) return input;
  return input.substring(0, maxLength) + '...';
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFilePath(path: string | undefined): string {
  if (!path) return '';
  // Show last 3 segments for brevity
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return '.../' + parts.slice(-3).join('/');
}

/** Render enrichment detail rows as label/value pairs */
function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={mono ? 'detail-value font-mono' : 'detail-value'}>{value}</span>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function AuditLogPanel(): React.ReactElement {
  const [entries, setEntries] = useState<ToolEvent[]>([]);
  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [toolTypes, setToolTypes] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  // Auto-scroll refs (using ref instead of state for synchronous updates)
  const autoScrollRef = useRef(true);
  const topRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Detect manual scroll to pause/resume auto-scroll
  // Re-runs when loading changes so the listener attaches after the scroll container renders
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = () => {
      autoScrollRef.current = el.scrollTop === 0;
    };
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, [loading]);

  // Auto-scroll to newest entry when entries change
  useEffect(() => {
    if (autoScrollRef.current && topRef.current && entries.length > 0) {
      topRef.current.scrollIntoView();
    }
  }, [entries]);

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedType) params.set('toolType', selectedType);
      if (selectedStatus) params.set('status', selectedStatus);
      params.set('limit', '200');

      const response = await fetch(`/api/audit-log?${params}`);
      if (!response.ok) throw new Error('Failed to fetch audit log');
      const data = await response.json();
      setEntries(data.entries || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [selectedType, selectedStatus]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/audit-log/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('[AuditLogPanel] Stats error:', err);
    }
  }, []);

  // Fetch tool types
  const fetchTypes = useCallback(async () => {
    try {
      const response = await fetch('/api/audit-log/types');
      if (!response.ok) throw new Error('Failed to fetch types');
      const data = await response.json();
      setToolTypes(data.types || []);
    } catch (err) {
      console.error('[AuditLogPanel] Types error:', err);
    }
  }, []);

  // Initial load and WebSocket subscription
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEntries(), fetchStats(), fetchTypes()]).finally(() => {
      setLoading(false);
    });

    // Subscribe to real-time updates via spans WebSocket
    const ws = new WebSocket(`ws://${window.location.host}/ws/spans`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'span' && data.span) {
          // Add new entry at the beginning
          setEntries(prev => [data.span, ...prev].slice(0, 200));
          // Refresh stats
          fetchStats();
        }
      } catch (err) {
        console.error('[AuditLogPanel] WebSocket parse error:', err);
      }
    };

    return () => ws.close();
  }, [fetchEntries, fetchStats, fetchTypes]);

  // Refetch when filters change
  useEffect(() => {
    fetchEntries();
  }, [selectedType, selectedStatus, fetchEntries]);

  // Export handler
  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      params.set('download', 'true');
      if (selectedType) params.set('toolType', selectedType);

      const response = await fetch(`/api/audit-log/export?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[AuditLogPanel] Export error:', err);
    }
  };

  // Clear handler
  const handleClear = async () => {
    if (!confirm('Clear all audit log entries?')) return;
    try {
      const response = await fetch('/api/audit-log', { method: 'DELETE' });
      if (!response.ok) throw new Error('Clear failed');
      setEntries([]);
      fetchStats();
    } catch (err) {
      console.error('[AuditLogPanel] Clear error:', err);
    }
  };

  if (loading) {
    return (
      <div className="audit-log-panel p-4 space-y-3">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Separator />
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="audit-log-panel p-4">
        <div className="text-error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="audit-log-panel flex flex-col h-full">
    <TooltipProvider delayDuration={300}>
      {/* Stats Bar */}
      {stats && (
        <>
          <div className="audit-log-stats flex gap-4 p-2 text-sm">
            <span className="text-muted">Total: <strong>{stats.total}</strong></span>
            <span className="text-success">Success: <strong>{stats.successCount}</strong></span>
            <span className="text-error">Errors: <strong>{stats.errorCount}</strong></span>
          </div>
          <Separator />
        </>
      )}

      {/* Filters and Actions */}
      <div className="audit-log-toolbar flex p-2 items-center">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="">All Tools</option>
          {toolTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Errors</option>
        </select>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="audit-log-btn" onClick={() => handleExport('json')}>
              JSON
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export as JSON</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="audit-log-btn" onClick={() => handleExport('csv')}>
              CSV
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export as CSV</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="audit-log-btn audit-log-btn-clear" onClick={handleClear}>
              Clear
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear audit log</TooltipContent>
        </Tooltip>
      </div>

      {/* Entries List */}
      <div ref={scrollContainerRef} className="audit-log-entries flex-1" style={{ overflow: 'auto' }}>
        <div ref={topRef} />
        {entries.length === 0 ? (
          <div className="p-4 text-muted text-center">No entries</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="text-left">Time</th>
                <th className="text-left">Tool</th>
                <th className="text-left">Input</th>
                <th className="text-right">Duration</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <React.Fragment key={`${entry.timestamp}-${idx}`}>
                  <tr
                    className={expandedEntry === idx ? 'expanded' : ''}
                    onClick={() => setExpandedEntry(expandedEntry === idx ? null : idx)}
                  >
                    <td className="whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="tool-name font-mono" data-tool={entry.toolName.toLowerCase()}>{entry.toolName}</td>
                    <td className="truncate max-w-[200px]">
                      {entry.input ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{truncateInput(entry.input)}</span>
                          </TooltipTrigger>
                          <TooltipContent>{entry.input}</TooltipContent>
                        </Tooltip>
                      ) : (
                        truncateInput(entry.input)
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {formatDuration(entry.durationMs)}
                    </td>
                    <td className="text-center">
                      {entry.success ? (
                        <span className="status-ok">✓</span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="status-err">✗</span>
                          </TooltipTrigger>
                          <TooltipContent>{entry.error}</TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                  {expandedEntry === idx && (
                    <tr className="expanded-detail">
                      <td colSpan={5}>
                        <div className="detail-grid">
                          {/* Common fields */}
                          <DetailRow label="Tool" value={entry.toolName} />
                          <DetailRow label="Duration" value={entry.durationMs !== undefined ? formatDuration(entry.durationMs) : undefined} />
                          {entry.exitCode !== undefined && entry.exitCode !== null && (
                            <DetailRow label="Exit Code" value={entry.exitCode} mono />
                          )}

                          {/* File enrichment (Read/Edit/Write) */}
                          <DetailRow label="File" value={entry.filePath} mono />
                          {entry.language && <DetailRow label="Language" value={entry.language} />}
                          {entry.fileSize !== undefined && <DetailRow label="Size" value={formatBytes(entry.fileSize)} />}
                          {entry.lineCount !== undefined && <DetailRow label="Lines" value={entry.lineCount.toLocaleString()} />}
                          {entry.gitStatus && <DetailRow label="Git" value={entry.gitStatus} />}
                          {entry.diff && (
                            <DetailRow label="Diff" value={
                              <span>
                                <span style={{color: 'var(--success, #22c55e)'}}>+{entry.diff.added}</span>
                                {' '}
                                <span style={{color: 'var(--error, #ef4444)'}}>-{entry.diff.removed}</span>
                              </span>
                            } />
                          )}

                          {/* Bash enrichment */}
                          {entry.command && <DetailRow label="Command" value={entry.command} mono />}
                          {entry.workingDirectory && <DetailRow label="CWD" value={formatFilePath(entry.workingDirectory)} mono />}

                          {/* Task enrichment */}
                          {entry.subagentType && <DetailRow label="Agent" value={entry.subagentType} />}
                          {entry.isBackground && <DetailRow label="Background" value="Yes" />}
                          {entry.promptSummary && <DetailRow label="Prompt" value={entry.promptSummary} />}
                          {entry.resultSummary && <DetailRow label="Result" value={entry.resultSummary} />}
                        </div>

                        {/* Output summary (Bash) */}
                        {entry.outputSummary && entry.outputSummary.totalLines > 0 && (
                          <div className="detail-output">
                            <div className="detail-label">Output ({entry.outputSummary.totalLines} lines{entry.outputSummary.truncated ? ', truncated' : ''})</div>
                            <pre>{entry.outputSummary.firstLines.join('\n')}{entry.outputSummary.truncated && entry.outputSummary.lastLines.length > 0 ? '\n...\n' + entry.outputSummary.lastLines.join('\n') : ''}</pre>
                          </div>
                        )}

                        {/* Raw input (fallback when no enrichment) */}
                        {entry.input && !entry.command && !entry.filePath && !entry.subagentType && (
                          <div className="detail-output">
                            <div className="detail-label">Input</div>
                            <pre>{entry.input}</pre>
                          </div>
                        )}

                        {/* Raw output (when no outputSummary) */}
                        {entry.output && !entry.outputSummary && (
                          <div className="detail-output">
                            <div className="detail-label">Output</div>
                            <pre>{entry.output.substring(0, 500)}{entry.output.length > 500 && '...'}</pre>
                          </div>
                        )}

                        {/* Error */}
                        {entry.error && (
                          <div className="detail-output">
                            <div className="detail-label status-err">Error</div>
                            <pre className="status-err">{entry.error}</pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TooltipProvider>
    </div>
  );
}

export default AuditLogPanel;
