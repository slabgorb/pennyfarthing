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

import React, { useState } from 'react';
import { useTandemObservations } from '../../hooks/useTandemObservations';

// =============================================================================
// TandemPanel Component
// =============================================================================

export function TandemPanel(): React.ReactElement {
  const { header, observations, metrics, isLoading, error } = useTandemObservations();
  const [portraitError, setPortraitError] = useState(false);

  const showEmptyState = !isLoading && !error && !header && observations.length === 0;

  return (
    <div className="tandem-panel">
      {/* Error state */}
      {error && (
        <div data-testid="tandem-error" className="tandem-error">
          Connection failed — tandem data unavailable
        </div>
      )}

      {/* Observer header with portrait and role */}
      {header && (
        <div className="tandem-header">
          {!portraitError ? (
            <img
              data-testid="observer-portrait"
              src={`/portraits/${header.theme}/medium/${header.slug}.png`}
              alt={header.character}
              className="observer-portrait"
              onError={() => setPortraitError(true)}
            />
          ) : (
            <span data-testid="observer-portrait" className="observer-portrait-fallback" aria-hidden="true">🤖</span>
          )}
          <div className="tandem-header-info">
            <span className="observer-name">{header.character}</span>
            <span data-testid="observer-role-badge" className="observer-role-badge">
              {header.observer}
            </span>
            <span data-testid="observer-phase" className="observer-phase">{header.phase}</span>
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
          <div className="observation-content">{obs.content}</div>
          {obs.outcome && (
            <span
              data-testid="outcome-badge"
              data-outcome={obs.outcome}
              className={`outcome-badge outcome-${obs.outcome}`}
            >
              {obs.outcome}
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
