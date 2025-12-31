/**
 * List all available themes
 */
export declare function listCommand(): Promise<void>;
/**
 * Set the active theme
 */
export declare function setCommand(themeName: string): Promise<void>;
/**
 * Show full details of a theme
 */
export declare function showCommand(themeName?: string): Promise<void>;
export interface CreateCommandOptions {
    base?: string;
    user?: boolean;
}
/**
 * Create a new custom theme
 */
export declare function createCommand(themeName: string, options: CreateCommandOptions): Promise<void>;
//# sourceMappingURL=theme.d.ts.map