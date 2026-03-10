/**
 * Constants for the Reflector marker system.
 *
 * @see docs/adr/0011-reflector-marker-consolidation.md
 */

/**
 * Regex pattern for CYCLIST markers.
 *
 * Format: <!-- CYCLIST:TYPE:value --> or <!-- CYCLIST:TYPE --> (for CONTINUE)
 *
 * - Case-insensitive for CYCLIST prefix and TYPE
 * - Preserves value case
 * - Handles whitespace variations
 * - Value is optional (CONTINUE marker has no value)
 *
 * Groups:
 * - [1] = TYPE (e.g., HANDOFF, CONTEXT_CLEAR, CONTINUE)
 * - [2] = value (e.g., /dev, yesno, 1,2,3) - undefined for CONTINUE
 *
 * IMPORTANT: Reset lastIndex before each use since this is a global regex.
 */
export const MARKER_PATTERN = /<!--\s*CYCLIST:(\w+)(?::([^>]+?))?\s*-->/gi;

/**
 * Known marker type constants.
 * Use these for type-safe comparisons instead of string literals.
 */
export const MARKER_TYPES = {
  HANDOFF: 'handoff',
  CONTEXT_CLEAR: 'context_clear',
  INVOKE: 'invoke',
  QUESTION: 'question',
  CHOICES: 'choices',
  CONTINUE: 'continue',
} as const;

/**
 * Valid marker types for validation.
 */
export const VALID_MARKER_TYPES = new Set([
  'handoff',
  'context_clear',
  'invoke',
  'question',
  'choices',
  'continue',
]);
