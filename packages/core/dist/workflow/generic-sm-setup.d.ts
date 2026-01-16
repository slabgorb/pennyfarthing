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
//# sourceMappingURL=generic-sm-setup.d.ts.map