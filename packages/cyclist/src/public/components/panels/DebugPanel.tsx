/**
 * DebugPanel - Context usage and token stats display
 *
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12799 - Tier display
 * Story MSSCI-12782 - Token stats formatting
 *
 * Note: Tool call display moved to AuditLogPanel for comprehensive view.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { HotspotsDialog } from '../dialogs/HotspotsDialog';
import { CodeMarkersDialog } from '../dialogs/CodeMarkersDialog';
import { ComplexityDialog } from '../dialogs/ComplexityDialog';
import { DependenciesDialog } from '../dialogs/DependenciesDialog';
import { AgentLoadDialog } from '../AgentLoadDialog';
import { DeadCodeDialog } from '../DeadCodeDialog';
import { HealthGauge } from '../HealthGauge';
import { useHealthScore } from '../../hooks/useHealthScore';

/** Context tier type */
type ContextTier = 'FULL' | 'REFRESH' | 'HANDOFF' | 'MINIMAL';

/** Matches ContextInfo shape from api/context.ts */
interface ContextData {
  /** Used tokens (from check-context.sh CONTEXT_TOKENS) */
  tokens?: number | null;
  percent?: number | null;
  status?: string | null;
  error?: string | null;
  /** System prompt overhead (first turn tokens) */
  baseline?: number | null;
  /** Tokens used by conversation (total - baseline) */
  usableTokens?: number | null;
  /** Conversation usage as % of available capacity */
  usablePercent?: number | null;
  /** Available capacity (max - baseline) */
  available?: number | null;
  /** Current context tier */
  tier?: ContextTier;
  /** Per-component token counts (MSSCI-12800) */
  tokenCounts?: Record<string, number>;
  /** Total tokens across all injected components (MSSCI-12800) */
  totalTokens?: number;
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

export function DebugPanel(): React.ReactElement {
  const [context, setContext] = useState<ContextData | null>(null);
  const [tokenStats, setTokenStats] = useState<Record<string, unknown> | null>(null);
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const [hotspotsOpen, setHotspotsOpen] = useState(false);
  const [codeMarkersOpen, setCodeMarkersOpen] = useState(false);
  const [complexityOpen, setComplexityOpen] = useState(false);
  const [dependenciesOpen, setDependenciesOpen] = useState(false);
  const [agentLoadOpen, setAgentLoadOpen] = useState(false);
  const [deadCodeOpen, setDeadCodeOpen] = useState(false);
  const healthScore = useHealthScore();

  const handleDimensionClick = (dimensionName: string) => {
    switch (dimensionName) {
      case 'churn':
      case 'test_gaps':
        setHotspotsOpen(true);
        break;
      case 'todo_density':
      case 'deprecation_debt':
        setCodeMarkersOpen(true);
        break;
      case 'complexity':
        setComplexityOpen(true);
        break;
      case 'dead_code':
        setDeadCodeOpen(true);
        break;
      case 'dependency_freshness':
        setDependenciesOpen(true);
        break;
      case 'agent_context_efficiency':
        setAgentLoadOpen(true);
        break;
    }
  };

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

    return () => {
      contextWs.close();
      tokenWs.close();
    };
  }, []);

  // Compute tier-specific CSS class
  const tierClass = context?.tier ? `tier-${context.tier.toLowerCase()}` : '';
  const tierSavings = calculateTierSavings(context?.tier);

  return (
    <div className="debug-panel" data-testid="debug-panel">
      <HealthGauge
        score={healthScore.data?.composite_score ?? null}
        dimensions={healthScore.data?.dimensions ?? []}
        totalDimensions={8}
        onDimensionClick={handleDimensionClick}
      />

      <Separator className="my-3" />

      <h4>Context Usage</h4>
      {context ? (
        <div className="context-info">
          {context.tier && (
            <div className="tier-display">
              <Badge
                variant="outline"
                className={`tier-badge ${tierClass}`}
                data-testid="tier-badge"
              >
                {context.tier}
              </Badge>
              <span className="tier-savings" data-testid="tier-savings">
                {tierSavings}% savings
              </span>
            </div>
          )}
          {context.tokenCounts && Object.keys(context.tokenCounts).length > 0 && (
            <div className="component-breakdown" data-testid="component-breakdown">
              <div className="breakdown-header">
                <Button
                  variant="ghost"
                  size="sm"
                  className="breakdown-toggle"
                  data-testid="breakdown-toggle"
                  onClick={() => setBreakdownExpanded(!breakdownExpanded)}
                  aria-expanded={breakdownExpanded}
                >
                  {breakdownExpanded ? '▼' : '▶'} Injected Context
                </Button>
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
            {(context.tokens ?? 0).toLocaleString()} / {context.baseline != null && context.available != null
              ? (context.baseline + context.available).toLocaleString()
              : '—'} tokens
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

      <Separator className="my-3" />

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

      <Separator className="my-3" />

      <h4>Tools</h4>
      <div className="tool-launcher" data-testid="tool-launcher">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setHotspotsOpen(true)}
          data-testid="tool-launcher-hotspots"
        >
          Hotspots
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCodeMarkersOpen(true)}
          data-testid="tool-launcher-codemarkers"
        >
          Code Markers
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeadCodeOpen(true)}
          data-testid="tool-launcher-deadcode"
        >
          Dead Code
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setComplexityOpen(true)}
          data-testid="tool-launcher-complexity"
        >
          Complexity
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDependenciesOpen(true)}
          data-testid="tool-launcher-dependencies"
        >
          Dependencies
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAgentLoadOpen(true)}
          data-testid="tool-launcher-agent-load"
        >
          Analyze All Agents
        </Button>
      </div>

      <HotspotsDialog open={hotspotsOpen} onOpenChange={setHotspotsOpen} />
      <CodeMarkersDialog open={codeMarkersOpen} onOpenChange={setCodeMarkersOpen} />
      <ComplexityDialog open={complexityOpen} onOpenChange={setComplexityOpen} />
      <DependenciesDialog open={dependenciesOpen} onOpenChange={setDependenciesOpen} />
      <AgentLoadDialog isOpen={agentLoadOpen} onClose={() => setAgentLoadOpen(false)} />
      <DeadCodeDialog isOpen={deadCodeOpen} onClose={() => setDeadCodeOpen(false)} />
    </div>
  );
}

export default DebugPanel;
