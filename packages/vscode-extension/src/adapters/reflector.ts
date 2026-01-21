/**
 * Reflector Protocol Adapter
 *
 * Parses CYCLIST HTML comments from Claude output and triggers
 * VS Code UI actions (notifications, quick picks, commands).
 *
 * MSSCI-12049 (Pivoted)
 */

import * as vscode from 'vscode';

// ============================================================================
// Types
// ============================================================================

/**
 * Marker types supported by the Reflector protocol.
 */
export type MarkerType = 'HANDOFF' | 'CONTEXT_CLEAR' | 'QUESTION' | 'CHOICES';

/**
 * A detected CYCLIST marker from Claude output.
 */
export interface CyclistMarker {
  type: MarkerType;
  value: string;
}

/**
 * Result of processing text through the ReflectorAdapter.
 */
export interface ProcessTextResult {
  /** Text with CYCLIST markers removed, safe to display */
  displayText: string;
  /** Markers that were detected and processed */
  markers: CyclistMarker[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Regex pattern for detecting CYCLIST markers.
 * Format: <!-- CYCLIST:TYPE:value -->
 */
const MARKER_PATTERN =
  /<!--\s*CYCLIST:(HANDOFF|CONTEXT_CLEAR|QUESTION|CHOICES):([^\s][^-]*?)\s*-->/g;

/**
 * Valid marker types that we recognize.
 */
const VALID_TYPES: Set<string> = new Set([
  'HANDOFF',
  'CONTEXT_CLEAR',
  'QUESTION',
  'CHOICES',
]);

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Detect CYCLIST markers in text.
 *
 * @param text - Raw text that may contain CYCLIST markers
 * @returns Array of detected markers
 */
export function detectMarkers(text: string): CyclistMarker[] {
  if (!text) {
    return [];
  }

  const markers: CyclistMarker[] = [];
  const regex = new RegExp(MARKER_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [, type, value] = match;
    if (VALID_TYPES.has(type)) {
      markers.push({
        type: type as MarkerType,
        value: value.trim(),
      });
    }
  }

  return markers;
}

/**
 * Remove CYCLIST markers from text, preserving other content.
 *
 * @param text - Text that may contain CYCLIST markers
 * @returns Text with CYCLIST markers removed
 */
export function stripMarkers(text: string): string {
  if (!text) {
    return '';
  }

  return text.replace(MARKER_PATTERN, '');
}

/**
 * Process a single marker by triggering appropriate VS Code UI action.
 *
 * @param marker - The marker to process
 * @returns Result of user interaction, if any
 */
export async function processMarker(
  marker: CyclistMarker
): Promise<string | undefined> {
  try {
    switch (marker.type) {
      case 'HANDOFF':
        return await handleHandoff(marker.value);

      case 'CONTEXT_CLEAR':
        return await handleContextClear(marker.value);

      case 'QUESTION':
        return await handleQuestion(marker.value);

      case 'CHOICES':
        return await handleChoices(marker.value);

      default:
        return undefined;
    }
  } catch (error) {
    // Gracefully handle errors - don't propagate to caller
    console.error(`[Reflector] Error processing ${marker.type} marker:`, error);
    return undefined;
  }
}

// ============================================================================
// Marker Handlers
// ============================================================================

/**
 * Handle HANDOFF marker - show notification with action button.
 */
async function handleHandoff(value: string): Promise<string | undefined> {
  const actionText = `Switch to ${value}`;
  const result = await vscode.window.showInformationMessage(
    `Ready to hand off to ${value.replace('/', '')} agent`,
    actionText
  );

  if (result === actionText) {
    await vscode.commands.executeCommand('pennyfarthing.switchAgent', value);
    return result;
  }

  return undefined;
}

/**
 * Handle CONTEXT_CLEAR marker - execute context clear command.
 */
async function handleContextClear(value: string): Promise<string | undefined> {
  await vscode.commands.executeCommand('pennyfarthing.contextClear', value);
  return value;
}

/**
 * Handle QUESTION marker - show quick pick with Yes/No options.
 */
async function handleQuestion(value: string): Promise<string | undefined> {
  if (value === 'yesno') {
    return await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Please select an option',
    });
  }

  // Future: support other question types
  return undefined;
}

/**
 * Handle CHOICES marker - show quick pick with parsed options.
 */
async function handleChoices(value: string): Promise<string | undefined> {
  const choices = value.split(',').map((choice) => choice.trim());

  return await vscode.window.showQuickPick(choices, {
    placeHolder: 'Please select an option',
  });
}

// ============================================================================
// ReflectorAdapter Class
// ============================================================================

/**
 * Adapter for integrating Reflector with chat-participant.
 *
 * Handles buffering of incomplete markers split across text chunks.
 */
export class ReflectorAdapter {
  /** Buffer for incomplete marker at end of previous chunk */
  private buffer: string = '';

  /**
   * Process text chunk from ClaudeService.
   *
   * Detects markers, strips them from display text, and triggers VS Code actions.
   *
   * @param text - Text chunk from Claude output
   * @returns Processed result with display text and markers found
   */
  async processText(text: string): Promise<ProcessTextResult> {
    if (!text) {
      return { displayText: '', markers: [] };
    }

    // Combine with buffer from previous chunk
    const combinedText = this.buffer + text;

    // Check for incomplete marker at end (starts with <!-- but no closing -->)
    const incompleteMarkerMatch = combinedText.match(/<!--[^>]*$/);
    let textToProcess: string;

    if (incompleteMarkerMatch) {
      // Save incomplete marker to buffer, process the rest
      const incompleteStart = incompleteMarkerMatch.index!;
      textToProcess = combinedText.substring(0, incompleteStart);
      this.buffer = combinedText.substring(incompleteStart);
    } else {
      // No incomplete marker, process everything
      textToProcess = combinedText;
      this.buffer = '';
    }

    // Detect markers in text to process
    const markers = detectMarkers(textToProcess);

    // Strip markers for display
    const displayText = stripMarkers(textToProcess);

    // Process each marker (fire-and-forget for UI actions)
    for (const marker of markers) {
      // Don't await - let UI actions happen asynchronously
      processMarker(marker).catch((err) => {
        console.error(`[Reflector] Failed to process marker:`, err);
      });
    }

    return { displayText, markers };
  }

  /**
   * Reset the buffer (e.g., between conversations).
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * Flush any remaining buffered text.
   * Call at end of stream to process any incomplete markers.
   */
  async flush(): Promise<ProcessTextResult> {
    if (!this.buffer) {
      return { displayText: '', markers: [] };
    }

    const text = this.buffer;
    this.buffer = '';

    const markers = detectMarkers(text);
    const displayText = stripMarkers(text);

    for (const marker of markers) {
      processMarker(marker).catch((err) => {
        console.error(`[Reflector] Failed to process marker:`, err);
      });
    }

    return { displayText, markers };
  }
}
