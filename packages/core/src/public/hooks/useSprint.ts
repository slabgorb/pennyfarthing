/**
 * useSprint Hook
 *
 * React hook for subscribing to sprint data.
 * Story MSSCI-14189 - Enhanced Sprint Panel
 * Story 124-3 - Refactored to use DataSource<T> pattern
 *
 * Uses DataSource via useDataSource for real-time updates.
 */

import { useDataSource } from './useDataSource.js';

// =============================================================================
// Types matching EnhancedSprintPanel expectations
// =============================================================================

export interface SprintStory {
  id: string;
  title: string;
  points: number;
  status: 'backlog' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  jiraKey: string | null;
  hasContext?: boolean;
  assignedTo?: string | null;
  completed?: string | null;
  started?: string | null;
  workflow?: string | null;
  priority?: string | null;
  description?: string | null;
}

export interface SprintEpic {
  id: string;
  title: string;
  jiraKey: string | null;
  stories: SprintStory[];
  hasContext?: boolean;
}

export interface FutureEpicChild {
  id: string;
  title: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
  jiraKey: string | null;
  storyCount: number;
}

export interface FutureEpic {
  id: string;
  title: string;
  description: string;
  estimatedPoints: number;
  status: 'ready' | 'blocked' | 'planning';
  children: FutureEpicChild[];
}

export interface SprintRegistry {
  name: string;
  type: string;
  description: string;
  file: string;
  isDefault: boolean;
}

export interface SprintData {
  currentStory: SprintStory | null;
  nextStory: SprintStory | null;
  epics: SprintEpic[];
  futureEpics: FutureEpic[];
  sprint: {
    number: number;
    name: string;
    done: number;
    remaining: number;
    inProgress: number;
    endDate: string;
  };
  registry?: SprintRegistry;
}

interface UseSprintResult {
  data: SprintData | null;
  isLoading: boolean;
  error: Error | null;
}

/** WebSocket message format from /ws/sprint */
interface SprintMessage extends Partial<SprintData> {
  type: 'init' | 'update';
}

export function useSprint(): UseSprintResult {
  return useDataSource<SprintMessage, SprintData>({
    endpoint: '/ws/sprint',
    transform: (msg) => {
      const { type: _type, ...sprintData } = msg;
      return sprintData as SprintData;
    },
    merge: (prev, update) => {
      if (!prev) return update;
      return { ...prev, ...update, registry: update.registry };
    },
  });
}
