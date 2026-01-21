/**
 * Reflector Protocol Adapter for VS Code Extension
 *
 * Parses CYCLIST markers from Claude output and maps to VS Code UI actions.
 *
 * Marker Format: <!-- CYCLIST:TYPE:value -->
 *
 * Types:
 * - HANDOFF: Show notification with agent button
 * - CONTEXT_CLEAR: Execute context clear command
 * - QUESTION: Show quick pick (yesno)
 * - CHOICES: Show quick pick with options
 */

import * as vscode from 'vscode';
import type { WebSocketManager, MessageData } from '../server/websocket-manager';

/**
 * Marker object returned by detectMarkers
 */
export interface Marker {
  type: 'handoff' | 'context_clear' | 'question' | 'choices';
  value: string;
}

/**
 * Regex pattern for CYCLIST markers.
 * Ported from Cyclist's quick-actions.js:160
 * Pattern: <!-- CYCLIST:TYPE:value -->
 * Case-insensitive for CYCLIST prefix and TYPE, preserves value case
 */
const MARKER_PATTERN = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;

/**
 * Strip code blocks from text before marker detection.
 * Markers inside code blocks should not be processed.
 */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

/**
 * Detect CYCLIST markers in text.
 *
 * @param text - Text to scan for markers
 * @returns Array of markers found, or null if none
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

    // Map marker types to our interface types
    let type: Marker['type'];
    switch (rawType) {
      case 'handoff':
        type = 'handoff';
        break;
      case 'context_clear':
        type = 'context_clear';
        break;
      case 'question':
        type = 'question';
        break;
      case 'choices':
        type = 'choices';
        break;
      default:
        // Skip unknown marker types
        continue;
    }

    markers.push({
      type,
      value: match[2].trim(),
    });
  }

  return markers.length > 0 ? markers : null;
}

/**
 * Strip CYCLIST markers from text for display.
 *
 * @param text - Text containing markers
 * @returns Text with markers removed
 */
export function stripMarkers(text: string): string {
  if (!text) {
    return '';
  }

  // Remove all CYCLIST markers, preserving other content
  return text.replace(MARKER_PATTERN, '').trim();
}

/**
 * Extract numbered choice text from message content.
 * Looks for patterns like "1. Option text" or "1) Option text".
 *
 * @param text - Full message text
 * @param choiceNumbers - Array of choice numbers to extract
 * @returns Array of choice labels
 */
function extractChoiceTexts(text: string, choiceNumbers: number[]): string[] {
  const foundChoices = new Map<number, string>();

  // Patterns for numbered lists
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm, // "1. Option text"
    /^\s*(\d+)\)\s+(.+)$/gm, // "1) Option text"
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      if (choiceNumbers.includes(num) && !foundChoices.has(num)) {
        foundChoices.set(num, match[2].trim());
      }
    }
  }

  // Return choices in order, falling back to "Option N" if not found
  return choiceNumbers.map(
    (num) => foundChoices.get(num) || `Option ${num}`
  );
}

/**
 * ReflectorAdapter processes text and triggers VS Code UI actions.
 */
export class ReflectorAdapter {
  private messageUnsubscribe: (() => void) | null = null;

  /**
   * Connect to WheelHub WebSocket manager for message streaming.
   * Listens for Claude responses and processes Reflector markers.
   *
   * @param wsManager - WebSocketManager from WheelHub adapter
   */
  connectToWheelHub(wsManager: WebSocketManager): void {
    // Unsubscribe from any previous connection
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
    }

    // Subscribe to messages channel
    this.messageUnsubscribe = wsManager.onMessages((data: MessageData) => {
      // Process text chunks that may contain markers
      if (data.type === 'chunk' && data.content) {
        // Fire-and-forget: process markers asynchronously
        this.processText(data.content).catch((err) => {
          console.error('[ReflectorAdapter] Error processing text:', err);
        });
      }
    });
  }

  /**
   * Dispose of the adapter and clean up subscriptions.
   */
  dispose(): void {
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }
  }

  /**
   * Reset state for a new conversation.
   * Called by chat-participant at the start of each request.
   */
  reset(): void {
    // No-op for WheelHub-based adapter - state is per-message
    // This method exists for API compatibility with chat-participant
  }

  /**
   * Flush any buffered content.
   * Called by chat-participant at the end of streaming.
   *
   * @returns Object with displayText (may be empty)
   */
  async flush(): Promise<{ displayText: string }> {
    // No-op for WheelHub-based adapter - we process markers immediately
    // This method exists for API compatibility with chat-participant
    return { displayText: '' };
  }

  /**
   * Process text for CYCLIST markers and trigger appropriate VS Code UI.
   * For chat-participant: returns text with markers stripped.
   * For WheelHub: also fires VS Code UI actions.
   *
   * @param text - Text to process
   * @returns Object with displayText (markers stripped)
   */
  async processText(text: string): Promise<{ displayText: string }> {
    const markers = detectMarkers(text);
    const displayText = stripMarkers(text);

    if (markers) {
      // Process each marker (fire VS Code UI actions)
      for (const marker of markers) {
        await this.processMarker(marker, text);
      }
    }

    return { displayText };
  }

  /**
   * Process a single marker and trigger VS Code UI.
   */
  private async processMarker(marker: Marker, fullText: string): Promise<void> {
    switch (marker.type) {
      case 'handoff':
        await this.handleHandoff(marker.value);
        break;

      case 'context_clear':
        await this.handleContextClear(marker.value);
        break;

      case 'question':
        await this.handleQuestion(marker.value);
        break;

      case 'choices':
        await this.handleChoices(marker.value, fullText);
        break;
    }
  }

  /**
   * Handle HANDOFF marker - show notification with action button.
   */
  private async handleHandoff(agent: string): Promise<void> {
    const actionLabel = `Continue with ${agent}`;

    const result = await vscode.window.showInformationMessage(
      `Ready to hand off to ${agent}`,
      actionLabel
    );

    if (result === actionLabel) {
      await vscode.commands.executeCommand('pennyfarthing.switchAgent', agent);
    }
  }

  /**
   * Handle CONTEXT_CLEAR marker - execute context clear command.
   */
  private async handleContextClear(agent: string): Promise<void> {
    await vscode.commands.executeCommand('pennyfarthing.contextClear', agent);
  }

  /**
   * Handle QUESTION marker - show quick pick.
   */
  private async handleQuestion(questionType: string): Promise<void> {
    if (questionType === 'yesno') {
      await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Choose an option',
      });
    }
  }

  /**
   * Handle CHOICES marker - show quick pick with options.
   */
  private async handleChoices(value: string, fullText: string): Promise<void> {
    const choiceValues = value.split(',').map((v) => v.trim());
    const firstValue = choiceValues[0];
    const isNumeric = /^\d+$/.test(firstValue);

    let options: string[];

    if (isNumeric) {
      // Numeric format - extract text from numbered list in message
      const choiceNumbers = choiceValues.map((n) => parseInt(n, 10));
      options = extractChoiceTexts(fullText, choiceNumbers);
    } else {
      // Text label format - use labels directly
      options = choiceValues;
    }

    await vscode.window.showQuickPick(options, {
      placeHolder: 'Choose an option',
    });
  }
}
