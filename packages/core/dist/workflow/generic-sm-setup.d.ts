/**
 * Generic SM Setup - Combines story-setup + work-research
 *
 * Provides two modes:
 * 1. Research mode: Scan backlog, batch Jira query, recommend stories
 * 2. Setup mode: Claim Jira, create branches, write session file
 */
/**
 * Story info from sprint YAML
 */
export interface StoryInfo {
    id: string;
    title: string;
    status: string;
    points?: number;
    priority?: string;
    epic?: number;
}
/**
 * Research result - available stories and sprint metadata
 */
export interface ResearchResult {
    success: boolean;
    availableStories: StoryInfo[];
    sprintNumber?: number;
    sprintGoal?: string;
    completedPoints?: number;
    totalPoints?: number;
    error?: string;
}
/**
 * Setup result - session file and branch info
 */
export interface SetupResult {
    success: boolean;
    sessionFile?: string;
    branchName?: string;
    error?: string;
    warnings?: string[];
}
export type GenericSmSetupResult = ResearchResult | SetupResult;
/**
 * Research mode parameters
 */
export interface ResearchParams {
    sprintPath: string;
}
/**
 * Setup mode parameters
 */
export interface SetupParams {
    storyId: string;
    title: string;
    points: number;
    epic: number;
    repos: string;
    sessionDir: string;
    workflow: string;
    assignee?: string;
    jiraKey?: string;
    acceptanceCriteria?: string[];
    checkEpicContext?: boolean;
    contextDir?: string;
}
/**
 * Epic context check parameters
 */
export interface CheckEpicContextParams {
    epicId: number;
    contextDir: string;
}
/**
 * Epic context check result
 */
export interface CheckEpicContextResult {
    exists: boolean;
    path?: string;
    message?: string;
    expectedPath?: string;
}
/**
 * Epic context creation parameters
 */
export interface CreateEpicContextParams {
    epicId: number;
    epicTitle: string;
    contextDir: string;
    content?: string;
}
/**
 * Epic context creation result
 */
export interface CreateEpicContextResult {
    success: boolean;
    path?: string;
    error?: string;
}
/**
 * Research backlog for available stories
 *
 * Scans sprint YAML and returns available (unassigned, backlog) stories
 * sorted by priority then points.
 *
 * @param params - Research parameters
 * @returns Research result with available stories
 */
export declare function researchBacklog(params: ResearchParams): Promise<ResearchResult>;
/**
 * Setup a story for development
 *
 * Creates session file with story context, calculates branch name,
 * initializes workflow tracking with Phase History table.
 *
 * @param params - Setup parameters
 * @returns Setup result with session file path and branch name
 */
export declare function setupStory(params: SetupParams): Promise<SetupResult>;
/**
 * Check if epic context file exists
 *
 * Validates that sprint/context/context-epic-{N}.md exists before story setup.
 * This ensures stories don't start without understanding their epic's technical landscape.
 *
 * @param params - Check parameters with epicId and contextDir
 * @returns Result indicating if context exists, with path or message
 */
export declare function checkEpicContext(params: CheckEpicContextParams): Promise<CheckEpicContextResult>;
/**
 * Create epic context file from template
 *
 * Creates a new epic context file with standard sections.
 * Will not overwrite existing files to preserve valuable context.
 *
 * @param params - Creation parameters with epicId, title, contextDir, and optional content
 * @returns Result with success status and file path
 */
export declare function createEpicContext(params: CreateEpicContextParams): Promise<CreateEpicContextResult>;
//# sourceMappingURL=generic-sm-setup.d.ts.map