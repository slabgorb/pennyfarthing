/**
 * Settings Window Module for Cyclist (Story 24-1)
 *
 * Manages the settings modal window for Electron.
 * The window loads settings.html and allows users to configure Cyclist preferences.
 */
export declare const SETTINGS_HTML_PATH: string;
export interface SettingsWindowConfig {
    modal: boolean;
    width: number;
    height: number;
    resizable: boolean;
    minimizable: boolean;
    maximizable: boolean;
    title: string;
    webPreferences: {
        preload: string;
        contextIsolation: boolean;
        nodeIntegration: boolean;
    };
}
/**
 * Get the window configuration for the settings window
 */
export declare function getWindowConfig(): SettingsWindowConfig;
/**
 * Set the main window reference (called by main.ts on startup)
 */
export declare function setMainWindowRef(windowRef: unknown): void;
/**
 * Check if the settings window is currently open
 */
export declare function isSettingsWindowOpen(): boolean;
/**
 * Open the settings window
 * Creates an actual BrowserWindow in Electron context
 */
export declare function openSettingsWindow(parentWindow?: unknown): void;
/**
 * Close the settings window
 */
export declare function closeSettingsWindow(): void;
/**
 * Set the window reference (called by main.ts when window is created)
 */
export declare function setSettingsWindowRef(windowRef: unknown): void;
/**
 * Clear the window reference (called when window is closed)
 */
export declare function clearSettingsWindowRef(): void;
//# sourceMappingURL=settings-window.d.ts.map