/**
 * Type definitions for the Reflector marker system.
 *
 * @see docs/adr/0011-reflector-marker-consolidation.md
 */

/**
 * Marker types supported by the Reflector protocol.
 * These map to UI actions in Cyclist and VS Code extension.
 */
export type MarkerType =
  | 'handoff'
  | 'context_clear'
  | 'invoke'
  | 'question'
  | 'choices'
  | 'continue';

/**
 * Parsed marker from agent output.
 *
 * @property type - The marker type (normalized to lowercase)
 * @property value - The marker value (case preserved)
 * @property source - Optional source identifier (always 'structured_marker' when detected)
 */
export interface Marker {
  type: MarkerType;
  value: string;
  source?: 'structured_marker';
}
