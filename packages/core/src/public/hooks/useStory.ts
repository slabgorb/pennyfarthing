/**
 * useStory Hook
 *
 * React hook for subscribing to story/sprint data.
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12860 - IPC to WebSocket Migration (Phase 1)
 * Story 124-3 - Refactored to use DataSource<T> pattern
 *
 * Uses DataSource via useDataSource for real-time updates (no polling).
 */

import { useState } from 'react';
import { useDataSource } from './useDataSource.js';

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
  const [availableWorkflows, setAvailableWorkflows] = useState<AvailableWorkflow[] | null>(null);

  const { data: story, isLoading, error } = useDataSource<StoryMessage, StoryData | null>({
    endpoint: '/ws/story',
    transform: (msg) => {
      setAvailableWorkflows(msg.availableWorkflows ?? null);
      return transformMessage(msg);
    },
  });

  return { story, isLoading, error, availableWorkflows };
}
