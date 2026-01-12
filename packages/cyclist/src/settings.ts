/**
 * Settings Module for Cyclist (Story 24-1)
 *
 * Provides file-based persistence for Cyclist settings with support for:
 * - User settings at ~/.cyclist/settings.yaml
 * - Project overrides at .claude/cyclist.local.yaml
 * - File watching for external edits
 * - Settings merging (project overrides user)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse, stringify } from 'yaml';

// =============================================================================
// Types
// =============================================================================

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

// Partial settings for merging
export type PartialSettings = {
  workflow?: Partial<WorkflowSettings>;
  display?: Partial<DisplaySettings>;
  notifications?: Partial<NotificationSettings>;
};

// =============================================================================
// Constants
// =============================================================================

export const USER_SETTINGS_DIR = path.join(os.homedir(), '.cyclist');
export const USER_SETTINGS_FILE = path.join(USER_SETTINGS_DIR, 'settings.yaml');
export const PROJECT_SETTINGS_FILE = '.claude/cyclist.local.yaml';

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS: CyclistSettings = {
  workflow: {
    auto_handoff: false,
    handoff_confirm: true,
  },
  display: {
    show_flow: true,
    show_ocean: false,
    sidebar_width: 300,
  },
  notifications: {
    phase_change: true,
    sound: false,
  },
};

/**
 * Get a copy of the default settings
 */
export function getDefaultSettings(): CyclistSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

// =============================================================================
// In-memory State
// =============================================================================

let currentSettings: CyclistSettings = getDefaultSettings();
let projectOverridesApplied = false;
let fileWatcher: fs.FSWatcher | null = null;
let projectWatcher: fs.FSWatcher | null = null;

// =============================================================================
// Directory Management
// =============================================================================

/**
 * Ensure the settings directory exists
 */
export function ensureSettingsDir(): void {
  if (!fs.existsSync(USER_SETTINGS_DIR)) {
    fs.mkdirSync(USER_SETTINGS_DIR, { recursive: true });
  }
}

// =============================================================================
// YAML Parsing & Serialization
// =============================================================================

/**
 * Parse YAML string to settings object
 * Returns empty object on parse error (graceful degradation)
 */
export function parseSettings(yamlContent: string): PartialSettings {
  try {
    const parsed = parse(yamlContent);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return parsed as PartialSettings;
  } catch {
    // Invalid YAML - return empty object
    return {};
  }
}

/**
 * Serialize settings to YAML string
 */
export function serializeSettings(settings: CyclistSettings): string {
  return stringify(settings);
}

// =============================================================================
// Settings Validation
// =============================================================================

/**
 * Validate settings object structure
 */
export function validateSettings(settings: unknown): boolean {
  if (typeof settings !== 'object' || settings === null) {
    return false;
  }

  const s = settings as Record<string, unknown>;

  // Check workflow section
  if (typeof s.workflow !== 'object' || s.workflow === null) {
    return false;
  }
  const workflow = s.workflow as Record<string, unknown>;
  if (typeof workflow.auto_handoff !== 'boolean') return false;
  if (typeof workflow.handoff_confirm !== 'boolean') return false;

  // Check display section
  if (typeof s.display !== 'object' || s.display === null) {
    return false;
  }
  const display = s.display as Record<string, unknown>;
  if (typeof display.show_flow !== 'boolean') return false;
  if (typeof display.show_ocean !== 'boolean') return false;
  if (typeof display.sidebar_width !== 'number') return false;

  // Check notifications section
  if (typeof s.notifications !== 'object' || s.notifications === null) {
    return false;
  }
  const notifications = s.notifications as Record<string, unknown>;
  if (typeof notifications.phase_change !== 'boolean') return false;
  if (typeof notifications.sound !== 'boolean') return false;

  return true;
}

// =============================================================================
// Settings Merging
// =============================================================================

/**
 * Deep merge settings objects
 * Override values take precedence over base values
 */
export function mergeSettings(base: CyclistSettings, override: PartialSettings): CyclistSettings {
  const result: CyclistSettings = JSON.parse(JSON.stringify(base));

  if (override.workflow) {
    if (typeof override.workflow.auto_handoff === 'boolean') {
      result.workflow.auto_handoff = override.workflow.auto_handoff;
    }
    if (typeof override.workflow.handoff_confirm === 'boolean') {
      result.workflow.handoff_confirm = override.workflow.handoff_confirm;
    }
  }

  if (override.display) {
    if (typeof override.display.show_flow === 'boolean') {
      result.display.show_flow = override.display.show_flow;
    }
    if (typeof override.display.show_ocean === 'boolean') {
      result.display.show_ocean = override.display.show_ocean;
    }
    if (typeof override.display.sidebar_width === 'number') {
      result.display.sidebar_width = override.display.sidebar_width;
    }
  }

  if (override.notifications) {
    if (typeof override.notifications.phase_change === 'boolean') {
      result.notifications.phase_change = override.notifications.phase_change;
    }
    if (typeof override.notifications.sound === 'boolean') {
      result.notifications.sound = override.notifications.sound;
    }
  }

  return result;
}

// =============================================================================
// File Loading
// =============================================================================

/**
 * Load user settings from ~/.cyclist/settings.yaml
 * Returns default settings if file doesn't exist or is invalid
 */
function loadUserSettingsFile(): PartialSettings {
  try {
    if (fs.existsSync(USER_SETTINGS_FILE)) {
      const content = fs.readFileSync(USER_SETTINGS_FILE, 'utf-8');
      return parseSettings(content);
    }
  } catch {
    // Error reading file - return empty
  }
  return {};
}

/**
 * Load project settings from .claude/cyclist.local.yaml
 * Returns empty object if file doesn't exist or is invalid
 */
export function loadProjectSettings(projectDir: string): PartialSettings {
  try {
    const projectSettingsPath = path.join(projectDir, PROJECT_SETTINGS_FILE);
    if (fs.existsSync(projectSettingsPath)) {
      const content = fs.readFileSync(projectSettingsPath, 'utf-8');
      return parseSettings(content);
    }
  } catch {
    // Error reading file - return empty
  }
  return {};
}

/**
 * Load settings with optional project directory for overrides
 * Merges: defaults <- user settings <- project overrides
 */
export function loadSettings(projectDir?: string): CyclistSettings {
  let settings = getDefaultSettings();

  // Apply user settings
  const userSettings = loadUserSettingsFile();
  settings = mergeSettings(settings, userSettings);

  // Apply project overrides if projectDir provided
  if (projectDir) {
    const projectSettings = loadProjectSettings(projectDir);
    if (Object.keys(projectSettings).length > 0) {
      settings = mergeSettings(settings, projectSettings);
      projectOverridesApplied = true;
    } else {
      projectOverridesApplied = false;
    }
  }

  return settings;
}

// =============================================================================
// File Saving
// =============================================================================

/**
 * Save user settings to ~/.cyclist/settings.yaml
 * Returns true on success, false on failure
 */
export function saveUserSettings(settings: Partial<CyclistSettings>): boolean {
  try {
    ensureSettingsDir();

    // Merge with current settings to preserve any unset values
    const merged = mergeSettings(currentSettings, settings as PartialSettings);
    const yaml = serializeSettings(merged);

    fs.writeFileSync(USER_SETTINGS_FILE, yaml, 'utf-8');
    currentSettings = merged;
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// File Watching
// =============================================================================

/**
 * Watch a settings file for changes
 * Returns unsubscribe function
 */
export function watchSettings(projectDir: string, onChange: (settings: CyclistSettings) => void): () => void {
  // Watch user settings file
  try {
    ensureSettingsDir();

    fileWatcher = fs.watch(USER_SETTINGS_DIR, (eventType, filename) => {
      if (filename === 'settings.yaml') {
        const newSettings = loadSettings(projectDir);
        currentSettings = newSettings;
        onChange(newSettings);
      }
    });
  } catch {
    // Failed to watch - continue without watching
  }

  // Return unsubscribe function
  return () => {
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }
  };
}

/**
 * Watch both user and project settings files
 * Returns unsubscribe function
 */
export function watchAllSettings(projectDir: string, onChange: (settings: CyclistSettings) => void): () => void {
  const unsubUser = watchSettings(projectDir, onChange);

  // Watch project settings if directory exists
  try {
    const projectSettingsDir = path.join(projectDir, '.claude');
    if (fs.existsSync(projectSettingsDir)) {
      projectWatcher = fs.watch(projectSettingsDir, (eventType, filename) => {
        if (filename === 'cyclist.local.yaml') {
          const newSettings = loadSettings(projectDir);
          currentSettings = newSettings;
          onChange(newSettings);
        }
      });
    }
  } catch {
    // Failed to watch project dir - continue without
  }

  return () => {
    unsubUser();
    if (projectWatcher) {
      projectWatcher.close();
      projectWatcher = null;
    }
  };
}

/**
 * Stop all file watchers
 */
export function stopWatchingSettings(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  if (projectWatcher) {
    projectWatcher.close();
    projectWatcher = null;
  }
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Initialize settings on app startup
 */
export function initializeSettings(projectDir?: string): CyclistSettings {
  currentSettings = loadSettings(projectDir);
  return currentSettings;
}

/**
 * Get current in-memory settings
 */
export function getCurrentSettings(): CyclistSettings {
  return currentSettings;
}

/**
 * Check if project overrides are currently applied
 */
export function hasProjectOverrides(): boolean {
  return projectOverridesApplied;
}
