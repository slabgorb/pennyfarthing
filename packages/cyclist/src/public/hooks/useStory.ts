/**
 * useStory Hook
 *
 * React hook for subscribing to story/sprint data via electronAPI.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect } from 'react';

// Import types from story-parser for criteria and workflow
import type { CriteriaItem, WorkflowPhase } from '../../../story-parser.js';

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
}

// Re-export types for panel components
export type { CriteriaItem, WorkflowPhase };

interface UseStoryResult {
  story: StoryData | null;
  isLoading: boolean;
  error: Error | null;
}

export function useStory(): UseStoryResult {
  const [story, setStory] = useState<StoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.story) {
      setError(new Error('electronAPI.story not available'));
      setIsLoading(false);
      return;
    }

    // Initial fetch
    api.story.get()
      .then((data) => {
        setStory(data as StoryData | null);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error('Failed to fetch story'));
        setIsLoading(false);
      });

    // Subscribe to updates
    api.story.onUpdate((_, data) => {
      setStory(data as StoryData | null);
    });
  }, []);

  return { story, isLoading, error };
}
