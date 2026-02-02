/**
 * DebugPanel - Debug/diagnostic info including OTEL telemetry
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12799 - Tier display
 * Story MSSCI-12782 - OTEL spans display and token stats formatting
 */

import React, { useState, useEffect } from 'react';

/** Context tier type */
type ContextTier = 'FULL' | 'REFRESH' | 'HANDOFF' | 'MINIMAL';

interface ContextData {
  used?: number;
  total?: number;
  percent?: number;
  /** System prompt overhead (first turn tokens) */
  baseline?: number;
  /** Tokens used by conversation (total - baseline) */
  usableTokens?: number;
  /** Conversation usage as % of available capacity */
  usablePercent?: number;
  /** Available capacity (max - baseline) */
  available?: number;
  /** Current context tier */
  tier?: ContextTier;
  /** Per-component token counts (MSSCI-12800) */
  tokenCounts?: Record<string, number>;
  /** Total tokens across all injected components (MSSCI-12800) */
  totalTokens?: number;
}

/** OTEL tool event from auditLog API */
interface ToolEvent {
  toolName: string;
  input?: string;
  output?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

/** Grouped spans by tool type */
interface ToolGroup {
  toolName: string;
  spans: ToolEvent[];
  totalDurationMs: number;
  successCount: number;
  errorCount: number;
}

/**
 * Format a component name from snake_case to Title Case
 *
 * Examples:
 * - agent_definition → Agent Definition
 * - behavior_guide → Behavior Guide
 * - persona_compressed → Persona (Compressed)
 * - session_header → Session Header
 *
 * @param name - Component name in snake_case
 * @returns Formatted component name in Title Case
 */
export function formatComponentName(name: string): string {
  // Handle special case for compressed persona
  if (name === 'persona_compressed') {
    return 'Persona (Compressed)';
  }

  // Convert snake_case to Title Case
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Calculate token savings percentage for a given tier vs FULL
 *
 * Token estimates:
 * - FULL: ~4000 tokens (baseline)
 * - REFRESH: ~600 tokens (85% savings)
 * - HANDOFF: ~700 tokens (82% savings)
 * - MINIMAL: ~200 tokens (95% savings)
 */
export function calculateTierSavings(tier: ContextTier | undefined): number {
  if (!tier) return 0;

  switch (tier) {
    case 'FULL':
      return 0;
    case 'REFRESH':
      return 85;
    case 'HANDOFF':
      return 82;
    case 'MINIMAL':
      return 95;
    default:
      return 0;
  }
}

/**
 * Format duration in ms to human-readable string
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Group spans by tool type and calculate aggregates
 */
function groupSpansByTool(spans: ToolEvent[]): ToolGroup[] {
  const groups: Record<string, ToolGroup> = {};

  for (const span of spans) {
    if (!groups[span.toolName]) {
      groups[span.toolName] = {
        toolName: span.toolName,
        spans: [],
        totalDurationMs: 0,
        successCount: 0,
        errorCount: 0,
      };
    }
    const group = groups[span.toolName];
    group.spans.push(span);
    group.totalDurationMs += span.durationMs || 0;
    if (span.success) {
      group.successCount++;
    } else {
      group.errorCount++;
    }
  }

  // Sort spans within each group by timestamp (chronological)
  for (const group of Object.values(groups)) {
    group.spans.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Return groups sorted by total span count descending
  return Object.values(groups).sort((a, b) => b.spans.length - a.spans.length);
}

/**
 * Truncate path to show just the filename or last part
 */
function truncatePath(input: string | undefined, maxLength = 40): string {
  if (!input) return '—';
  if (input.length <= maxLength) return input;
  // For file paths, show the end (filename)
  if (input.includes('/')) {
    const parts = input.split('/');
    const filename = parts[parts.length - 1];
    if (filename.length <= maxLength) return filename;
    return '...' + filename.slice(-maxLength + 3);
  }
  return input.slice(0, maxLength - 3) + '...';
}

export function DebugPanel(): React.ReactElement {
  const [context, setContext] = useState<ContextData | null>(null);
  const [tokenStats, setTokenStats] = useState<Record<string, unknown> | null>(null);
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);

  // OTEL spans state (MSSCI-12782)
  const [spans, setSpans] = useState<ToolEvent[]>([]);
  const [toolFilter, setToolFilter] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Connect to context WebSocket
    const contextWs = new WebSocket(`${protocol}//${window.location.host}/ws/context`);
    contextWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          setContext(data.context as ContextData);
        }
      } catch {
        // Ignore parse errors
      }
    };

    // Connect to token-stats WebSocket
    const tokenWs = new WebSocket(`${protocol}//${window.location.host}/ws/token-stats`);
    tokenWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setTokenStats(data as Record<string, unknown>);
      } catch {
        // Ignore parse errors
      }
    };

    // Connect to spans WebSocket for OTEL tool events
    const spansWs = new WebSocket(`${protocol}//${window.location.host}/ws/spans`);
    spansWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' && data.spans) {
          setSpans(data.spans as ToolEvent[]);
        } else if (data.type === 'span' && data.span) {
          setSpans(prev => [...prev, data.span as ToolEvent]);
        }
      } catch {
        // Ignore parse errors
      }
    };

    return () => {
      contextWs.close();
      tokenWs.close();
      spansWs.close();
    };
  }, []);

  // Toggle group expansion
  const toggleGroup = (toolName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  // Get unique tool types for filter dropdown
  const toolTypes = Array.from(new Set(spans.map(s => s.toolName))).sort();

  // Group and filter spans
  const filteredSpans = toolFilter
    ? spans.filter(s => s.toolName === toolFilter)
    : spans;
  const toolGroups = groupSpansByTool(filteredSpans);

  // Compute tier-specific CSS class
  const tierClass = context?.tier ? `tier-${context.tier.toLowerCase()}` : '';
  const tierSavings = calculateTierSavings(context?.tier);

  return (
    <div className="debug-panel" data-testid="debug-panel">
      <h4>Context Usage</h4>
      {context ? (
        <div className="context-info">
          {context.tier && (
            <div className="tier-display">
              <span
                className={`tier-badge ${tierClass}`}
                data-testid="tier-badge"
              >
                {context.tier}
              </span>
              <span className="tier-savings" data-testid="tier-savings">
                {tierSavings}% savings
              </span>
            </div>
          )}
          {context.tokenCounts && Object.keys(context.tokenCounts).length > 0 && (
            <div className="component-breakdown" data-testid="component-breakdown">
              <div className="breakdown-header">
                <button
                  className="breakdown-toggle"
                  data-testid="breakdown-toggle"
                  onClick={() => setBreakdownExpanded(!breakdownExpanded)}
                  aria-expanded={breakdownExpanded}
                >
                  {breakdownExpanded ? '▼' : '▶'} Injected Context
                </button>
                <span className="total-tokens" data-testid="total-tokens">
                  {context.totalTokens?.toLocaleString()} tokens
                </span>
              </div>
              <div
                className={`component-list ${breakdownExpanded ? 'expanded' : 'collapsed'}`}
                data-testid="component-list"
                aria-expanded={breakdownExpanded}
              >
                {/* Sort components by token count descending, filter out zero values */}
                {Object.entries(context.tokenCounts)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => (
                    <div
                      key={name}
                      className="component-item"
                      data-testid={`component-${name}`}
                    >
                      <span className="component-name">
                        {formatComponentName(name)}
                      </span>
                      <span className="component-tokens">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <div className="context-bar">
            <div
              className="context-fill"
              style={{ width: `${context.percent || 0}%` }}
            />
          </div>
          <span className="context-text">
            {context.used?.toLocaleString()} / {context.total?.toLocaleString()} tokens
            ({context.percent || 0}%)
          </span>
          {context.baseline != null && (
            <dl className="context-breakdown">
              <dt>System Prompt</dt>
              <dd>{context.baseline.toLocaleString()} tokens</dd>
              <dt>Conversation</dt>
              <dd>{context.usableTokens?.toLocaleString() ?? '—'} tokens</dd>
              <dt>Available</dt>
              <dd>{context.available?.toLocaleString() ?? '—'} tokens</dd>
            </dl>
          )}
        </div>
      ) : (
        <div className="placeholder">No context data</div>
      )}

      <h4>Token Stats</h4>
      {tokenStats ? (
        <dl className="token-stats">
          {tokenStats.inputTokens !== undefined && (
            <div className="token-stat-card" data-testid="token-stat-input">
              <dt>Input</dt>
              <dd>{Number(tokenStats.inputTokens).toLocaleString()}</dd>
            </div>
          )}
          {tokenStats.outputTokens !== undefined && (
            <div className="token-stat-card" data-testid="token-stat-output">
              <dt>Output</dt>
              <dd>{Number(tokenStats.outputTokens).toLocaleString()}</dd>
            </div>
          )}
          {tokenStats.cacheReadTokens !== undefined && (
            <div className="token-stat-card" data-testid="token-stat-cache-read">
              <dt>Cache Read</dt>
              <dd>{Number(tokenStats.cacheReadTokens).toLocaleString()}</dd>
            </div>
          )}
          {tokenStats.cacheCreationTokens !== undefined && (
            <div className="token-stat-card" data-testid="token-stat-cache-write">
              <dt>Cache Write</dt>
              <dd>{Number(tokenStats.cacheCreationTokens).toLocaleString()}</dd>
            </div>
          )}
          {tokenStats.totalCostUsd !== undefined && Number(tokenStats.totalCostUsd) > 0 && (
            <div className="token-stat-card" data-testid="token-stat-cost">
              <dt>Cost</dt>
              <dd>${Number(tokenStats.totalCostUsd).toFixed(4)}</dd>
            </div>
          )}
        </dl>
      ) : (
        <div className="placeholder">No token stats</div>
      )}

      {/* OTEL Spans Section - MSSCI-12782 */}
      <h4>Tool Calls ({spans.length} {spans.length === 1 ? 'span' : 'spans'})</h4>
      <div className="otel-spans-section" data-testid="otel-spans-section">
        {/* Filter dropdown */}
        {toolTypes.length > 0 && (
          <select
            className="otel-filter"
            data-testid="otel-filter"
            value={toolFilter}
            onChange={e => setToolFilter(e.target.value)}
          >
            <option value="">All Tools</option>
            {toolTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        )}

        {/* Tool groups */}
        {toolGroups.length === 0 ? (
          <div className="placeholder">No tool calls yet</div>
        ) : (
          <div className="tool-groups">
            {toolGroups.map(group => {
              const isExpanded = expandedGroups.has(group.toolName);
              return (
                <div
                  key={group.toolName}
                  className="tool-group"
                  data-testid={`tool-group-${group.toolName}`}
                >
                  <div className="tool-group-header">
                    <button
                      className="tool-group-toggle"
                      data-testid={`tool-group-${group.toolName}-toggle`}
                      onClick={() => toggleGroup(group.toolName)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? '▼' : '▶'} {group.toolName}
                    </button>
                    <span className="tool-group-count">
                      {group.spans.length}
                    </span>
                    <span className="tool-group-duration">
                      {formatDuration(group.totalDurationMs)}
                    </span>
                    {group.errorCount > 0 && (
                      <span className="tool-group-errors">
                        {group.errorCount} error{group.errorCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div
                    className={`tool-group-items ${isExpanded ? 'expanded' : 'collapsed'}`}
                    data-testid={`tool-group-${group.toolName}-items`}
                    aria-expanded={isExpanded}
                  >
                    {group.spans.map((span, idx) => (
                      <div
                        key={`${span.timestamp}-${idx}`}
                        className={`span-item ${span.success ? 'success' : 'error'}`}
                        data-testid={`span-item-${idx}`}
                      >
                        <span
                          className="span-status"
                          data-testid={span.success ? 'span-status-success' : 'span-status-error'}
                        >
                          {span.success ? '✓' : '✗'}
                        </span>
                        <span className="span-input" data-testid={`span-input-${idx}`}>
                          {truncatePath(span.input)}
                        </span>
                        <span className="span-duration">
                          {formatDuration(span.durationMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DebugPanel;
