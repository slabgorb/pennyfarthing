/**
 * Settings Window Module for Cyclist (Story 24-1)
 *
 * Manages the settings modal window for Electron.
 * The window loads settings.html and allows users to configure Cyclist preferences.
 */

import path from 'path';
import { getPublicDir, getDistDir } from './paths.js';

// =============================================================================
// Constants
// =============================================================================

export const SETTINGS_HTML_PATH = path.join(getPublicDir(), 'settings.html');

// =============================================================================
// Window Configuration
// =============================================================================

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
export function getWindowConfig(): SettingsWindowConfig {
  return {
    modal: true,
    width: 450,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Cyclist Settings',
    webPreferences: {
      preload: path.join(getDistDir(), 'preload.js'),
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
let settingsWindowRef: unknown = null;

// Reference to main window for modal parent
let mainWindowRef: unknown = null;

// Reference to BrowserWindow constructor (passed from main.ts to avoid ESM require issues)
let BrowserWindowRef: unknown = null;

/**
 * Set the main window reference (called by main.ts on startup)
 */
export function setMainWindowRef(windowRef: unknown): void {
  mainWindowRef = windowRef;
}

/**
 * Set the BrowserWindow constructor reference (called by main.ts on startup)
 * This avoids the need for dynamic require() which doesn't work in ESM
 */
export function setBrowserWindowRef(browserWindowConstructor: unknown): void {
  BrowserWindowRef = browserWindowConstructor;
}

/**
 * Check if the settings window is currently open
 */
export function isSettingsWindowOpen(): boolean {
  return settingsWindowOpen;
}

/**
 * Open the settings window
 * Creates an actual BrowserWindow in Electron context
 */
export function openSettingsWindow(parentWindow?: unknown): void {
  console.log('[Settings] openSettingsWindow called, path:', SETTINGS_HTML_PATH);

  if (settingsWindowOpen) {
    console.log('[Settings] Window already open, focusing');
    // Window already open - focus it
    if (settingsWindowRef && typeof (settingsWindowRef as { focus: () => void }).focus === 'function') {
      (settingsWindowRef as { focus: () => void }).focus();
    }
    return;
  }

  // Try to create actual Electron window
  try {
    // Use the BrowserWindow constructor passed from main.ts (ESM-compatible)
    if (!BrowserWindowRef) {
      throw new Error('BrowserWindow not initialized - call setBrowserWindowRef first');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Electron BrowserWindow constructor passed dynamically
    const BrowserWindow = BrowserWindowRef as new (opts: Record<string, unknown>) => any;
    console.log('[Settings] Using BrowserWindow from ref, mainWindowRef:', !!mainWindowRef);

    const parent = parentWindow || mainWindowRef;
    const config = getWindowConfig();
    console.log('[Settings] Creating window with config:', JSON.stringify(config));

    const settingsWindow = new BrowserWindow({
      ...config,
      parent: parent as InstanceType<typeof BrowserWindow>,
      show: false, // Don't show until ready
    });

    console.log('[Settings] Loading HTML from:', SETTINGS_HTML_PATH);
    // Load the settings HTML
    settingsWindow.loadFile(SETTINGS_HTML_PATH);

    // Show when ready
    settingsWindow.once('ready-to-show', () => {
      console.log('[Settings] Window ready, showing');
      settingsWindow.show();
    });

    // Clean up on close
    settingsWindow.on('closed', () => {
      settingsWindowRef = null;
      settingsWindowOpen = false;
    });

    settingsWindowRef = settingsWindow;
    settingsWindowOpen = true;
    console.log('[Settings] Window created successfully');
  } catch (error) {
    // Not in Electron context (testing) - just update state
    console.error('[Settings] Error creating window:', error);
    settingsWindowOpen = true;
  }
}

/**
 * Close the settings window
 */
export function closeSettingsWindow(): void {
  if (settingsWindowRef && typeof (settingsWindowRef as { close: () => void }).close === 'function') {
    (settingsWindowRef as { close: () => void }).close();
  }
  settingsWindowOpen = false;
  settingsWindowRef = null;
}

/**
 * Set the window reference (called by main.ts when window is created)
 */
export function setSettingsWindowRef(windowRef: unknown): void {
  settingsWindowRef = windowRef;
  settingsWindowOpen = true;
}

/**
 * Clear the window reference (called when window is closed)
 */
export function clearSettingsWindowRef(): void {
  settingsWindowRef = null;
  settingsWindowOpen = false;
}
