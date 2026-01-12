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
 * Get the path to the .pennyfarthing local config (preferred for dogfooding)
 */
export declare function getPennyfarthingConfigPath(projectRoot: string): string;
/**
 * Get the current theme from config files
 * Priority: .pennyfarthing/config.local.yaml > .claude/persona-config.local.yaml > .claude/persona-config.yaml
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
export interface SetThemeOptions {
    /** If true, write to shared config (.claude/persona-config.yaml) instead of local */
    global?: boolean;
    /** If true, write to legacy .claude/persona-config.local.yaml instead of .pennyfarthing/ */
    legacy?: boolean;
}
/**
 * Set the active theme
 * By default writes to .pennyfarthing/config.local.yaml (agent-writable, dogfooding-friendly)
 * Use { legacy: true } to write to .claude/persona-config.local.yaml
 * Use { global: true } to write to .claude/persona-config.yaml (project default)
 * Returns the ThemeInfo if successful, throws if theme not found
 */
export declare function setTheme(themeName: string, projectRoot: string, options?: SetThemeOptions): ThemeInfo;
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