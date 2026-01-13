/**
 * Pennyfarthing Metadata Module
 *
 * Reads Pennyfarthing configuration and watches for agent changes.
 * Provides persona data for Cyclist UI integration.
 */
/**
 * Helper data structure for agent helpers/subagents
 */
export interface Helper {
    name: string;
    style?: string;
}
/**
 * Persona data structure for agent personas
 */
export interface Persona {
    character: string;
    displayName: string;
    role: string;
    roleDescription: string;
    style: string;
    theme: string;
    slug: string;
    quote?: string;
    helper?: Helper;
    ocean?: {
        O: number;
        C: number;
        E: number;
        A: number;
        N: number;
    };
}
/**
 * Full persona details for popup display
 * Extends basic Persona with voice, quirks, background from theme file
 */
export interface FullPersonaDetails extends Persona {
    voice?: string;
    quirks?: string[];
    background?: string;
    roleMapping: string;
    expertise?: string;
    catchphrases?: string[];
    visual?: string;
}
/**
 * Theme configuration from persona-config.yaml
 */
interface ThemeConfig {
    theme: string;
}
/**
 * Detects if a directory is a Pennyfarthing-enabled project
 * Checks for Pennyfarthing-specific files, not just .claude/ directory
 * @param projectDir - The project directory to check
 * @returns true if Pennyfarthing is installed
 */
export declare function detectPennyfarthingProject(projectDir: string): boolean;
/**
 * Loads theme configuration from config files
 * Checks multiple locations in priority order:
 * 1. .pennyfarthing/config.local.yaml (new preferred location)
 * 2. .claude/persona-config.local.yaml (legacy local)
 * 3. .claude/persona-config.yaml (legacy default)
 * @param projectDir - The project directory
 * @returns Theme config or null if not found/invalid
 */
export declare function loadThemeConfig(projectDir: string): ThemeConfig | null;
/**
 * Loads and parses a theme YAML file
 * @param themePath - Path to the theme YAML file
 * @returns Map of agent roles to Persona objects, or null if not found/invalid
 */
export declare function loadThemeYaml(themePath: string): Record<string, Persona> | null;
/**
 * Computes a display name map for all characters in a theme.
 * Finds the shortest unique identifier that distinguishes each character.
 *
 * Algorithm:
 * 1. Skip common prefixes/titles that don't help identification
 * 2. Try first word (most natural for single names: "Gandalf", "Socrates")
 * 3. If collision, try last word (surname: "Seaborn" vs "Lyman")
 * 4. If still collision, try first + last
 * 5. Fallback to full name
 *
 * @param agents - Map of agent roles to persona data
 * @returns Map of character full name to display name
 */
export declare function computeDisplayNames(agents: Record<string, {
    character: string;
}>): Map<string, string>;
/**
 * Gets the current agent role from session files
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns Agent role string or null if not found
 */
export declare function getCurrentAgent(projectDir: string, sessionId?: string): string | null;
/**
 * Gets the current persona data for the active agent
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns Persona object or null if not available
 */
export declare function getCurrentPersona(projectDir: string, sessionId?: string): Persona | null;
/**
 * Gets full persona details including voice, quirks, background for popup display
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns FullPersonaDetails object or null if not available
 */
export declare function getFullPersonaDetails(projectDir: string, sessionId?: string): FullPersonaDetails | null;
/**
 * Watches for agent changes and invokes callback when agent changes
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific watching
 * @param callback - Callback invoked with new agent role when change detected
 * @returns Cleanup function to stop watching
 */
export declare function watchAgentChanges(projectDir: string, sessionId: string | undefined, callback: (agentRole: string) => void): () => void;
export {};
//# sourceMappingURL=pennyfarthing.d.ts.map