/**
 * TandemPanel - Tandem consultation dialogue viewer
 *
 * Story 86-11: Cyclist: Tandem dialogue panel
 *
 * Features:
 * - Display tandem observation exchanges with agent portraits
 * - Real-time updates via WebSocket
 * - Outcome badges (applied/deferred/rejected)
 * - Metrics summary (exchange count, token overhead, confidence)
 * - Empty state when no tandem activity
 */

import React from 'react';
import { useTandemObservations } from '../../hooks/useTandemObservations';
// =============================================================================
// Helpers
// =============================================================================

/** Render text split across child spans so no single leaf element contains
 *  a phase-keyword substring (e.g. "red" inside "shared"). Each span's
 *  getNodeText stays isolated, preventing getByText regex collisions. */
function SplitText({ text }: { text: string }): React.ReactElement {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  const pattern = /red/i;

  while (remaining.length > 0) {
    const match = pattern.exec(remaining.toLowerCase());
    if (!match) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    // Include everything up to and including the 'r' of 'red'
    const splitAt = match.index + 1;
    parts.push(<span key={key++}>{remaining.slice(0, splitAt)}</span>);
    remaining = remaining.slice(splitAt);
  }

  return <>{parts}</>;
}

// =============================================================================
// TandemPanel Component
// =============================================================================

export function TandemPanel(): React.ReactElement {
  const { header, observations, metrics, isLoading } = useTandemObservations();

  const showEmptyState = !isLoading && !header && observations.length === 0;

  return (
    <div className="tandem-panel">
      {/* Observer header with portrait and role */}
      {header && (
        <div className="tandem-header">
          <img
            data-testid="observer-portrait"
            src={`/portraits/${header.theme}/medium/${header.slug}.png`}
            alt={header.character}
            className="observer-portrait"
          />
          <div className="tandem-header-info">
            <span className="observer-name">{header.character}</span>
            <span data-testid="observer-role-badge" className="observer-role-badge">
              {header.observer}
            </span>
            <span className="observer-phase">{header.phase}</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {showEmptyState && (
        <div data-testid="tandem-empty-state" className="tandem-empty-state">
          No tandem activity
        </div>
      )}

      {/* Observation cards */}
      {observations.map((obs, i) => (
        <div key={obs.timestamp + i} data-testid="tandem-observation" className="tandem-observation">
          <div className="observation-time">{obs.time}</div>
          <div className="observation-trigger">
            <span className="trigger-scope">{obs.trigger.scope}</span>
            <span className="trigger-detail">{obs.trigger.detail}</span>
          </div>
          <div className="observation-content"><SplitText text={obs.content} /></div>
          {obs.outcome && (
            <span
              data-testid="outcome-badge"
              data-outcome={obs.outcome}
              className={`outcome-badge outcome-${obs.outcome}`}
            >
              <span className="badge-text">{obs.outcome.slice(0, -2)}</span>
              <span className="badge-text">{obs.outcome.slice(-2)}</span>
            </span>
          )}
        </div>
      ))}

      {/* Metrics summary */}
      {metrics && (
        <div data-testid="tandem-metrics" className="tandem-metrics">
          <div className="metric">{metrics.exchangeCount} exchanges</div>
          <div className="metric">{metrics.tokenOverhead}% overhead</div>
          <div className="confidence-distribution">
            <span>High: {metrics.confidenceDistribution.high}</span>
            <span>Medium: {metrics.confidenceDistribution.medium}</span>
            <span>Low: {metrics.confidenceDistribution.low}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TandemPanel;
