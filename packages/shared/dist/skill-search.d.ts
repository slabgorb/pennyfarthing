/**
 * Skill Search Utility - Story 9-2
 *
 * Searches the skill registry by tag, keyword, category, or description query.
 * Returns matching skills with metadata for discovery and suggestions.
 */
export interface SearchOptions {
    /** Filter by tag (e.g., "tdd", "quality") */
    tag?: string;
    /** Filter by keyword (e.g., "jest", "vitest") */
    keyword?: string;
    /** Search description text */
    query?: string;
    /** Filter by category (e.g., "development", "tools") */
    category?: string;
    /** Custom path to registry file (for testing) */
    registryPath?: string;
}
export interface SkillResult {
    name: string;
    description: string;
    category: string;
    tags: string[];
    keywords?: string[];
    version?: string;
    related_skills?: string[];
}
/**
 * Search skills in the registry based on provided options.
 *
 * @param options - Search options (tag, keyword, query, category)
 * @returns Promise resolving to array of matching skills
 * @throws Error if registry file not found or invalid category
 */
export declare function searchSkills(options: SearchOptions): Promise<SkillResult[]>;
//# sourceMappingURL=skill-search.d.ts.map