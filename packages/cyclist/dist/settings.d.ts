/**
 * Settings Module for Cyclist (Story 24-1)
 *
 * Provides file-based persistence for Cyclist settings with support for:
 * - User settings at ~/.cyclist/settings.yaml
 * - Project overrides at .claude/cyclist.local.yaml
 * - File watching for external edits
 * - Settings merging (project overrides user)
 */
export interface WorkflowSettings {
    auto_handoff: boolean;
    handoff_confirm: boolean;
}
export interface DisplaySettings {
    show_flow: boolean;
    show_ocean: boolean;
    sidebar_width: number;
}
export interface NotificationSettings {
    phase_change: boolean;
    sound: boolean;
}
export interface CyclistSettings {
    workflow: WorkflowSettings;
    display: DisplaySettings;
    notifications: NotificationSettings;
}
export type PartialSettings = {
    workflow?: Partial<WorkflowSettings>;
    display?: Partial<DisplaySettings>;
    notifications?: Partial<NotificationSettings>;
};
export declare const USER_SETTINGS_DIR: string;
export declare const USER_SETTINGS_FILE: string;
export declare const PROJECT_SETTINGS_FILE = ".claude/cyclist.local.yaml";
/**
 * Get a copy of the default settings
 */
export declare function getDefaultSettings(): CyclistSettings;
/**
 * Ensure the settings directory exists
 */
export declare function ensureSettingsDir(): void;
/**
 * Parse YAML string to settings object
 * Returns empty object on parse error (graceful degradation)
 */
export declare function parseSettings(yamlContent: string): PartialSettings;
/**
 * Serialize settings to YAML string
 */
export declare function serializeSettings(settings: CyclistSettings): string;
/**
 * Validate settings object structure
 */
export declare function validateSettings(settings: unknown): boolean;
/**
 * Deep merge settings objects
 * Override values take precedence over base values
 */
export declare function mergeSettings(base: CyclistSettings, override: PartialSettings): CyclistSettings;
/**
 * Load project settings from .claude/cyclist.local.yaml
 * Returns empty object if file doesn't exist or is invalid
 */
export declare function loadProjectSettings(projectDir: string): PartialSettings;
/**
 * Load settings with optional project directory for overrides
 * Merges: defaults <- user settings <- project overrides
 */
export declare function loadSettings(projectDir?: string): CyclistSettings;
/**
 * Save user settings to ~/.cyclist/settings.yaml
 * Returns true on success, false on failure
 */
export declare function saveUserSettings(settings: Partial<CyclistSettings>): boolean;
/**
 * Watch a settings file for changes
 * Returns unsubscribe function
 */
export declare function watchSettings(projectDir: string, onChange: (settings: CyclistSettings) => void): () => void;
/**
 * Watch both user and project settings files
 * Returns unsubscribe function
 */
export declare function watchAllSettings(projectDir: string, onChange: (settings: CyclistSettings) => void): () => void;
/**
 * Stop all file watchers
 */
export declare function stopWatchingSettings(): void;
/**
 * Initialize settings on app startup
 */
export declare function initializeSettings(projectDir?: string): CyclistSettings;
/**
 * Get current in-memory settings
 */
export declare function getCurrentSettings(): CyclistSettings;
/**
 * Check if project overrides are currently applied
 */
export declare function hasProjectOverrides(): boolean;
//# sourceMappingURL=settings.d.ts.map