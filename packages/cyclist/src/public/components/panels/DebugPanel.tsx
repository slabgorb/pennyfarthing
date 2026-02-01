/**
 * DebugPanel - Placeholder for debug/diagnostic info
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12799 - Tier display
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

export function DebugPanel(): React.ReactElement {
  const [context, setContext] = useState<ContextData | null>(null);
  const [tokenStats, setTokenStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Subscribe to context updates
    api.context?.get?.().then(data => {
      setContext(data as ContextData);
    });
    api.context?.onUpdate?.((_, data) => {
      setContext(data as ContextData);
    });

    // Subscribe to token stats
    api.tokenStats?.get?.().then(data => {
      setTokenStats(data as Record<string, unknown>);
    });
    api.tokenStats?.onUpdate?.((_, data) => {
      setTokenStats(data as Record<string, unknown>);
    });
  }, []);

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
            <>
              <dt>Input</dt>
              <dd>{Number(tokenStats.inputTokens).toLocaleString()}</dd>
            </>
          )}
          {tokenStats.outputTokens !== undefined && (
            <>
              <dt>Output</dt>
              <dd>{Number(tokenStats.outputTokens).toLocaleString()}</dd>
            </>
          )}
          {tokenStats.cacheReadTokens !== undefined && (
            <>
              <dt>Cache Read</dt>
              <dd>{Number(tokenStats.cacheReadTokens).toLocaleString()}</dd>
            </>
          )}
          {tokenStats.cacheCreationTokens !== undefined && (
            <>
              <dt>Cache Write</dt>
              <dd>{Number(tokenStats.cacheCreationTokens).toLocaleString()}</dd>
            </>
          )}
          {tokenStats.totalCostUsd !== undefined && Number(tokenStats.totalCostUsd) > 0 && (
            <>
              <dt>Cost</dt>
              <dd>${Number(tokenStats.totalCostUsd).toFixed(4)}</dd>
            </>
          )}
        </dl>
      ) : (
        <div className="placeholder">No token stats</div>
      )}
    </div>
  );
}

export default DebugPanel;
