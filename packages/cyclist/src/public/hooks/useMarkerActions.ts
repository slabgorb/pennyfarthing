/**
 * useMarkerActions Hook
 *
 * Detects CYCLIST markers in message content and returns action metadata
 * for rendering QuickActions buttons.
 *
 * Story: MSSCI-12787 - Implement CYCLIST Marker Parsing and Action Buttons
 *
 * @see sprint/context/MSSCI-12787-reference/quick-actions.js.deleted
 */

import { useMemo } from 'react';
import { detectMarkers, stripMarkers, MARKER_TYPES } from '@pennyfarthing/shared/browser';

/**
 * Action types that map to different UI presentations
 */
export type ActionType =
  | 'handoff'   // Show agent button + "Not yet" option
  | 'yesno'     // Show Yes/No buttons
  | 'open'      // Show text input
  | 'choices'   // Show choice buttons
  | 'continue'  // Show Continue button
  | 'invoke'    // Auto-execute (no buttons)
  | 'context_clear'; // Clear context and reload

/**
 * Result from marker detection
 */
export interface MarkerAction {
  type: ActionType;
  value?: string;
  responses?: string[];
  choices?: Array<{ number: number; text: string }>;
  autoExecute?: boolean;
}

/**
 * Extract option text from message content for numbered choices.
 * Looks for patterns like "1. Option text" or "1) Option text".
 */
function extractChoiceTexts(
  text: string,
  choiceNumbers: number[]
): Array<{ number: number; text: string }> {
  if (!text) {
    return choiceNumbers.map(num => ({ number: num, text: `Option ${num}` }));
  }

  // Remove code blocks
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');

  // Patterns for numbered lists
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm,           // "1. Option text"
    /^\s*(\d+)\)\s+(.+)$/gm,           // "1) Option text"
    /\*\*(\d+)[.)]\*\*\s*(.+)/gm,      // "**1.** Option text"
  ];

  const foundChoices = new Map<number, string>();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(withoutCode)) !== null) {
      const num = parseInt(match[1], 10);
      if (choiceNumbers.includes(num) && !foundChoices.has(num)) {
        // Clean up the text - remove trailing markdown/formatting
        let optionText = match[2].trim();
        // Remove trailing description after " - " or " — " for cleaner button labels
        const dashIndex = optionText.search(/\s+[-—]\s+/);
        if (dashIndex > 0 && dashIndex < 30) {
          optionText = optionText.substring(0, dashIndex);
        }
        foundChoices.set(num, optionText);
      }
    }
  }

  // Return choices in order, falling back to "Option N" if not found
  return choiceNumbers.map(num => ({
    number: num,
    text: foundChoices.get(num) || `Option ${num}`,
  }));
}

/**
 * Process detected markers into action metadata
 */
function processMarkers(
  markers: ReturnType<typeof detectMarkers>,
  fullText: string
): MarkerAction | null {
  if (!markers || markers.length === 0) return null;

  const primaryMarker = markers[0];

  switch (primaryMarker.type) {
    case MARKER_TYPES.HANDOFF:
      return {
        type: 'handoff',
        value: primaryMarker.value,
        responses: [primaryMarker.value, 'Not yet'],
      };

    case MARKER_TYPES.INVOKE:
      return {
        type: 'invoke',
        value: primaryMarker.value,
        autoExecute: true,
      };

    case MARKER_TYPES.QUESTION: {
      if (primaryMarker.value === 'yesno') {
        return {
          type: 'yesno',
          responses: ['Yes', 'No'],
        };
      }
      // Handle open questions - may have suggested prompt: "open" or "open:suggested text"
      if (primaryMarker.value?.startsWith('open')) {
        // Check for suggested prompt after "open:"
        const colonIndex = primaryMarker.value.indexOf(':');
        if (colonIndex !== -1) {
          const suggestion = primaryMarker.value.substring(colonIndex + 1).trim();
          if (suggestion) {
            return {
              type: 'open',
              responses: [suggestion],
            };
          }
        }
        // Plain open question without suggestion
        return {
          type: 'open',
        };
      }
      // Check for accompanying CHOICES marker
      const choicesMarker = markers.find(m => m.type === MARKER_TYPES.CHOICES);
      if (choicesMarker) {
        return processChoicesMarker(choicesMarker.value, fullText);
      }
      return null;
    }

    case MARKER_TYPES.CHOICES:
      return processChoicesMarker(primaryMarker.value, fullText);

    case MARKER_TYPES.CONTEXT_CLEAR:
      return {
        type: 'context_clear',
        value: primaryMarker.value,
      };

    case MARKER_TYPES.CONTINUE:
      return {
        type: 'continue',
        responses: ['Continue'],
      };

    default:
      return null;
  }
}

/**
 * Process a CHOICES marker value into choice buttons
 */
function processChoicesMarker(
  value: string,
  fullText: string
): MarkerAction {
  const choiceValues = value.split(',').map(v => v.trim());
  const firstValue = choiceValues[0];
  const isNumeric = /^\d+$/.test(firstValue);

  let choices: Array<{ number: number; text: string }>;

  if (isNumeric) {
    // Legacy numeric format - extract text from message
    const choiceNumbers = choiceValues.map(n => parseInt(n, 10));
    choices = extractChoiceTexts(fullText, choiceNumbers);
  } else {
    // Text label format - use labels directly
    choices = choiceValues.map((text, index) => ({
      number: index + 1,
      text,
    }));
  }

  return {
    type: 'choices',
    choices,
    responses: choices.map(c => c.text),
  };
}

/**
 * Hook to detect CYCLIST markers in content and return action metadata.
 *
 * @param content - Message content to analyze
 * @returns MarkerAction if marker detected, null otherwise
 *
 * @example
 * ```tsx
 * const actions = useMarkerActions(message.content);
 * if (actions?.type === 'yesno') {
 *   // Render Yes/No buttons
 * }
 * ```
 */
export function useMarkerActions(content: string | undefined): MarkerAction | null {
  return useMemo(() => {
    if (!content) return null;

    const markers = detectMarkers(content);
    if (!markers) return null;

    return processMarkers(markers, content);
  }, [content]);
}

/**
 * Strip CYCLIST markers from content for display.
 *
 * @param content - Content that may contain markers
 * @returns Content with markers removed
 */
export function useStrippedContent(content: string | undefined): string {
  return useMemo(() => {
    if (!content) return '';
    return stripMarkers(content);
  }, [content]);
}
