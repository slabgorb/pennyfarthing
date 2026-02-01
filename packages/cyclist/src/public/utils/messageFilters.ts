/**
 * Message Filtering Utilities
 *
 * Story MSSCI-12783 - Bug: Skill Content Displayed as User Message
 *
 * Functions to detect and filter skill/command content from user messages.
 * Skill content is meant for Claude's context, not for display in the UI.
 */

/**
 * Skill content markers that indicate a message contains skill/command output
 * that should be filtered from user message display.
 */
const SKILL_CONTENT_MARKERS = [
  '<command-message>',
  '<command-name>',
  'Base directory for this skill:',
  'Launching skill:',
] as const;

/**
 * Check if a message content string contains skill/command content
 * that should be filtered from user message display.
 *
 * @param content - The message content to check
 * @returns true if the content contains skill markers and should be filtered
 */
export function isSkillContent(content: string | null | undefined): boolean {
  // Handle null/undefined/empty gracefully
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Check for any skill content marker
  return SKILL_CONTENT_MARKERS.some(marker => content.includes(marker));
}

/**
 * Filter an array of messages to remove skill content from user messages.
 * Only user-type messages are filtered; assistant and tool messages pass through.
 *
 * @param messages - Array of messages to filter
 * @returns Filtered array with skill content user messages removed
 */
export function filterSkillContentMessages<T extends { type: string; content?: string }>(
  messages: T[]
): T[] {
  return messages.filter(msg => {
    // Only filter user messages
    if (msg.type !== 'user') {
      return true;
    }
    // Filter out skill content
    return !isSkillContent(msg.content);
  });
}
