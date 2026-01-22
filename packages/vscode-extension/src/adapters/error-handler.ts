/**
 * Error Handler for VS Code Chat
 *
 * MSSCI-12128: Error handling with actionable messages
 *
 * Provides error classification and user-friendly formatting:
 * - Classifies errors by type (network, auth, process, timeout, validation)
 * - Formats actionable error messages with recovery steps
 * - Renders cleanly in VS Code chat UI
 */

// ============================================================================
// Error Types
// ============================================================================

export type ErrorType =
  | 'network'
  | 'auth'
  | 'process'
  | 'timeout'
  | 'validation'
  | 'unknown';

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Pattern matchers for each error type.
 * Order matters - more specific patterns should come first.
 */
const ERROR_PATTERNS: Array<{ type: ErrorType; patterns: RegExp[] }> = [
  {
    type: 'timeout',
    patterns: [/ETIMEDOUT/i, /timeout/i, /timed?\s*out/i],
  },
  {
    type: 'network',
    patterns: [
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /ENETUNREACH/i,
      /ECONNRESET/i,
      /network/i,
      /connection\s+failed/i,
    ],
  },
  {
    type: 'auth',
    patterns: [
      /\b401\b/,
      /\b403\b/,
      /\b429\b/,
      /unauthorized/i,
      /authentication/i,
      /forbidden/i,
      /rate\s*limit/i,
      /invalid\s+api\s*key/i,
      /invalid\s+credentials/i,
      /invalid\s+token/i,
    ],
  },
  {
    type: 'process',
    patterns: [
      /spawn.*ENOENT/i,
      /ENOENT/i,
      /EPERM/i,
      /EACCES/i,
      /CLI\s+not\s+found/i,
      /command\s+not\s+found/i,
      /not\s+found\s+in\s+PATH/i,
    ],
  },
  {
    type: 'validation',
    patterns: [/validation/i, /invalid/i, /malformed/i, /missing\s+required/i],
  },
];

/**
 * Classify an error by its type based on message content.
 *
 * @param error - Error to classify (Error, string, or any)
 * @returns The classified error type
 */
export function classifyError(error: unknown): ErrorType {
  if (error === null || error === undefined) {
    return 'unknown';
  }

  const message = error instanceof Error ? error.message : String(error);

  for (const { type, patterns } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return type;
      }
    }
  }

  return 'unknown';
}

// ============================================================================
// Actionable Steps
// ============================================================================

/**
 * Recovery steps for each error type.
 */
const ACTIONABLE_STEPS: Record<ErrorType, string[]> = {
  network: [
    'Check your internet connection',
    'Verify the Claude CLI is running',
    'Try restarting VS Code',
  ],
  auth: [
    'Verify your Claude Pro/Max subscription is active',
    'Check your account credentials',
    'Try signing out and signing back in',
  ],
  process: [
    'Try reinstalling pennyfarthing',
    'Check that Claude CLI is in your PATH',
    'Verify file permissions are correct',
  ],
  timeout: [
    'Try again with a shorter prompt',
    'Check your internet connection speed',
    'Try breaking your request into smaller parts',
  ],
  validation: [
    'Check your message format',
    'Ensure all required fields are provided',
    'Try simplifying your request',
  ],
  unknown: [
    'Try again in a few moments',
    'Restart VS Code',
    'Report this issue if it persists',
  ],
};

/**
 * Get actionable recovery steps for an error type.
 *
 * @param type - The error type
 * @returns Array of actionable steps
 */
export function getActionableSteps(type: ErrorType): string[] {
  return ACTIONABLE_STEPS[type] || ACTIONABLE_STEPS.unknown;
}

// ============================================================================
// Error Message Formatting
// ============================================================================

/**
 * Error type display names and emojis.
 */
const ERROR_DISPLAY: Record<ErrorType, { emoji: string; title: string }> = {
  network: { emoji: '🔌', title: 'Connection Error' },
  auth: { emoji: '🔐', title: 'Authentication Error' },
  process: { emoji: '⚙️', title: 'Process Error' },
  timeout: { emoji: '⏱️', title: 'Timeout Error' },
  validation: { emoji: '📝', title: 'Validation Error' },
  unknown: { emoji: '❌', title: 'Unexpected Error' },
};

/**
 * Escape potentially dangerous HTML characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate a string to a maximum length.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract a clean error message without stack traces.
 */
function extractMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return 'An unknown error occurred';
  }

  if (error instanceof Error) {
    // Just the message, not the stack
    return error.message;
  }

  return String(error);
}

/**
 * Format an error into a user-friendly markdown message.
 *
 * @param error - Error to format
 * @returns Formatted markdown string
 */
export function formatErrorMessage(error: unknown): string {
  const type = classifyError(error);
  const { emoji, title } = ERROR_DISPLAY[type];
  const steps = getActionableSteps(type);

  // Extract and clean the message
  // Truncate BEFORE escaping to avoid breaking HTML entities (e.g., &am...)
  let message = extractMessage(error);
  message = truncate(message, 200);
  message = escapeHtml(message);

  // Build the formatted output
  const lines: string[] = [
    `${emoji} **${title}**`,
    '',
    message,
    '',
    '**What to try:**',
  ];

  // Add numbered steps
  steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });

  return lines.join('\n');
}

// ============================================================================
// Chat Integration
// ============================================================================

/**
 * Create an error response suitable for VS Code chat stream.
 * Prefixes with newlines for clean separation from previous content.
 *
 * @param error - Error to format
 * @returns Formatted response string
 */
export function createErrorResponse(error: unknown): string {
  return '\n\n' + formatErrorMessage(error);
}

/**
 * Main entry point for handling chat errors.
 * Classifies, formats, and returns a user-friendly error message.
 *
 * @param error - Error to handle
 * @returns Formatted error message for chat display
 */
export function handleChatError(error: unknown): string {
  return createErrorResponse(error);
}
