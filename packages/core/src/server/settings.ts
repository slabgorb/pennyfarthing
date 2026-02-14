/**
 * Settings Module for Cyclist
 *
 * Simple file-based persistence for Cyclist settings.
 * Settings stored in .pennyfarthing/config.local.yaml
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse, stringify } from 'yaml';

// =============================================================================
// Types
// =============================================================================

/**
 * Permission modes for Claude Code (gearshift)
 * - plan: Read-only planning mode
 * - manual: Ask permission for everything (default)
 * - accept: Auto-accept file edits
 *
 * Note: 'turbo' was removed in MSSCI-12395. Auto-handoff is now controlled
 * by the separate relay_mode setting. Old turbo configs are migrated to
 * permission_mode: 'accept' + relay_mode: true.
 */
export type PermissionMode = 'plan' | 'manual' | 'accept';

export interface WorkflowSettings {
  permission_mode: PermissionMode;
  relay_mode?: boolean;
}

// Account-specific settings for usage tracking
export interface AccountSettings {
  billing_rollover_day: 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
}

// Map of email to account settings, with optional 'default' key
export type AccountsSettings = Record<string, AccountSettings>;

export interface CyclistSettings {
  workflow: WorkflowSettings;
  accounts?: AccountsSettings;
}

// Partial settings for merging
export type PartialSettings = {
  workflow?: Partial<WorkflowSettings>;
  accounts?: AccountsSettings;
};

// Settings input from API/IPC - includes theme for routing to config.local.yaml
export type SettingsInput = PartialSettings & {
  pennyfarthing?: {
    theme?: string;
  };
};

// =============================================================================
// Constants
// =============================================================================

// User-level settings dir - for grants file
export const USER_SETTINGS_DIR = path.join(os.homedir(), '.cyclist');
// Primary settings file
export const PROJECT_SETTINGS_FILE = '.pennyfarthing/config.local.yaml';
// Grants file - cross-project permissions
export const GRANTS_FILE = path.join(os.homedir(), '.cyclist', 'grants.json');

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS: CyclistSettings = {
  workflow: {
    permission_mode: 'manual',
    relay_mode: false,
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

// Settings change callbacks
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
 */
export function parseSettings(yamlContent: string): PartialSettings {
  try {
    const parsed = parse(yamlContent);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return parsed as PartialSettings;
  } catch {
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

  // Valid permission modes (turbo removed in MSSCI-12395)
  const validModes = ['plan', 'manual', 'accept'];
  if (!validModes.includes(workflow.permission_mode as string)) {
    return false;
  }

  // Validate relay_mode if present (must be boolean)
  if ('relay_mode' in workflow && typeof workflow.relay_mode !== 'boolean') {
    return false;
  }

  return true;
}

// =============================================================================
// Settings Migration
// =============================================================================

/**
 * Migrate legacy settings to new format
 *
 * Migration paths:
 * - permission_mode: 'turbo' → permission_mode: 'accept' + relay_mode: true
 * - handoff_mode: 'auto' → relay_mode: true
 * - handoff_mode: 'manual' → relay_mode: false
 * - auto_handoff: true → relay_mode: true
 * - auto_handoff: false → relay_mode: false
 */
export function migrateSettings(settings: PartialSettings): CyclistSettings {
  const result = getDefaultSettings();

  if (settings.workflow) {
    const workflow = settings.workflow as Record<string, unknown>;

    // Handle explicit relay_mode first (new format, no migration needed)
    const hasExplicitRelay = 'relay_mode' in workflow && typeof workflow.relay_mode === 'boolean';
    if (hasExplicitRelay) {
      result.workflow.relay_mode = workflow.relay_mode as boolean;
    }

    // Handle permission_mode
    const validModes = ['plan', 'manual', 'accept'];
    if (validModes.includes(workflow.permission_mode as string)) {
      result.workflow.permission_mode = workflow.permission_mode as PermissionMode;
    }
    // Migrate 'turbo' to 'accept' + relay_mode: true
    else if (workflow.permission_mode === 'turbo') {
      result.workflow.permission_mode = 'accept';
      result.workflow.relay_mode = true;
    }

    // Migrate relay_mode from legacy handoff settings (only if not explicitly set)
    // This is INDEPENDENT of permission_mode - a user could have manual + auto handoff
    if (!hasExplicitRelay && result.workflow.relay_mode !== true) {
      if (workflow.handoff_mode === 'auto') {
        result.workflow.relay_mode = true;
      } else if (workflow.handoff_mode === 'manual') {
        result.workflow.relay_mode = false;
      }
      // Migrate from oldest format (auto_handoff boolean)
      else if ('auto_handoff' in workflow) {
        result.workflow.relay_mode = workflow.auto_handoff === true;
      }
    }
  }

  if (settings.accounts) {
    result.accounts = settings.accounts;
  }

  return result;
}

// =============================================================================
// Settings Merging
// =============================================================================

/**
 * Deep merge settings objects
 */
export function mergeSettings(base: CyclistSettings, override: PartialSettings): CyclistSettings {
  const result: CyclistSettings = JSON.parse(JSON.stringify(base));

  if (override.workflow) {
    // Valid permission modes (turbo removed in MSSCI-12395)
    const validModes = ['plan', 'manual', 'accept'];
    if (validModes.includes(override.workflow.permission_mode as string)) {
      result.workflow.permission_mode = override.workflow.permission_mode as PermissionMode;
    }
    // 'turbo' in override is rejected - keeps base value

    // Merge relay_mode if present
    if (typeof override.workflow.relay_mode === 'boolean') {
      result.workflow.relay_mode = override.workflow.relay_mode;
    }
  }

  if (override.accounts) {
    result.accounts = { ...result.accounts, ...override.accounts };
  }

  return result;
}

// =============================================================================
// File Loading
// =============================================================================

/**
 * Load project settings from .pennyfarthing/config.local.yaml
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
 * Load settings with optional project directory
 */
export function loadSettings(projectDir?: string): CyclistSettings {
  let settings = getDefaultSettings();

  if (projectDir) {
    const projectSettings = loadProjectSettings(projectDir);
    if (Object.keys(projectSettings).length > 0) {
      settings = mergeSettings(settings, projectSettings);
    }
  }

  return settings;
}

// =============================================================================
// File Saving
// =============================================================================

/**
 * @deprecated Use saveProjectSettings instead
 */
export function saveUserSettings(settings: Partial<CyclistSettings>, projectDir?: string): boolean {
  return saveProjectSettings(settings, projectDir);
}

/**
 * Save settings to .pennyfarthing/config.local.yaml
 * Uses read-modify-write: reads entire file, deep merges changes, writes back.
 */
export function saveProjectSettings(settings: Partial<CyclistSettings>, projectDir?: string): boolean {
  try {
    const dir = projectDir || process.cwd();
    const settingsPath = path.join(dir, PROJECT_SETTINGS_FILE);
    const settingsDir = path.dirname(settingsPath);

    // Ensure .pennyfarthing directory exists
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    // Read existing file - this is the source of truth
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = parse(content);
        if (parsed && typeof parsed === 'object') {
          existing = parsed as Record<string, unknown>;
        }
      } catch {
        // Corrupted file - start fresh
        existing = {};
      }
    }

    // Deep merge incoming settings into existing
    const merged = deepMergeSettings(existing, settings as Record<string, unknown>);

    // Write back - theme stays first if present for consistent ordering
    const { theme, ...rest } = merged;
    const output = theme ? { theme, ...rest } : rest;

    fs.writeFileSync(settingsPath, stringify(output), 'utf-8');

    // Update in-memory cache
    currentSettings = mergeSettings(getDefaultSettings(), merged as PartialSettings);

    // Notify callbacks
    notifySettingsChange(currentSettings);

    return true;
  } catch {
    return false;
  }
}

/**
 * Deep merge two objects, with source taking precedence.
 */
function deepMergeSettings(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMergeSettings(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
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

// =============================================================================
// Settings Change Callbacks
// =============================================================================

/**
 * Register a callback to be notified when settings change
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
// Grant Types and Validation
// =============================================================================

export const GrantType = {
  ONCE: 'once',
  SESSION: 'session',
  ALWAYS: 'always',
} as const;

export type GrantTypeValue = (typeof GrantType)[keyof typeof GrantType];

export interface PermissionGrant {
  tool: string;
  scope: string;
  grant_type: GrantTypeValue;
  granted_at: string;
}

export function validateGrant(grant: unknown): boolean {
  if (typeof grant !== 'object' || grant === null) {
    return false;
  }

  const g = grant as Record<string, unknown>;

  if (typeof g.tool !== 'string' || g.tool === '') return false;
  if (typeof g.scope !== 'string' || g.scope === '') return false;
  if (g.grant_type !== 'once' && g.grant_type !== 'session' && g.grant_type !== 'always') return false;
  if (typeof g.granted_at !== 'string') return false;

  return true;
}

// =============================================================================
// Grant File I/O
// =============================================================================

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

    return data.grants.filter(
      (g: unknown) => validateGrant(g) && (g as PermissionGrant).grant_type === 'always'
    );
  } catch {
    return [];
  }
}

export function saveGrants(grants: PermissionGrant[]): boolean {
  try {
    ensureSettingsDir();

    const persistGrants = grants.filter((g) => g.grant_type === 'always');

    const data = { grants: persistGrants };

    fs.writeFileSync(GRANTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Account Settings (Usage Tracking)
// =============================================================================

export type BillingDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

const DEFAULT_BILLING_ROLLOVER_DAY: BillingDay = 'friday';

export function getBillingRolloverDay(email: string | null): BillingDay {
  const accounts = currentSettings.accounts;

  if (!accounts) {
    return DEFAULT_BILLING_ROLLOVER_DAY;
  }

  if (email && accounts[email]?.billing_rollover_day) {
    return accounts[email].billing_rollover_day;
  }

  if (accounts['default']?.billing_rollover_day) {
    return accounts['default'].billing_rollover_day;
  }

  return DEFAULT_BILLING_ROLLOVER_DAY;
}

// =============================================================================
// Turbo Mode Detection
// =============================================================================

/**
 * Check if turbo mode is enabled (legacy compatibility function)
 *
 * Turbo mode = auto-accept everything + auto-handoff to next agent.
 * Now implemented as: permission_mode: 'accept' + relay_mode: true
 *
 * @deprecated Check permission_mode and relay_mode separately instead
 */
export function isTurboModeEnabled(settings: Pick<CyclistSettings, 'workflow'>): boolean {
  return settings.workflow?.permission_mode === 'accept' && settings.workflow?.relay_mode === true;
}

/**
 * @deprecated Use isTurboModeEnabled instead
 */
export function isAutoModeEnabled(settings: Pick<CyclistSettings, 'workflow'>): boolean {
  return isTurboModeEnabled(settings);
}
