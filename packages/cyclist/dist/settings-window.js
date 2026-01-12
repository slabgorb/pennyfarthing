/**
 * Settings Window Module for Cyclist (Story 24-1)
 *
 * Manages the settings modal window for Electron.
 * The window loads settings.html and allows users to configure Cyclist preferences.
 */
import path from 'path';
import { fileURLToPath } from 'url';
// Get directory name for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// =============================================================================
// Constants
// =============================================================================
export const SETTINGS_HTML_PATH = path.join(__dirname, 'public', 'settings.html');
/**
 * Get the window configuration for the settings window
 */
export function getWindowConfig() {
    return {
        modal: true,
        width: 450,
        height: 500,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Cyclist Settings',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    };
}
// =============================================================================
// Window State
// =============================================================================
// In Electron context, this would hold the BrowserWindow instance
// For testing/non-Electron context, we track state with a boolean
let settingsWindowOpen = false;
// The actual BrowserWindow reference (only set in Electron context)
let settingsWindowRef = null;
// Reference to main window for modal parent
let mainWindowRef = null;
/**
 * Set the main window reference (called by main.ts on startup)
 */
export function setMainWindowRef(windowRef) {
    mainWindowRef = windowRef;
}
/**
 * Check if the settings window is currently open
 */
export function isSettingsWindowOpen() {
    return settingsWindowOpen;
}
/**
 * Open the settings window
 * Creates an actual BrowserWindow in Electron context
 */
export function openSettingsWindow(parentWindow) {
    if (settingsWindowOpen) {
        // Window already open - focus it
        if (settingsWindowRef && typeof settingsWindowRef.focus === 'function') {
            settingsWindowRef.focus();
        }
        return;
    }
    // Try to create actual Electron window
    try {
        // Dynamic import to avoid issues in non-Electron context
        const { BrowserWindow } = require('electron');
        const parent = parentWindow || mainWindowRef;
        const config = getWindowConfig();
        const settingsWindow = new BrowserWindow({
            ...config,
            parent: parent,
            show: false, // Don't show until ready
        });
        // Load the settings HTML
        settingsWindow.loadFile(SETTINGS_HTML_PATH);
        // Show when ready
        settingsWindow.once('ready-to-show', () => {
            settingsWindow.show();
        });
        // Clean up on close
        settingsWindow.on('closed', () => {
            settingsWindowRef = null;
            settingsWindowOpen = false;
        });
        settingsWindowRef = settingsWindow;
        settingsWindowOpen = true;
    }
    catch {
        // Not in Electron context (testing) - just update state
        settingsWindowOpen = true;
    }
}
/**
 * Close the settings window
 */
export function closeSettingsWindow() {
    if (settingsWindowRef && typeof settingsWindowRef.close === 'function') {
        settingsWindowRef.close();
    }
    settingsWindowOpen = false;
    settingsWindowRef = null;
}
/**
 * Set the window reference (called by main.ts when window is created)
 */
export function setSettingsWindowRef(windowRef) {
    settingsWindowRef = windowRef;
    settingsWindowOpen = true;
}
/**
 * Clear the window reference (called when window is closed)
 */
export function clearSettingsWindowRef() {
    settingsWindowRef = null;
    settingsWindowOpen = false;
}
//# sourceMappingURL=settings-window.js.map