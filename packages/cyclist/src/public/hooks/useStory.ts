/**
 * useStory Hook
 *
 * React hook for subscribing to story/sprint data.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 *
 * Uses WebSocket /ws/story for real-time updates (no polling).
 */

import { useState, useEffect, useRef } from 'react';

// Import types from story-parser for criteria and workflow
import type { CriteriaItem, WorkflowPhase, AvailableWorkflow } from '../../../story-parser.js';

export interface StoryData {
  id: string;
  title: string;
  status?: string;
  phase?: string;
  workflow?: string;
  points?: number;
  epic?: string;
  // MSSCI-12849: AC and BikeLane panel data
  criteria?: CriteriaItem[] | null;
  workflowPhases?: WorkflowPhase[] | null;
  // MSSCI-14300: Distinguish phased vs stepped workflow rendering
  workflowType?: string;
}

// Re-export types for panel components
export type { CriteriaItem, WorkflowPhase, AvailableWorkflow };

interface UseStoryResult {
  story: StoryData | null;
  isLoading: boolean;
  error: Error | null;
  // MSSCI-14301: Available workflows for discovery panel
  availableWorkflows: AvailableWorkflow[] | null;
}

/** WebSocket message format from /ws/story */
interface StoryMessage {
  type: 'init' | 'update';
  id: string | null;
  title: string | null;
  phase?: string | null;
  status?: string | null;
  points?: number | null;
  workflow?: WorkflowPhase[] | null;
  workflowType?: string | null;
  criteria?: CriteriaItem[] | null;
  availableWorkflows?: AvailableWorkflow[] | null;
  [key: string]: unknown;
}

/** Transform WebSocket message to StoryData */
function transformMessage(msg: StoryMessage): StoryData | null {
  if (!msg.id) return null;
  return {
    id: msg.id,
    title: msg.title ?? '',
    status: msg.status ?? undefined,
    phase: msg.phase ?? undefined,
    points: msg.points ?? undefined,
    criteria: msg.criteria,
    workflowPhases: msg.workflow,
    workflowType: msg.workflowType ?? undefined,
  };
}

export function useStory(): UseStoryResult {
  const [story, setStory] = useState<StoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [availableWorkflows, setAvailableWorkflows] = useState<AvailableWorkflow[] | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/story`;

    const connect = () => {
      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
          console.debug('[useStory] WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as StoryMessage;
            if (msg.type === 'init' || msg.type === 'update') {
              setStory(transformMessage(msg));
              setAvailableWorkflows(msg.availableWorkflows ?? null);
              setIsLoading(false);
              setError(null);
            }
          } catch (err) {
            console.error('[useStory] Failed to parse message:', err);
          }
        };

        wsRef.current.onclose = () => {
          console.debug('[useStory] WebSocket closed, reconnecting...');
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        };

        wsRef.current.onerror = (err) => {
          console.error('[useStory] WebSocket error:', err);
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        console.error('[useStory] WebSocket init failed:', err);
        setError(err instanceof Error ? err : new Error('Failed to connect'));
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { story, isLoading, error, availableWorkflows };
}
