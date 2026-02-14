/**
 * Story parser stubs for server module.
 * STUB: Will be replaced with real implementation from cyclist/src/story-parser.ts
 */

export interface StoryInfo {
  storyId: string | null;
  title: string | null;
  phase: string | null;
  workflow: string | null;
}

export interface WorkflowStep {
  name: string;
  owner: string;
}

export interface CriteriaItem {
  text: string;
  checked: boolean;
}

export function getStoryInfo(_projectDir: string): StoryInfo {
  return { storyId: null, title: null, phase: null, workflow: null };
}
