/**
 * @pennyfarthing/shared/browser
 * Browser-safe exports only - no Node.js APIs
 */

// Marker module - Reflector protocol marker detection
// @see docs/adr/0011-reflector-marker-consolidation.md
export {
  detectMarkers,
  stripMarkers,
  stripCodeBlocks,
  MARKER_PATTERN,
  MARKER_TYPES,
  VALID_MARKER_TYPES,
  type Marker,
  type MarkerType,
} from './marker/index.js';
