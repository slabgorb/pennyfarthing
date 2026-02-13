/**
 * Focus panel management — reads/writes focus state from config.local.yaml
 *
 * Story 104-2: WheelHub config file watch + panel focus broadcast
 * Epic 104: /bc CLI Panel Focus (MSSCI-14952)
 *
 * Extracted from websocket.ts for testability. The websocket module
 * imports these functions and wires them into the WS channel + config watcher.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Valid panel IDs that can be focused */
export const VALID_FOCUS_PANELS = [
  'sprint', 'git', 'diffs', 'todo', 'workflow',
  'background', 'audit-log', 'changed', 'ac', 'debug', 'settings',
] as const;

export type FocusPanelId = typeof VALID_FOCUS_PANELS[number];

export interface FocusMessage {
  type: 'init' | 'update';
  focus: string | null;
}

/**
 * Read the current focus value from config.local.yaml.
 * Returns the panel ID string or null if no focus is set.
 */
export function getConfigFocus(projectDir: string): string | null {
  try {
    const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
    if (!existsSync(configPath)) return null;
    const raw = readFileSync(configPath, 'utf-8');
    const config = parseYaml(raw);
    if (!config || typeof config !== 'object') return null;
    const focus = (config as Record<string, unknown>).focus;
    if (focus == null) return null;
    return String(focus);
  } catch {
    return null;
  }
}

/**
 * Determine if a focus broadcast should be sent.
 * Only returns true when the focus value has actually changed.
 */
export function shouldBroadcastFocus(
  newFocus: string | null,
  lastKnownFocus: string | null,
): boolean {
  return newFocus !== lastKnownFocus;
}

/**
 * Create a focus WebSocket message payload.
 */
export function createFocusMessage(
  type: 'init' | 'update',
  focus: string | null,
): FocusMessage {
  return { type, focus };
}

/**
 * Validate that a panel ID is a valid focus target.
 */
export function isValidFocusPanel(panelId: string): boolean {
  return (VALID_FOCUS_PANELS as readonly string[]).includes(panelId);
}
