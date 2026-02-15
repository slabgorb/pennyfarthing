/**
 * BikeShow — Electron Entry Point
 *
 * Launches the Cyclist visual terminal as a desktop Electron app.
 * Analogous to bikerack.ts (web server mode) but wraps the UI in
 * an Electron BrowserWindow with native menus, IPC bridges, and
 * system tray integration.
 *
 * Story 98-20: Extract Electron shell to packages/electron
 */

import { app } from 'electron';
import { createElectronApp } from './main.js';

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Initialize the Electron app when ready
  app.whenReady().then(() => {
    createElectronApp();
  });

  // Quit when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
