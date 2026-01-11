/**
 * Skill Suggestions Utility - Story 9-3
 *
 * Provides intelligent skill suggestions based on:
 * - AC1: Session context (story, ACs, phase)
 * - AC2: Keyword extraction and matching
 * - AC3: Non-intrusive presentation (thresholds, limits)
 *
 * Reuses searchSkills() from skill-search.ts for registry access.
 */
/**
 * Session context for story-aware suggestions
 */
export interface SessionContext {
    /** Story identifier (e.g., "9-3") */
    storyId: string;
    /** List of acceptance criteria */
    acceptanceCriteria: string[];
    /** Current workflow phase */
    phase: string;
    /** Optional Jira issue key */
    jiraKey?: string;
}
/**
 * Options for skill suggestions
 */
export interface SuggestOptions {
    /** Minimum confidence score (0-1) to include suggestion. Default: 0.3 */
    confidenceThreshold?: number;
    /** Maximum number of suggestions to return. Default: 5 */
    maxResults?: number;
    /** Skills to exclude from suggestions (already in use) */
    excludeSkills?: string[];
    /** Session context for combined suggestions */
    sessionContext?: SessionContext;
    /** Custom path to registry file (for testing) */
    registryPath?: string;
}
/**
 * A skill suggestion with relevance scoring
 */
export interface SkillSuggestion {
    /** Skill name */
    name: string;
    /** Skill description */
    description: string;
    /** Relevance score (0-1) */
    score: number;
    /** Reason for suggesting this skill */
    reason: string;
    /** What triggered the match (keywords, tags, phase) */
    matchedOn?: string[];
}
/**
 * Suggest skills based on session context (story, ACs, phase)
 *
 * @param context - Session context with story details
 * @returns Promise resolving to array of skill suggestions
 */
export declare function suggestFromSession(context: SessionContext): Promise<SkillSuggestion[]>;
/**
 * Suggest skills based on keywords in user input
 *
 * @param userInput - User's message or query
 * @returns Promise resolving to array of skill suggestions
 */
export declare function suggestFromKeywords(userInput: string): Promise<SkillSuggestion[]>;
/**
 * Main suggestion function combining session context and keywords
 *
 * @param userInput - User's message or query
 * @param options - Suggestion options (threshold, limits, exclusions)
 * @returns Promise resolving to filtered, limited skill suggestions
 */
export declare function suggestSkills(userInput: string, options?: SuggestOptions): Promise<SkillSuggestion[]>;
//# sourceMappingURL=skill-suggest.d.ts.map