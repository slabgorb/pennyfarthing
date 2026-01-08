/**
 * Story 15-1: Cyclist launcher command
 *
 * Launches Cyclist with Pennyfarthing context.
 */
import { spawn as nodeSpawn } from 'child_process';
export interface CyclistOptions {
    port?: number;
    noOpen?: boolean;
    cyclistPath?: string;
}
export interface ThemeConfig {
    theme: string;
}
export interface CyclistDeps {
    spawn: typeof nodeSpawn;
    open: (url: string) => Promise<void>;
}
/**
 * Find cyclist installation
 *
 * Priority:
 * 1. CYCLIST_PATH environment variable
 * 2. Sibling directory ../cyclist
 * 3. Relative to pennyfarthing install
 */
export declare function findCyclist(): string;
/**
 * Load theme configuration from persona-config.yaml
 *
 * Prefers local config over shared config.
 */
export declare function loadThemeConfig(projectDir: string): ThemeConfig;
/**
 * Resolve path to theme YAML file
 *
 * Checks project personas directory first, then node_modules.
 */
export declare function resolveThemePath(theme: string, projectDir: string): string;
/**
 * Main cyclist command
 *
 * Finds cyclist, sets environment, spawns server, opens browser
 */
export declare function cyclistCommand(options: CyclistOptions, deps?: CyclistDeps): Promise<void>;
//# sourceMappingURL=cyclist.d.ts.map