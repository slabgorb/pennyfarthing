/**
 * Parse --project-dir argument from CLI
 * Used when launching via: open Cyclist.app --args --project-dir=/path
 */
export declare function parseProjectDirArg(): string | null;
/**
 * Set the project directory (called after folder picker selection or in tests)
 */
export declare function setProjectDirectory(dir: string): void;
/**
 * Check if a directory is valid for use as project directory
 */
export declare function isValidProjectDirectory(dir: string): boolean;
/**
 * Get the project directory for Claude to run in
 * Priority: CLI arg → env var → selected dir (from picker) → null (triggers picker)
 */
export declare function getProjectDirectory(): string | null;
/**
 * Reset project directory state (for testing only)
 * Clears both CLI arg and selected directory
 */
export declare function resetProjectDirectory(): void;
export declare function getPublicDir(): string;
export declare function getNodeModulesDir(): string;
export declare function getPortraitsDir(): string | null;
export declare function getDistDir(): string;
export declare const publicDir: string;
export declare const nodeModulesDir: string;
export declare const portraitsDir: string | null;
//# sourceMappingURL=paths.d.ts.map