/**
 * Marker detection for the Reflector protocol.
 *
 * @see docs/adr/0011-reflector-marker-consolidation.md
 */

import { MARKER_PATTERN, VALID_MARKER_TYPES } from './constants.js';
import { stripCodeBlocks } from './strip.js';
import type { Marker, MarkerType } from './types.js';

/**
 * Detect CYCLIST markers in text.
 *
 * Scans text for CYCLIST markers and returns an array of parsed markers.
 * Code blocks are stripped before detection to prevent false positives
 * from markers appearing inside code examples.
 *
 * @param text - Text to scan for markers
 * @returns Array of markers found, or null if none
 *
 * @example
 * ```typescript
 * const text = '<!-- CYCLIST:HANDOFF:/dev -->';
 * const markers = detectMarkers(text);
 * // markers = [{ type: 'handoff', value: '/dev', source: 'structured_marker' }]
 * ```
 */
export function detectMarkers(text: string): Marker[] | null {
  // Handle null/undefined/empty input
  if (!text) {
    return null;
  }

  // Strip code blocks first - markers inside code should be ignored
  const withoutCode = stripCodeBlocks(text);
  if (!withoutCode.trim()) {
    return null;
  }

  const markers: Marker[] = [];

  // Reset lastIndex for global regex
  MARKER_PATTERN.lastIndex = 0;

  let match;
  while ((match = MARKER_PATTERN.exec(withoutCode)) !== null) {
    const rawType = match[1].toLowerCase();

    // Skip unknown marker types
    if (!VALID_MARKER_TYPES.has(rawType)) {
      continue;
    }

    markers.push({
      type: rawType as MarkerType,
      value: match[2]?.trim() ?? '',
      source: 'structured_marker',
    });
  }

  return markers.length > 0 ? markers : null;
}
