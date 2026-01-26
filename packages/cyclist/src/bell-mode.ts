/**
 * Bell Mode - Inject Queued Messages After Tool Use (Story MSSCI-12275)
 *
 * Manages bell mode state which allows queued messages to be injected into
 * Claude's context via the PostToolUse hook, rather than waiting for Claude
 * to finish processing.
 *
 * Architecture:
 * - State persisted to `.pennyfarthing/config.local.yaml` (workflow.bell_mode)
 *   Single source of truth alongside other workflow settings (handoff_mode, relay_mode)
 * - Queue synced to `.pennyfarthing/bell-queue.json` (read by hook script)
 * - Hook script returns additionalContext JSON when conditions met
 *
 * Integration:
 * - Directly imports message-queue.js to share queue state
 * - Works in both browser (via happy-dom in tests) and Node.js contexts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from 'yaml';
import { getProjectDirectory } from './paths.js';

// Configuration paths (relative to project root)
const CONFIG_LOCAL_YAML = '.pennyfarthing/config.local.yaml';
const BELL_QUEUE_FILE = '.pennyfarthing/bell-queue.json';

// In-memory state
let bellModeEnabled = false;

// Dynamically loaded queue module (lazy loaded to avoid circular deps)
let queueModule: {
  getMessageQueue: () => Array<{ text: string; images: unknown[] }>;
  dequeueMessage: () => { text: string; images: unknown[] } | null;
} | null = null;

/**
 * Interface for queued message
 */
interface _QueuedMessage {
  text: string;
  images: unknown[];
}

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
 * Lazy-load the message queue module
 * Uses dynamic import to avoid circular dependency issues
 */
async function getQueueModule(): Promise<typeof queueModule> {
  if (!queueModule) {
    try {
      // Dynamic import to load the browser module
      // @ts-expect-error - JS module without type declarations
      const mod = await import('./public/js/editor/message-queue.js');
      queueModule = {
        getMessageQueue: mod.getMessageQueue as () => Array<{ text: string; images: unknown[] }>,
        dequeueMessage: mod.dequeueMessage as () => { text: string; images: unknown[] } | null,
      };
    } catch {
      // Module not available (e.g., in pure Node.js context without happy-dom)
      return null;
    }
  }
  return queueModule;
}

/**
 * Get the project root directory (where .pennyfarthing lives)
 * Uses CYCLIST_PROJECT_DIR or CLI arg, falling back to cwd
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
 * Get the full path to the bell queue file
 */
function getQueuePath(): string {
  return path.join(getProjectRoot(), BELL_QUEUE_FILE);
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
 * Sync message queue to file for hook script to read
 * Only writes if bell mode is enabled
 */
export async function syncQueueToFile(): Promise<void> {
  const queuePath = getQueuePath();

  if (!bellModeEnabled) {
    // When disabled, ensure no stale queue file exists
    if (fs.existsSync(queuePath)) {
      fs.unlinkSync(queuePath);
    }
    return;
  }

  // Get queue from the message-queue module
  const mod = await getQueueModule();
  const queue = mod ? mod.getMessageQueue() : [];

  // Ensure directory exists
  const dir = path.dirname(queuePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

/**
 * Called when the PostToolUse hook has consumed a message
 * Dequeues the first message and updates the queue file
 */
export async function onHookConsumed(): Promise<void> {
  // Dequeue the first message from the shared queue
  const mod = await getQueueModule();
  if (mod) {
    mod.dequeueMessage();
  }

  // Update the queue file
  await syncQueueToFile();
}

/**
 * Initialize bell mode (optional - queue module is auto-loaded)
 * Can be called to pre-warm the queue module connection
 */
export async function initBellMode(): Promise<void> {
  await getQueueModule();
}

/**
 * Reset bell mode state (for testing)
 */
export function resetBellMode(): void {
  bellModeEnabled = false;
  queueModule = null;
}
