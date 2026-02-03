/**
 * AuditLogPanel - Tool execution audit log viewer
 *
 * Features:
 * - View tool events with filtering by type and status
 * - Real-time updates via WebSocket
 * - Export as JSON or CSV
 * - Statistics display
 */

import React, { useState, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

interface ToolEvent {
  toolName: string;
  input?: string;
  output?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  timestamp: number;
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
      <div className="audit-log-panel p-4">
        <div className="text-muted">Loading audit log...</div>
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
      {/* Stats Bar */}
      {stats && (
        <div className="audit-log-stats flex gap-4 p-2 border-b border-border text-sm">
          <span className="text-muted">Total: <strong>{stats.total}</strong></span>
          <span className="text-success">Success: <strong>{stats.successCount}</strong></span>
          <span className="text-error">Errors: <strong>{stats.errorCount}</strong></span>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="audit-log-toolbar flex gap-2 p-2 border-b border-border items-center flex-wrap">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="audit-log-select px-2 py-1 bg-surface border border-border rounded text-sm"
        >
          <option value="">All Tools</option>
          {toolTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="audit-log-select px-2 py-1 bg-surface border border-border rounded text-sm"
        >
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Errors</option>
        </select>

        <div className="flex-1" />

        <button
          onClick={() => handleExport('json')}
          className="audit-log-btn px-2 py-1 bg-surface border border-border rounded text-sm hover:bg-hover"
          title="Export as JSON"
        >
          JSON
        </button>
        <button
          onClick={() => handleExport('csv')}
          className="audit-log-btn px-2 py-1 bg-surface border border-border rounded text-sm hover:bg-hover"
          title="Export as CSV"
        >
          CSV
        </button>
        <button
          onClick={handleClear}
          className="audit-log-btn px-2 py-1 bg-surface border border-error text-error rounded text-sm hover:bg-error hover:text-white"
          title="Clear audit log"
        >
          Clear
        </button>
      </div>

      {/* Entries List */}
      <div className="audit-log-entries flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="p-4 text-muted text-center">No entries</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border">
                <th className="p-2 text-left text-muted font-normal">Time</th>
                <th className="p-2 text-left text-muted font-normal">Tool</th>
                <th className="p-2 text-left text-muted font-normal">Input</th>
                <th className="p-2 text-right text-muted font-normal">Duration</th>
                <th className="p-2 text-center text-muted font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <React.Fragment key={`${entry.timestamp}-${idx}`}>
                  <tr
                    className={`border-b border-border/50 hover:bg-hover cursor-pointer ${
                      expandedEntry === idx ? 'bg-hover' : ''
                    }`}
                    onClick={() => setExpandedEntry(expandedEntry === idx ? null : idx)}
                  >
                    <td className="p-2 text-muted whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="p-2 font-mono">{entry.toolName}</td>
                    <td className="p-2 text-muted truncate max-w-[200px]" title={entry.input}>
                      {truncateInput(entry.input)}
                    </td>
                    <td className="p-2 text-right text-muted whitespace-nowrap">
                      {formatDuration(entry.durationMs)}
                    </td>
                    <td className="p-2 text-center">
                      {entry.success ? (
                        <span className="text-success">✓</span>
                      ) : (
                        <span className="text-error" title={entry.error}>✗</span>
                      )}
                    </td>
                  </tr>
                  {expandedEntry === idx && (
                    <tr className="bg-surface-alt">
                      <td colSpan={5} className="p-3">
                        <div className="space-y-2 text-sm">
                          {entry.input && (
                            <div>
                              <div className="text-muted text-xs mb-1">Input:</div>
                              <pre className="bg-surface p-2 rounded overflow-x-auto max-h-32 text-xs">
                                {entry.input}
                              </pre>
                            </div>
                          )}
                          {entry.output && (
                            <div>
                              <div className="text-muted text-xs mb-1">Output:</div>
                              <pre className="bg-surface p-2 rounded overflow-x-auto max-h-32 text-xs">
                                {entry.output.substring(0, 500)}
                                {entry.output.length > 500 && '...'}
                              </pre>
                            </div>
                          )}
                          {entry.error && (
                            <div>
                              <div className="text-error text-xs mb-1">Error:</div>
                              <pre className="bg-surface p-2 rounded text-error text-xs">
                                {entry.error}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AuditLogPanel;
