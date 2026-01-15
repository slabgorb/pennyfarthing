/**
 * Theme Metadata
 *
 * Handles loading and caching of Pennyfarthing theme metadata.
 * Extracted from main.ts for better maintainability.
 */
/**
 * Theme metadata interface for theme browser (24-5)
 */
export interface ThemeMetadata {
    id: string;
    name: string;
    description: string;
    source: string;
    tier: 'S' | 'A' | 'B' | 'U';
    category: string;
    agentCount: number;
}
/**
 * Agent data within a theme (24-6)
 */
export interface ThemeAgent {
    character: string;
    quote?: string;
    style?: string;
    role?: string;
}
/**
 * Extended theme metadata including agent mappings (24-6)
 */
export interface ThemeMetadataWithAgents extends ThemeMetadata {
    agents: {
        sm?: ThemeAgent;
        tea?: ThemeAgent;
        dev?: ThemeAgent;
        reviewer?: ThemeAgent;
        architect?: ThemeAgent;
        pm?: ThemeAgent;
        orchestrator?: ThemeAgent;
        'tech-writer'?: ThemeAgent;
        'ux-designer'?: ThemeAgent;
        devops?: ThemeAgent;
    };
}
/**
 * Category mapping for known themes (24-5)
 * Maps theme IDs or source patterns to categories
 */
export declare const CATEGORY_MAP: Record<string, string>;
/**
 * Derive category from theme ID and source (24-5)
 * Uses CATEGORY_MAP for known themes, falls back to pattern matching
 */
export declare function deriveCategory(themeId: string, source: string): string;
/**
 * Get cached theme metadata
 */
export declare function getThemeMetadataCache(): ThemeMetadata[] | null;
/**
 * Get available themes from pennyfarthing-dist/personas/themes (24-2)
 * Returns sorted list of theme names
 */
export declare function getAvailableThemes(): Promise<string[]>;
/**
 * Load theme metadata from YAML files (24-5)
 * Parses all theme files and extracts metadata for the browser
 */
export declare function loadThemeMetadata(): Promise<ThemeMetadata[]>;
/**
 * Load theme metadata including agent character mappings (24-6)
 * Extended version of loadThemeMetadata for the preview panel
 */
export declare function loadThemeMetadataWithAgents(): Promise<ThemeMetadataWithAgents[]>;
//# sourceMappingURL=theme-metadata.d.ts.map