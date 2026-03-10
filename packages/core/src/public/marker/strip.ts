/**
 * Strip functions for the Reflector marker system.
 *
 * @see docs/adr/0011-reflector-marker-consolidation.md
 */

import { MARKER_PATTERN } from './constants.js';

/**
 * Strip fenced code blocks from text.
 *
 * Used before marker detection to ensure markers inside code blocks
 * are not processed as actual markers.
 *
 * @param text - Text potentially containing fenced code blocks
 * @returns Text with code blocks removed
 */
export function stripCodeBlocks(text: string): string {
  if (!text) {
    return '';
  }
  return text.replace(/```[\s\S]*?```/g, '');
}

/**
 * Strip CYCLIST markers from text for display.
 *
 * Removes all CYCLIST markers while preserving surrounding text.
 * Useful for cleaning agent output before displaying to users.
 *
 * @param text - Text containing markers
 * @returns Text with markers removed
 */
export function stripMarkers(text: string): string {
  if (!text) {
    return '';
  }
  // Reset lastIndex since MARKER_PATTERN is global
  MARKER_PATTERN.lastIndex = 0;
  return text.replace(MARKER_PATTERN, '').trim();
}
