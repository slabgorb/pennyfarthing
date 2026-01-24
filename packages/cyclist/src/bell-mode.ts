/**
 * Bell Mode - Inject Queued Messages After Tool Use (Story MSSCI-12275)
 *
 * Manages bell mode state which allows queued messages to be injected into
 * Claude's context via the PostToolUse hook, rather than waiting for Claude
 * to finish processing.
 *
 * Architecture:
 * - State persisted to `.pennyfarthing/bell-mode.json` (read by hook script)
 * - Queue synced to `.pennyfarthing/bell-queue.json` (read by hook script)
 * - Hook script returns additionalContext JSON when conditions met
 *
 * Integration:
 * - Directly imports message-queue.js to share queue state
 * - Works in both browser (via happy-dom in tests) and Node.js contexts
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProjectDirectory } from './paths.js';

// Configuration paths (relative to project root)
const BELL_MODE_CONFIG = '.pennyfarthing/bell-mode.json';
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
 * Bell mode configuration file structure
 */
interface BellModeConfig {
  enabled: boolean;
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
 * Get the full path to the bell mode config file
 */
function getConfigPath(): string {
  return path.join(getProjectRoot(), BELL_MODE_CONFIG);
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
 * Write current bell mode state to config file
 */
async function writeBellModeState(): Promise<void> {
  const configPath = getConfigPath();
  const config: BellModeConfig = { enabled: bellModeEnabled };

  // Ensure directory exists
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load bell mode state from config file
 * Call this on startup to restore previous state
 */
export async function loadBellModeState(): Promise<void> {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const config: BellModeConfig = JSON.parse(content);
      bellModeEnabled = config.enabled ?? false;
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
