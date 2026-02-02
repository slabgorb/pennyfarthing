/**
 * useStory Hook
 *
 * React hook for subscribing to story/sprint data.
 * Uses electronAPI in Electron mode, falls back to REST API in web mode.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useEffect, useCallback } from 'react';

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

// Fetch story via REST API (web mode fallback)
async function fetchStoryFromApi(): Promise<StoryData | null> {
  const response = await fetch('/api/story');
  if (!response.ok) {
    throw new Error(`Failed to fetch story: ${response.status}`);
  }
  const data = await response.json();
  // API returns { id: null, ... } when no session exists
  return data.id ? data : null;
}

export function useStory(): UseStoryResult {
  const [story, setStory] = useState<StoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStory = useCallback(async () => {
    try {
      const data = await fetchStoryFromApi();
      setStory(data);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch story'));
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const api = window.electronAPI;

    // Electron mode: use IPC
    if (api?.story) {
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
      return;
    }

    // Web mode: use REST API with polling
    fetchStory();

    // Poll for updates every 5 seconds in web mode
    const interval = setInterval(fetchStory, 5000);
    return () => clearInterval(interval);
  }, [fetchStory]);

  return { story, isLoading, error };
}
