/**
 * React Hooks Index
 *
 * Story MSSCI-12717 - React Migration
 */

// Data hooks
export { useStory } from './useStory';
export type { StoryData } from './useStory';

export { useGitStatus } from './useGitStatus';
export type { GitStatusData } from './useGitStatus';

export { useTodos } from './useTodos';
export type { TodoItem } from './useTodos';

export { useBackgroundTasks } from './useBackgroundTasks';
export type { BackgroundTask } from './useBackgroundTasks';

export { useDiffs } from './useDiffs';
export type { DiffData } from './useDiffs';

// useMessageStream is deprecated - use ClaudeContext instead

export { useStatsStrip } from './useStatsStrip';

export { usePersona } from './usePersona';
export type { PersonaData } from './usePersona';

// Editor hooks
export { useCommandHistory } from './useCommandHistory';
export { useTabCompletion } from './useTabCompletion';
export { useMessageQueue } from './useMessageQueue';
export type { QueuedMessage } from './useMessageQueue';

// Claude API hooks
export { useClaude } from './useClaude';
export type { UseClaudeResult, UseClaudeCallbacks, ClaudeMessage, PermissionMode, PastedImage } from './useClaude';

// Content processing hooks
export { useMarkdownParser } from './useMarkdownParser';
export type { UseMarkdownParserResult } from './useMarkdownParser';

export { useSyntaxHighlighter } from './useSyntaxHighlighter';
export type { UseSyntaxHighlighterResult } from './useSyntaxHighlighter';

// Agent load analysis
export { useAgentLoad } from './useAgentLoad';
export type { AgentLoadData, AgentLoadEntry, PruneResult } from './useAgentLoad';
