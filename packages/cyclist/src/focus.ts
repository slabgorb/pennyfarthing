/**
 * Focus panel management — reads/writes focus state from config.local.yaml
 *
 * Story 104-2: WheelHub config file watch + panel focus broadcast
 * Epic 104: /bc CLI Panel Focus (MSSCI-14952)
 *
 * Extracted from websocket.ts for testability. The websocket module
 * imports these functions and wires them into the WS channel + config watcher.
 */

import { readFileSync } from 'node:fs';
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
export function getConfigFocus(_projectDir: string): string | null {
  // TODO: Implement — read config.local.yaml, return focus key value
  return undefined as unknown as string | null;
}

/**
 * Determine if a focus broadcast should be sent.
 * Only returns true when the focus value has actually changed.
 */
export function shouldBroadcastFocus(
  _newFocus: string | null,
  _lastKnownFocus: string | null,
): boolean {
  // TODO: Implement — compare new vs last known focus
  return undefined as unknown as boolean;
}

/**
 * Create a focus WebSocket message payload.
 */
export function createFocusMessage(
  _type: 'init' | 'update',
  _focus: string | null,
): FocusMessage {
  // TODO: Implement — return { type, focus }
  return undefined as unknown as FocusMessage;
}

/**
 * Validate that a panel ID is a valid focus target.
 */
export function isValidFocusPanel(_panelId: string): boolean {
  // TODO: Implement — check against VALID_FOCUS_PANELS
  return undefined as unknown as boolean;
}
