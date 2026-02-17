/**
 * useTandemObservations Hook
 *
 * React hook for subscribing to tandem observation data.
 * Story 86-11: Cyclist: Tandem dialogue panel
 *
 * Uses WebSocket /ws/tandem for real-time updates.
 * Parses .session/{story}-tandem-{partner}.md observation files.
 */

import { useState, useEffect, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface TandemTrigger {
  scope: string;   // file-watch, tool-watch, context-watch
  detail: string;  // specific trigger detail
}

export interface TandemObservation {
  timestamp: string;  // ISO timestamp
  time: string;       // HH:MM from section header
  trigger: TandemTrigger;
  content: string;    // observation text
  outcome?: 'applied' | 'deferred' | 'rejected';
  confidence?: number; // 0-1
}

export interface TandemHeader {
  storyId: string;
  observer: string;    // agent role (e.g., "architect")
  character: string;   // persona character name (e.g., "The Man in Black")
  phase: string;       // workflow phase
  startedAt: string;   // ISO timestamp
  theme?: string;      // theme slug for portrait resolution
  slug?: string;       // character slug for portrait image
}

export interface TandemMetrics {
  exchangeCount: number;
  tokenOverhead: number; // percentage
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  outcomeBreakdown: {
    applied: number;
    deferred: number;
    rejected: number;
  };
}

export interface UseTandemObservationsResult {
  header: TandemHeader | null;
  observations: TandemObservation[];
  metrics: TandemMetrics | null;
  isLoading: boolean;
  error: Error | null;
}

/** WebSocket message format from /ws/tandem */
export interface TandemMessage {
  type: 'init' | 'observation' | 'metrics' | 'clear';
  header?: TandemHeader;
  observations?: TandemObservation[];
  observation?: TandemObservation;
  metrics?: TandemMetrics;
}

// =============================================================================
// Hook
// =============================================================================

export function useTandemObservations(): UseTandemObservationsResult {
  // Stub: returns empty state — implementation pending
  const [header] = useState<TandemHeader | null>(null);
  const [observations] = useState<TandemObservation[]>([]);
  const [metrics] = useState<TandemMetrics | null>(null);
  const [isLoading] = useState(true);
  const [error] = useState<Error | null>(null);

  return { header, observations, metrics, isLoading, error };
}
