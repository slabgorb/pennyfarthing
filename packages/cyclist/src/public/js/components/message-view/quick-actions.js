/**
 * Quick Actions
 *
 * Detect actionable questions from Claude and render quick action buttons.
 * Extracted from MessageView.js for better maintainability.
 */

import { escapeHtml } from './markdown-parser.js';
import { insertAndSubmit } from '../../editor.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Question patterns for detecting actionable questions from Claude.
 * These patterns are checked against the LAST PARAGRAPH of the message
 * to avoid false positives from explanatory text.
 *
 * Each pattern has:
 * - pattern: regex to match
 * - responses: button labels to show
 * - requiresQuestion: if true, the paragraph must end with "?"
 */
export const QUESTION_PATTERNS = [
  // Direct action offers - these imply readiness to proceed
  { pattern: /would you like me to/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },
  { pattern: /shall i (proceed|continue|go ahead|start|begin)/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },
  { pattern: /ready to proceed/i, responses: ['Yes, proceed', 'Hold on'], requiresQuestion: false },
  { pattern: /want me to (proceed|continue|go ahead|start|begin)/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false },

  // Yes/No questions - require actual question mark
  { pattern: /should i\b/i, responses: ['Yes', 'No'], requiresQuestion: true },
  { pattern: /do you want/i, responses: ['Yes', 'No'], requiresQuestion: true },
  { pattern: /shall i\b/i, responses: ['Yes', 'No'], requiresQuestion: true },

  // Permission prompts (tool approval) - these are actual permission requests
  { pattern: /allow.*to\s+(run|execute)/i, responses: ['Yes', 'No'], requiresQuestion: false },
  { pattern: /allow.*to\s+read/i, responses: ['Yes', 'No'], requiresQuestion: false },
  { pattern: /allow.*to\s+write/i, responses: ['Yes', 'No'], requiresQuestion: false },
  { pattern: /allow.*to\s+edit/i, responses: ['Yes', 'No'], requiresQuestion: false },
];

// =============================================================================
// State
// =============================================================================

/** Whether quick action buttons are currently visible */
let quickActionsVisible = false;

/** Auto-submit enabled (stretch goal) */
let autoSubmitEnabled = false;

// =============================================================================
// Text Processing Utilities
// =============================================================================

/**
 * Strip markdown formatting from text for display in buttons/UI.
 * Removes bold, italic, code, links, etc.
 * @param {string} text - Text with markdown
 * @returns {string} Plain text without markdown
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')     // **bold** -> bold
    .replace(/\*(.+?)\*/g, '$1')         // *italic* -> italic
    .replace(/__(.+?)__/g, '$1')         // __bold__ -> bold
    .replace(/_(.+?)_/g, '$1')           // _italic_ -> italic
    .replace(/`(.+?)`/g, '$1')           // `code` -> code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) -> text
    .replace(/^#+\s+/gm, '')             // # heading -> heading
    .trim();
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncateText(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

/**
 * Extract the last meaningful paragraph from text.
 * Skips empty lines and code blocks.
 * @param {string} text - Full message text
 * @returns {string} Last paragraph
 */
function getLastParagraph(text) {
  if (!text) return '';

  // Remove code blocks first
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');

  // Split into paragraphs (double newline or end of text)
  const paragraphs = withoutCode
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Return last non-empty paragraph, or full text if no splits
  return paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : withoutCode.trim();
}

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect yes/no question patterns in text.
 * Only checks the LAST PARAGRAPH to avoid false positives from explanatory text.
 * @param {string} text - Text to analyze
 * @returns {Object|null} Detection result with type and responses, or null
 */
export function detectQuestionPattern(text) {
  if (!text) return null;

  // Focus on the last paragraph where actual questions appear
  const lastParagraph = getLastParagraph(text);
  if (!lastParagraph) return null;

  const endsWithQuestion = lastParagraph.trimEnd().endsWith('?');

  for (const { pattern, responses, requiresQuestion } of QUESTION_PATTERNS) {
    if (pattern.test(lastParagraph)) {
      // If pattern requires a question mark, check for it
      if (requiresQuestion && !endsWithQuestion) {
        continue;
      }
      return { type: 'yesno', responses };
    }
  }

  return null;
}

/**
 * Detect numbered list choice patterns in text
 * Looks for sequential numbered options starting from 1
 * @param {string} text - Text to analyze
 * @returns {Object|null} Detection result with type and choices, or null
 */
export function detectListChoices(text) {
  if (!text) return null;

  // Skip if text is inside a code block
  if (text.includes('```')) {
    // Remove code blocks before checking
    const withoutCode = text.replace(/```[\s\S]*?```/g, '');
    if (!withoutCode.trim()) return null;
    text = withoutCode;
  }

  // Patterns for numbered lists: "1. text", "1) text", "**1.** text"
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm,           // "1. Option text"
    /^\s*(\d+)\)\s+(.+)$/gm,           // "1) Option text"
    /\*\*(\d+)[\.\)]\*\*\s*(.+)/gm,    // "**1.** Option text"
  ];

  let choices = [];

  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    const tempChoices = [];

    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      const optionText = match[2].trim();
      tempChoices.push({ number: num, text: optionText });
    }

    // Check if we found more choices than before
    if (tempChoices.length > choices.length) {
      choices = tempChoices;
    }
  }

  // Must have at least 2 choices
  if (choices.length < 2) return null;

  // Sort by number
  choices.sort((a, b) => a.number - b.number);

  // Must start from 1 and be sequential
  if (choices[0].number !== 1) return null;

  // Verify sequential
  for (let i = 0; i < choices.length; i++) {
    if (choices[i].number !== i + 1) return null;
  }

  // Filter out documentation/description lists (not user choices)
  const notChoiceIndicators = [
    // Past tense - things already done
    'read', 'analyzed', 'made', 'wrote', 'created', 'added', 'removed', 'fixed',
    'updated', 'changed', 'modified', 'implemented', 'completed', 'finished',
    'found', 'discovered', 'identified', 'checked', 'verified', 'confirmed',
    // Present continuous - things being described
    'reading', 'analyzing', 'making', 'writing', 'creating', 'adding',
    // Descriptive patterns - explaining what something does/is
    'the', 'this', 'a', 'an', 'it', 'when', 'if', 'for', 'with',
    // File/code references
    'src/', './', '../', 'file:', 'line',
  ];

  // Check first word of first few items
  for (let i = 0; i < Math.min(choices.length, 3); i++) {
    const firstWord = choices[i].text.toLowerCase().split(/\s+/)[0];
    if (notChoiceIndicators.includes(firstWord)) {
      return null;
    }
    // Also reject if it looks like a file path
    if (choices[i].text.match(/^[a-zA-Z0-9_\-./]+\.(js|ts|md|json|yaml|go|py|sh)$/)) {
      return null;
    }
  }

  // Require a "choice" context - look for indicators that these ARE choices
  const textLower = text.toLowerCase();
  const choiceIndicators = [
    'which', 'choose', 'select', 'pick', 'option', 'prefer',
    'would you like', 'do you want', 'should i', 'approach',
    'alternative', 'either', 'or we could',
  ];

  const hasChoiceContext = choiceIndicators.some(indicator =>
    textLower.includes(indicator)
  );

  // If no choice context, don't show buttons - it's probably documentation
  if (!hasChoiceContext) {
    return null;
  }

  return { type: 'list', choices };
}

// =============================================================================
// Rendering Functions
// =============================================================================

/**
 * Render quick action buttons HTML
 * @param {Object} result - Detection result from detectQuestionPattern or detectListChoices
 * @returns {string} HTML string for buttons
 */
export function renderQuickActions(result) {
  if (!result) return '';

  if (result.type === 'yesno') {
    const buttons = result.responses.map(response =>
      `<button class="quick-action-btn" data-response="${response}">${response}</button>`
    ).join('\n');

    return `<div class="quick-actions-container">\n${buttons}\n</div>`;
  }

  if (result.type === 'list') {
    const buttons = result.choices.map(choice => {
      // Strip markdown before truncating and escaping for clean button labels
      const cleanText = stripMarkdown(choice.text);
      const displayText = `${choice.number}. ${truncateText(escapeHtml(cleanText), 15)}`;
      return `<button class="quick-action-btn" data-response="${choice.number}">${displayText}</button>`;
    }).join('\n');

    return `<div class="quick-actions-container" style="flex-wrap: wrap; overflow-x: auto;">\n${buttons}\n</div>`;
  }

  return '';
}

/**
 * Clear quick action buttons from the DOM
 */
export function clearQuickActions() {
  quickActionsVisible = false;
  const container = document.getElementById('quick-actions');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Handle quick action button click
 * @param {string} response - The response text to insert
 */
export function handleQuickActionClick(response) {
  // Insert and immediately submit - no extra clicks needed
  insertAndSubmit(response);
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Set quick actions visibility state
 * @param {boolean} visible - Whether buttons should be visible
 */
export function setQuickActionsVisible(visible) {
  quickActionsVisible = visible;
}

/**
 * Get quick actions visibility state
 * @returns {boolean} Whether buttons are visible
 */
export function getQuickActionsVisible() {
  return quickActionsVisible;
}

/**
 * Set auto-submit enabled state
 * @param {boolean} enabled - Whether auto-submit is enabled
 */
export function setAutoSubmit(enabled) {
  autoSubmitEnabled = enabled;
}

/**
 * Get auto-submit enabled state
 * @returns {boolean} Whether auto-submit is enabled
 */
export function getAutoSubmit() {
  return autoSubmitEnabled;
}

/**
 * Called when a response is submitted to clear quick actions
 */
export function onResponseSubmitted() {
  clearQuickActions();
}

/**
 * Process a message to determine if quick actions should be shown
 * @param {Object} message - SDK message object
 * @returns {Object|null} Detection result or null
 */
export function processMessageForQuickActions(message) {
  // Only process assistant messages
  if (message?.type !== 'assistant') return null;

  // Extract text content
  const content = message?.message?.content;
  if (!Array.isArray(content)) return null;

  const textContent = content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  if (!textContent) return null;

  // Check for list choices first (higher priority)
  const listResult = detectListChoices(textContent);
  if (listResult) return listResult;

  // Then check for yes/no questions
  const questionResult = detectQuestionPattern(textContent);
  if (questionResult) return questionResult;

  return null;
}

export default {
  QUESTION_PATTERNS,
  stripMarkdown,
  truncateText,
  detectQuestionPattern,
  detectListChoices,
  renderQuickActions,
  clearQuickActions,
  handleQuickActionClick,
  setQuickActionsVisible,
  getQuickActionsVisible,
  setAutoSubmit,
  getAutoSubmit,
  onResponseSubmitted,
  processMessageForQuickActions,
};
