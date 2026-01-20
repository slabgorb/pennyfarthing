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
  handoff_mode: 'auto' | 'manual';
}

// Legacy settings format for migration
export interface LegacyWorkflowSettings {
  auto_handoff?: boolean;
  handoff_confirm?: boolean;
}

export interface DisplaySettings {
  show_flow: boolean;
  show_ocean: boolean;
  sidebar_width: number;
  font_ui: string;
  font_mono: string;
}

export interface NotificationSettings {
  phase_change: boolean;
  sound: boolean;
}

export interface PennyfarthingSettings {
  // theme is stored ONLY in .pennyfarthing/config.local.yaml, not in CyclistSettings
  favorites: string[];
  recentThemes: string[];
}

// Account-specific settings for usage tracking
export interface AccountSettings {
  billing_rollover_day: 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
}

// Map of email to account settings, with optional 'default' key
export type AccountsSettings = Record<string, AccountSettings>;

export interface CyclistSettings {
  workflow: WorkflowSettings;
  display: DisplaySettings;
  notifications: NotificationSettings;
  pennyfarthing: PennyfarthingSettings;
  accounts?: AccountsSettings;
}

// Partial settings for merging (internal use - theme not included)
export type PartialSettings = {
  workflow?: Partial<WorkflowSettings>;
  display?: Partial<DisplaySettings>;
  notifications?: Partial<NotificationSettings>;
  pennyfarthing?: Partial<PennyfarthingSettings>;
  accounts?: AccountsSettings;
};

// Settings input from API/IPC - includes theme for routing to config.local.yaml
// Theme is accepted here but NOT persisted to CyclistSettings - it goes to config.local.yaml only
export type SettingsInput = PartialSettings & {
  pennyfarthing?: Partial<PennyfarthingSettings> & {
    theme?: string;
  };
};

// =============================================================================
// Constants
// =============================================================================

export const USER_SETTINGS_DIR = path.join(os.homedir(), '.cyclist');
export const USER_SETTINGS_FILE = path.join(USER_SETTINGS_DIR, 'settings.yaml');
export const PROJECT_SETTINGS_FILE = '.claude/cyclist.local.yaml';
export const GRANTS_FILE = path.join(os.homedir(), '.cyclist', 'grants.json');

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS: CyclistSettings = {
  workflow: {
    handoff_mode: 'manual',
  },
  display: {
    show_flow: true,
    show_ocean: false,
    sidebar_width: 300,
    font_ui: 'system-ui',
    font_mono: 'SF Mono',
  },
  notifications: {
    phase_change: true,
    sound: false,
  },
  pennyfarthing: {
    // theme is stored ONLY in .pennyfarthing/config.local.yaml
    favorites: [],
    recentThemes: [],
  },
};

/** Maximum number of recent themes to track (Story 35-8) */
const MAX_RECENT_THEMES = 5;

/**
 * Get a copy of the default settings
 */
export function getDefaultSettings(): CyclistSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

/**
 * Normalize settings to enforce constraints
 * Story 35-8: Caps recentThemes to MAX_RECENT_THEMES entries
 */
export function normalizeSettings(settings: CyclistSettings): CyclistSettings {
  const result = JSON.parse(JSON.stringify(settings)) as CyclistSettings;

  // Cap recentThemes to MAX_RECENT_THEMES
  if (result.pennyfarthing.recentThemes.length > MAX_RECENT_THEMES) {
    result.pennyfarthing.recentThemes = result.pennyfarthing.recentThemes.slice(0, MAX_RECENT_THEMES);
  }

  return result;
}

/**
 * Add a theme to recent themes list
 * Story 35-8: Moves theme to front if already present, caps at MAX_RECENT_THEMES
 */
export function addToRecentThemes(settings: CyclistSettings, themeId: string): CyclistSettings {
  const result = JSON.parse(JSON.stringify(settings)) as CyclistSettings;

  // Remove if already in list (will be added to front)
  const filtered = result.pennyfarthing.recentThemes.filter((t) => t !== themeId);

  // Add to front and cap
  result.pennyfarthing.recentThemes = [themeId, ...filtered].slice(0, MAX_RECENT_THEMES);

  return result;
}

// =============================================================================
// In-memory State
// =============================================================================

let currentSettings: CyclistSettings = getDefaultSettings();
let projectOverridesApplied = false;
let fileWatcher: fs.FSWatcher | null = null;
let projectWatcher: fs.FSWatcher | null = null;

// Settings change callbacks (AC5)
const settingsChangeCallbacks: Array<(settings: CyclistSettings) => void> = [];

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
 * AC6: Enhanced validation with range checks and non-empty string validation
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
  // handoff_mode must be 'auto' or 'manual'
  if (workflow.handoff_mode !== 'auto' && workflow.handoff_mode !== 'manual') {
    return false;
  }

  // Check display section
  if (typeof s.display !== 'object' || s.display === null) {
    return false;
  }
  const display = s.display as Record<string, unknown>;
  if (typeof display.show_flow !== 'boolean') return false;
  if (typeof display.show_ocean !== 'boolean') return false;
  if (typeof display.sidebar_width !== 'number') return false;
  // AC6: Validate sidebar_width range (200-500)
  if (display.sidebar_width < 200 || display.sidebar_width > 500) return false;
  // AC6: Font settings must be non-empty strings if present
  if (display.font_ui !== undefined) {
    if (typeof display.font_ui !== 'string' || display.font_ui === '') return false;
  }
  if (display.font_mono !== undefined) {
    if (typeof display.font_mono !== 'string' || display.font_mono === '') return false;
  }

  // Check notifications section
  if (typeof s.notifications !== 'object' || s.notifications === null) {
    return false;
  }
  const notifications = s.notifications as Record<string, unknown>;
  if (typeof notifications.phase_change !== 'boolean') return false;
  if (typeof notifications.sound !== 'boolean') return false;

  // Check pennyfarthing section
  if (typeof s.pennyfarthing !== 'object' || s.pennyfarthing === null) {
    return false;
  }
  const pennyfarthing = s.pennyfarthing as Record<string, unknown>;
  // theme is NOT validated here - it's stored ONLY in .pennyfarthing/config.local.yaml
  if (!Array.isArray(pennyfarthing.favorites)) return false;

  return true;
}

// =============================================================================
// Settings Migration (31-13)
// =============================================================================

/**
 * Migrate legacy settings (auto_handoff + handoff_confirm) to new format (handoff_mode)
 * Story 31-13: Context-aware handoffs with auto-compaction
 *
 * Migration logic:
 * - auto_handoff: true → handoff_mode: 'auto'
 * - auto_handoff: false → handoff_mode: 'manual'
 *
 * @param settings - Parsed settings (may be legacy or new format)
 * @returns Settings in new format with handoff_mode
 */
export function migrateSettings(settings: PartialSettings): CyclistSettings {
  const result = getDefaultSettings();

  // Handle workflow migration
  if (settings.workflow) {
    const workflow = settings.workflow as Record<string, unknown>;

    // Check for new format first
    if (workflow.handoff_mode === 'auto' || workflow.handoff_mode === 'manual') {
      result.workflow.handoff_mode = workflow.handoff_mode;
    }
    // Migrate from legacy format
    else if ('auto_handoff' in workflow) {
      result.workflow.handoff_mode = workflow.auto_handoff === true ? 'auto' : 'manual';
    }
  }

  // Merge other sections normally
  if (settings.display) {
    result.display = { ...result.display, ...settings.display };
  }
  if (settings.notifications) {
    result.notifications = { ...result.notifications, ...settings.notifications };
  }
  if (settings.pennyfarthing) {
    result.pennyfarthing = { ...result.pennyfarthing, ...settings.pennyfarthing };
  }

  return result;
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
    if (override.workflow.handoff_mode === 'auto' || override.workflow.handoff_mode === 'manual') {
      result.workflow.handoff_mode = override.workflow.handoff_mode;
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
    if (typeof override.display.font_ui === 'string') {
      result.display.font_ui = override.display.font_ui;
    }
    if (typeof override.display.font_mono === 'string') {
      result.display.font_mono = override.display.font_mono;
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

  if (override.pennyfarthing) {
    // theme is NOT merged here - it's stored ONLY in .pennyfarthing/config.local.yaml
    if (Array.isArray(override.pennyfarthing.favorites)) {
      result.pennyfarthing.favorites = override.pennyfarthing.favorites;
    }
    if (Array.isArray(override.pennyfarthing.recentThemes)) {
      result.pennyfarthing.recentThemes = override.pennyfarthing.recentThemes;
    }
  }

  // Merge accounts settings (override replaces base entirely per-account)
  if (override.accounts) {
    result.accounts = { ...result.accounts, ...override.accounts };
  }

  return result;
}

// =============================================================================
// File Loading
// =============================================================================

/**
 * Load user settings from ~/.cyclist/settings.yaml
 * Returns default settings if file doesn't exist or is invalid
 * Note: theme is stripped - it's stored ONLY in .pennyfarthing/config.local.yaml
 */
function loadUserSettingsFile(): PartialSettings {
  try {
    if (fs.existsSync(USER_SETTINGS_FILE)) {
      const content = fs.readFileSync(USER_SETTINGS_FILE, 'utf-8');
      const parsed = parseSettings(content);
      // Strip theme - it's stored ONLY in .pennyfarthing/config.local.yaml
      if (parsed.pennyfarthing) {
        const { theme: _theme, ...pennyfarthingWithoutTheme } = parsed.pennyfarthing as Record<string, unknown>;
        parsed.pennyfarthing = pennyfarthingWithoutTheme as Partial<PennyfarthingSettings>;
      }
      return parsed;
    }
  } catch {
    // Error reading file - return empty
  }
  return {};
}

/**
 * Load project settings from .claude/cyclist.local.yaml
 * Returns empty object if file doesn't exist or is invalid
 * Note: theme is stripped - it's stored ONLY in .pennyfarthing/config.local.yaml
 */
export function loadProjectSettings(projectDir: string): PartialSettings {
  try {
    const projectSettingsPath = path.join(projectDir, PROJECT_SETTINGS_FILE);
    if (fs.existsSync(projectSettingsPath)) {
      const content = fs.readFileSync(projectSettingsPath, 'utf-8');
      const parsed = parseSettings(content);
      // Strip theme - it's stored ONLY in .pennyfarthing/config.local.yaml
      if (parsed.pennyfarthing) {
        const { theme: _theme, ...pennyfarthingWithoutTheme } = parsed.pennyfarthing as Record<string, unknown>;
        parsed.pennyfarthing = pennyfarthingWithoutTheme as Partial<PennyfarthingSettings>;
      }
      return parsed;
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

    // AC5: Notify registered callbacks of settings change
    notifySettingsChange(merged);

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

// =============================================================================
// Settings Change Callbacks (AC5)
// =============================================================================

/**
 * Register a callback to be notified when settings change
 * Returns an unsubscribe function
 * AC5: Supports testable state flows
 */
export function onSettingsChange(callback: (settings: CyclistSettings) => void): () => void {
  settingsChangeCallbacks.push(callback);
  return () => {
    const index = settingsChangeCallbacks.indexOf(callback);
    if (index !== -1) {
      settingsChangeCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify all registered callbacks of a settings change
 * Called internally when settings are updated
 */
function notifySettingsChange(settings: CyclistSettings): void {
  for (const callback of settingsChangeCallbacks) {
    try {
      callback(settings);
    } catch (err) {
      console.error('Settings change callback error:', err);
    }
  }
}

// =============================================================================
// Grant Types and Validation (AC1, AC6)
// =============================================================================

/**
 * Grant type enum for permission scopes
 */
export const GrantType = {
  ONCE: 'once',
  SESSION: 'session',
  ALWAYS: 'always',
} as const;

export type GrantTypeValue = (typeof GrantType)[keyof typeof GrantType];

/**
 * Permission grant structure
 */
export interface PermissionGrant {
  tool: string;
  scope: string;
  grant_type: GrantTypeValue;
  granted_at: string;
}

/**
 * Validate a permission grant object
 * AC6: Validates grant_type enum, non-empty tool and scope
 */
export function validateGrant(grant: unknown): boolean {
  if (typeof grant !== 'object' || grant === null) {
    return false;
  }

  const g = grant as Record<string, unknown>;

  // Tool must be non-empty string
  if (typeof g.tool !== 'string' || g.tool === '') {
    return false;
  }

  // Scope must be non-empty string
  if (typeof g.scope !== 'string' || g.scope === '') {
    return false;
  }

  // grant_type must be one of the valid types
  if (g.grant_type !== 'once' && g.grant_type !== 'session' && g.grant_type !== 'always') {
    return false;
  }

  // granted_at must be a string (ISO date)
  if (typeof g.granted_at !== 'string') {
    return false;
  }

  return true;
}

// =============================================================================
// Grant File I/O (AC1)
// =============================================================================

/**
 * Load grants from the grants file
 * AC1: settings.ts is single source of truth for file-based settings
 * Returns empty array if file doesn't exist or is corrupted
 */
export function loadGrants(): PermissionGrant[] {
  try {
    ensureSettingsDir();

    if (!fs.existsSync(GRANTS_FILE)) {
      return [];
    }

    const content = fs.readFileSync(GRANTS_FILE, 'utf-8');
    const data = JSON.parse(content);

    if (!data || !Array.isArray(data.grants)) {
      return [];
    }

    // Filter to only valid grants (type 'always' for persistence)
    return data.grants.filter(
      (g: unknown) => validateGrant(g) && (g as PermissionGrant).grant_type === 'always'
    );
  } catch {
    // Corrupted file or parse error - return empty array
    return [];
  }
}

/**
 * Save grants to the grants file
 * AC1: settings.ts is single source of truth for file-based settings
 * Returns true on success, false on failure
 */
export function saveGrants(grants: PermissionGrant[]): boolean {
  try {
    ensureSettingsDir();

    // Only persist 'always' grants
    const persistGrants = grants.filter((g) => g.grant_type === 'always');

    const data = {
      grants: persistGrants,
    };

    fs.writeFileSync(GRANTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Account Settings (Usage Tracking)
// =============================================================================

/** Valid day names for billing rollover */
export type BillingDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

/** Default billing rollover day */
const DEFAULT_BILLING_ROLLOVER_DAY: BillingDay = 'friday';

/**
 * Get the billing rollover day for a specific user email
 * Lookup priority:
 * 1. Exact email match in accounts
 * 2. 'default' key in accounts
 * 3. Hardcoded default ('friday')
 *
 * @param email - User email address (from OTEL user.email attribute)
 * @returns The billing rollover day for this account
 */
export function getBillingRolloverDay(email: string | null): BillingDay {
  const accounts = currentSettings.accounts;

  if (!accounts) {
    return DEFAULT_BILLING_ROLLOVER_DAY;
  }

  // Try exact email match
  if (email && accounts[email]?.billing_rollover_day) {
    return accounts[email].billing_rollover_day;
  }

  // Try default account
  if (accounts['default']?.billing_rollover_day) {
    return accounts['default'].billing_rollover_day;
  }

  return DEFAULT_BILLING_ROLLOVER_DAY;
}

// =============================================================================
// Auto Mode Detection (MSSCI-11840)
// =============================================================================

/**
 * Check if auto mode is enabled in the provided settings
 *
 * Used to determine whether to emit CONTEXT_CLEAR markers on handoff.
 *
 * @param settings - Settings object with workflow section
 * @returns true if handoff_mode is 'auto'
 */
export function isAutoModeEnabled(settings: Pick<CyclistSettings, 'workflow'>): boolean {
  return settings.workflow?.handoff_mode === 'auto';
}
