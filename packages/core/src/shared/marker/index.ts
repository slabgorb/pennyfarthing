/**
 * Marker Module - Shared marker parsing for Reflector protocol
 *
 * This module consolidates marker detection/stripping logic used by:
 * - Cyclist terminal (quick-actions.js)
 * - VS Code extension (reflector.ts)
 *
 * @see docs/adr/0011-reflector-marker-consolidation.md
 */

// Types
export { type MarkerType, type Marker } from './types.js';

// Constants
export { MARKER_PATTERN, MARKER_TYPES, VALID_MARKER_TYPES } from './constants.js';

// Functions
export { stripCodeBlocks, stripMarkers } from './strip.js';
export { detectMarkers } from './detect.js';
