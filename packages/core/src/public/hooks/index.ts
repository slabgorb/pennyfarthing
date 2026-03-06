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

export { useDiffs } from './useDiffs';
export type { DiffData } from './useDiffs';

export { useStatsStrip } from './useStatsStrip';

export { usePersona } from './usePersona';
export type { PersonaData } from './usePersona';

export { useDataSource, useRestDataSource, useRawDataSource } from './useDataSource';
export type { UseDataSourceOptions, UseDataSourceResult, UseRestDataSourceOptions, UseRestDataSourceResult, UseRawDataSourceOptions } from './useDataSource';

export { useSprint } from './useSprint';
export type { EpicProgress, SprintStory, SprintEpic, FutureEpicChild, FutureEpic, SprintRegistry, SprintData } from './useSprint';

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

// Debug/Analysis hooks
export { useCodeMarkers } from './useCodeMarkers';
export type { CodeMarker, MarkerSummary, CodeMarkersData, UseCodeMarkersOptions, UseCodeMarkersReturn } from './useCodeMarkers';

export { useComplexity } from './useComplexity';
export type { FileComplexity, ComplexityData, UseComplexityOptions, UseComplexityReturn } from './useComplexity';

export { useDeadCode } from './useDeadCode';
export type { StaleFile, UnusedExport, DeadCodeData, UseDeadCodeOptions, UseDeadCodeReturn } from './useDeadCode';

export { useDependencies } from './useDependencies';
export type { OutdatedPackage, SecurityAdvisory, DependenciesData, UseDependenciesOptions, UseDependenciesReturn } from './useDependencies';

export { useHealthScore } from './useHealthScore';
export type { HealthScoreDimension, HealthScoreData, UseHealthScoreReturn } from './useHealthScore';

export { useHotspots } from './useHotspots';
export type { FileHotspot, DirectoryHotspot, HotspotRepoResult, HotspotData, UseHotspotsOptions, UseHotspotsReturn } from './useHotspots';

// Layout/UI hooks
export { useColorScheme } from './useColorScheme';
export type { ColorScheme } from './useColorScheme';

export { useFileBrowser } from './useFileBrowser';
export type { DirectoryEntry, DirectoryListing } from './useFileBrowser';

export { useFocusPanel } from './useFocusPanel';
export type { UseFocusPanelResult } from './useFocusPanel';

export { useLayoutPersistence } from './useLayoutPersistence';

export { useResponsiveLayout, BREAKPOINTS, SIDEBAR_WIDTHS, MIN_DIMENSIONS, CSS_BREAKPOINT_VARS, MEDIA_QUERIES } from './useResponsiveLayout';
export type { Breakpoint, MinimumViolation, ResponsiveLayoutState } from './useResponsiveLayout';

export { useUserAvatar, DEFAULT_AVATAR } from './useUserAvatar';
export type { UseUserAvatarResult } from './useUserAvatar';

// Agent/Workflow hooks
export { useMarkerActions, useStrippedContent } from './useMarkerActions';
export type { ActionType, MarkerAction } from './useMarkerActions';

export { useSubagentHelper } from './useSubagentHelper';
export type { Helper, UseSubagentHelperResult } from './useSubagentHelper';

export { useTandemObservations } from './useTandemObservations';
export type { TandemTrigger, TandemObservation, TandemHeader, TandemMetrics, UseTandemObservationsResult, TandemMessage } from './useTandemObservations';

export { useTeamMembers } from './useTeamMembers';
export type { TeamMember, TaskListItem, TeamMessage, TeamState } from './useTeamMembers';
