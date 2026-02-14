/**
 * Message Filtering Utilities
 *
 * Story MSSCI-12783 - Bug: Skill Content Displayed as User Message
 *
 * Functions to detect and filter skill content from user messages.
 * Skill content is meant for Claude's context, not for display in the UI.
 * Detected skill invocations are replaced with a short label (e.g. "reviewer")
 * so the user sees what happened without the raw skill dump.
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
 * Patterns that detect skill body content leaked as separate user messages.
 * These are the raw skill markdown bodies that Claude Code sends as user messages
 * after the initial <command-message> wrapper.
 */
const SKILL_BODY_PATTERNS = [
  /^```bash\s*\npf agent start\b/,      // Agent activation bash block
  /^pf agent start\b/,                   // Bare agent start command
  /^<purpose>/,                           // Skill body XML tags
  /^<when-to-use>/,
  /^<execution>/,
  /^<critical>\s*\n/,                     // Skill body starting with critical block
] as const;

/**
 * Agent name to human-readable label mapping.
 */
const AGENT_LABELS: Record<string, string> = {
  sm: 'Scrum Master',
  tea: 'Test Engineer',
  dev: 'Developer',
  reviewer: 'Reviewer',
  architect: 'Architect',
  pm: 'Product Manager',
  'tech-writer': 'Tech Writer',
  'ux-designer': 'UX Designer',
  devops: 'DevOps',
  orchestrator: 'Orchestrator',
  ba: 'Business Analyst',
};

/**
 * Check if a message content string contains skill/command content
 * that should be filtered from user message display.
 *
 * @param content - The message content to check
 * @returns true if the content contains skill markers and should be filtered
 */
export function isSkillContent(content: string | null | undefined): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  if (SKILL_CONTENT_MARKERS.some(marker => content.includes(marker))) {
    return true;
  }

  const trimmed = content.trimStart();
  return SKILL_BODY_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Extract the skill/agent name from skill content for labeling.
 * Returns a human-readable label like "Scrum Master" or the raw skill name.
 */
export function extractSkillLabel(content: string | null | undefined): string | null {
  if (!content || typeof content !== 'string') return null;

  // Match <command-name>/foo</command-name>
  const cmdMatch = content.match(/<command-name>\/?([^<]+)<\/command-name>/);
  if (cmdMatch) {
    const name = cmdMatch[1].trim();
    return AGENT_LABELS[name] || name;
  }

  // Match <command-message>foo</command-message>
  const msgMatch = content.match(/<command-message>([^<]+)<\/command-message>/);
  if (msgMatch) {
    const name = msgMatch[1].trim();
    return AGENT_LABELS[name] || name;
  }

  // Match pf agent start "foo"
  const agentMatch = content.match(/pf agent start\s+"([^"]+)"/);
  if (agentMatch) {
    const name = agentMatch[1].trim();
    return AGENT_LABELS[name] || name;
  }

  // Match "Launching skill: foo"
  const launchMatch = content.match(/Launching skill:\s*(\S+)/);
  if (launchMatch) {
    const name = launchMatch[1].trim();
    return AGENT_LABELS[name] || name;
  }

  return null;
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
    if (msg.type !== 'user') {
      return true;
    }
    return !isSkillContent(msg.content);
  });
}
