export interface ThemeAgentHelper {
    name: string;
    style: string;
}
export interface ThemeAgent {
    character: string;
    style?: string;
    role?: string;
    quote?: string;
    trait?: string;
    expertise?: string;
    emoji?: string;
    helper?: ThemeAgentHelper;
}
export interface ThemeInfo {
    id: string;
    name: string;
    description: string;
    isCustom?: boolean;
    agents: {
        sm?: ThemeAgent;
        tea?: ThemeAgent;
        dev?: ThemeAgent;
        reviewer?: ThemeAgent;
        [key: string]: ThemeAgent | undefined;
    };
}
/**
 * Get the path to the themes directory
 */
export declare function getThemesDir(): string;
/**
 * Get the project-level custom themes directory
 */
export declare function getProjectCustomThemesDir(projectRoot: string): string;
/**
 * Get the user-level custom themes directory
 */
export declare function getUserCustomThemesDir(): string;
/**
 * Get the current theme from persona-config.yaml
 */
export declare function getCurrentTheme(projectRoot?: string): string | null;
/**
 * Parse a theme YAML file and extract theme info
 */
export declare function parseThemeFile(filePath: string, isCustom?: boolean): ThemeInfo | null;
/**
 * Get all available themes (built-in + custom)
 */
export declare function getThemes(projectRoot?: string): ThemeInfo[];
/**
 * Get sample agent characters for display
 */
export declare function getAgentSamples(theme: ThemeInfo): string;
/**
 * Set the active theme in persona-config.yaml
 * Returns the ThemeInfo if successful, throws if theme not found
 */
export declare function setTheme(themeName: string, projectRoot: string): ThemeInfo;
/**
 * Validate a theme name
 */
export declare function validateThemeName(name: string): {
    valid: boolean;
    error?: string;
};
/**
 * Get the path to a theme file (built-in or custom)
 */
export declare function getThemeFilePath(themeId: string): string | null;
export interface CreateThemeOptions {
    baseTheme?: string;
    userLevel?: boolean;
}
/**
 * Create a new custom theme
 * Returns the path to the created theme file
 */
export declare function createTheme(themeName: string, projectRoot: string, options?: CreateThemeOptions): string;
export interface ThemeSchemaValidationResult {
    valid: boolean;
    errors?: string[];
}
/**
 * Validate a theme object has all required fields and agents
 * Used to validate AI-generated themes before writing to file
 */
export declare function validateThemeSchema(themeData: unknown): ThemeSchemaValidationResult;
//# sourceMappingURL=themes.d.ts.map