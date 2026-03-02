/**
 * Bell Mode - Inject Queued Messages After Tool Use (Story MSSCI-12275)
 *
 * Manages bell mode state which allows queued messages to be injected into
 * Claude's context via the PostToolUse hook, rather than waiting for Claude
 * to finish processing.
 *
 * Architecture:
 * - State persisted to `.pennyfarthing/config.local.yaml` (workflow.bell_mode)
 *   Single source of truth alongside other workflow settings (relay_mode)
 * - Queue synced to `.pennyfarthing/bell-queue.json` via React hook + REST API
 * - PostToolUse hook reads bell-queue.json and calls /api/bell-consumed
 * - Server broadcasts to /ws/bell for React hook to dequeue
 *
 * This module only handles bell mode state (enabled/disabled).
 * Queue management is handled by:
 * - React: useMessageQueue.ts (browser state + localStorage)
 * - Server: /api/bell-queue endpoint (writes to bell-queue.json)
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from 'yaml';
import { getProjectDirectory } from './paths.js';

// Configuration paths (relative to project root)
const CONFIG_LOCAL_YAML = '.pennyfarthing/config.local.yaml';

// In-memory state
let bellModeEnabled = false;

/**
 * config.local.yaml structure (partial - only what we need)
 */
interface ConfigLocalYaml {
  theme?: string;
  workflow?: {
    bell_mode?: boolean;
    handoff_mode?: string;
    relay_mode?: boolean;
    permission_mode?: string;
  };
  [key: string]: unknown;
}

/**
 * Get the project root directory (where .pennyfarthing lives)
 * Uses PF_PROJECT_DIR or CLI arg, falling back to cwd
 */
function getProjectRoot(): string {
  // Use the same project directory resolution as the rest of the app
  return getProjectDirectory() || process.cwd();
}

/**
 * Get the full path to config.local.yaml
 */
function getConfigPath(): string {
  return path.join(getProjectRoot(), CONFIG_LOCAL_YAML);
}


/**
 * Check if bell mode is currently enabled
 */
export function isBellModeEnabled(): boolean {
  return bellModeEnabled;
}

/**
 * Toggle bell mode on/off
 */
export function toggleBellMode(): void {
  bellModeEnabled = !bellModeEnabled;
  writeBellModeState();
}

/**
 * Set bell mode to a specific state
 * @param enabled - Whether bell mode should be enabled
 */
export async function setBellMode(enabled: boolean): Promise<void> {
  bellModeEnabled = enabled;
  await writeBellModeState();
}

/**
 * Write current bell mode state to config.local.yaml
 * Uses read-modify-write to preserve other settings
 */
async function writeBellModeState(): Promise<void> {
  const configPath = getConfigPath();

  // Ensure directory exists
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read existing config to preserve other settings
  let config: ConfigLocalYaml = {};
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parse(content);
      if (parsed && typeof parsed === 'object') {
        config = parsed as ConfigLocalYaml;
      }
    }
  } catch {
    // Start fresh on parse error
    config = {};
  }

  // Update workflow.bell_mode
  if (!config.workflow) {
    config.workflow = {};
  }
  config.workflow.bell_mode = bellModeEnabled;

  // Write back with theme first for consistent ordering
  const { theme, workflow, ...rest } = config;
  const ordered: ConfigLocalYaml = {};
  if (theme !== undefined) ordered.theme = theme;
  if (workflow !== undefined) ordered.workflow = workflow;
  Object.assign(ordered, rest);

  fs.writeFileSync(configPath, stringify(ordered), 'utf-8');
}

/**
 * Load bell mode state from config.local.yaml
 * Call this on startup to restore previous state
 */
export async function loadBellModeState(): Promise<void> {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = parse(content) as ConfigLocalYaml;
      bellModeEnabled = config?.workflow?.bell_mode ?? false;
    } else {
      // Default to disabled if no config file
      bellModeEnabled = false;
    }
  } catch {
    // Default to disabled on any error
    bellModeEnabled = false;
  }
}

/**
 * Reset bell mode state (for testing)
 */
export function resetBellMode(): void {
  bellModeEnabled = false;
}
