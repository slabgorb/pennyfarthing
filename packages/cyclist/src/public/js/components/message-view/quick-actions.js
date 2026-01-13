/**
 * Quick Actions
 *
 * Detect actionable questions from Claude and render quick action buttons.
 * Extracted from MessageView.js for better maintainability.
 */

import { escapeHtml } from './markdown-parser.js';
import { insertAndSubmit } from '../../editor.js';
import { getThemeAgents } from '../../story.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Maps workflow phase keywords to their corresponding agent commands.
 * Used to detect "ready for X" patterns and suggest the right agent.
 */
export const PHASE_TO_AGENT = {
  'review': '/reviewer',
  'code review': '/reviewer',
  'testing': '/tea',
  'tests': '/tea',
  'test': '/tea',
  'implementation': '/dev',
  'implement': '/dev',
  'development': '/dev',
  'develop': '/dev',
  'green phase': '/dev',
  'red phase': '/tea',
  'finish': '/sm',
  'completion': '/sm',
  'complete': '/sm',
  'architecture': '/architect',
  'design': '/architect',
  'planning': '/pm',
  'documentation': '/tech-writer',
  'docs': '/tech-writer',
  'ux': '/ux-designer',
  'ui': '/ux-designer',
  'deployment': '/devops',
  'infrastructure': '/devops',
};

/**
 * Patterns for detecting handoff prompts from agents.
 * Each pattern matches a specific way Claude might suggest invoking an agent.
 */
export const HANDOFF_PATTERNS = [
  // Direct command patterns: "invoke /reviewer", "run /dev", etc.
  // Capture the agent name with or without slash
  {
    pattern: /(?:invoke|run|use|start|switch\s+to)\s+(?:\*\*)?[`]?\/?(orchestrator|tech-writer|ux-designer|architect|reviewer|devops|tea|dev|sm|pm)[`]?(?:\*\*)?/i,
    type: 'direct',
  },
  // "ready for review" → /reviewer
  {
    pattern: /ready\s+for\s+(review|code\s+review|testing|tests|test|implementation|implement|development|develop|green\s+phase|red\s+phase|finish|completion|complete|architecture|design|planning|documentation|docs|ux|ui|deployment|infrastructure)/i,
    type: 'phase',
  },
  // Context high warning patterns: "Start fresh with /tea", "new session with /dev"
  {
    pattern: /(?:start\s+(?:fresh|a\s+new\s+session)|new\s+session)\s+with\s+(?:\*\*)?[`]?\/?(orchestrator|tech-writer|ux-designer|architect|reviewer|devops|tea|dev|sm|pm)[`]?(?:\*\*)?/i,
    type: 'context',
  },
];

export const QUESTION_PATTERNS = [
  // Direct action offers - these imply readiness to proceed (high confidence 0.85)
  { pattern: /would you like me to/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false, confidence: 0.85 },
  { pattern: /shall i (proceed|continue|go ahead|start|begin)/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false, confidence: 0.85 },
  // "ready to proceed" - action-oriented with specific responses
  { pattern: /ready to proceed/i, responses: ['Yes, proceed', 'Hold on'], requiresQuestion: false, confidence: 0.85 },
  // "ready to X" - for other actions
  { pattern: /ready to (continue|start|begin|go)/i, responses: ['Yes', 'No'], requiresQuestion: false, confidence: 0.80 },
  { pattern: /want me to (proceed|continue|go ahead|start|begin)/i, responses: ['Yes, proceed', 'No'], requiresQuestion: false, confidence: 0.85 },

  // Yes/No questions - require actual question mark (moderate confidence 0.75-0.80)
  { pattern: /should i\b/i, responses: ['Yes', 'No'], requiresQuestion: true, confidence: 0.80 },
  { pattern: /do you want/i, responses: ['Yes', 'No'], requiresQuestion: true, confidence: 0.80 },
  { pattern: /shall i\b/i, responses: ['Yes', 'No'], requiresQuestion: true, confidence: 0.80 },
  // Universal confirmation patterns (Story 25-4)
  // NOTE: "Can I" removed - too broad, causes false positives (see test B-9.6 line 125)
  { pattern: /may i\b/i, responses: ['Yes', 'No'], requiresQuestion: true, confidence: 0.75 },
  { pattern: /is it (okay|ok) (to|if)/i, responses: ['Yes', 'No'], requiresQuestion: true, confidence: 0.75 },
  { pattern: /are you ready for me to/i, responses: ['Yes', 'No'], requiresQuestion: true, confidence: 0.80 },

  // Permission prompts (tool approval) - these are actual permission requests (high confidence 0.85)
  { pattern: /allow.*to\s+(run|execute)/i, responses: ['Yes', 'No'], requiresQuestion: false, confidence: 0.85 },
  { pattern: /allow.*to\s+read/i, responses: ['Yes', 'No'], requiresQuestion: false, confidence: 0.85 },
  { pattern: /allow.*to\s+write/i, responses: ['Yes', 'No'], requiresQuestion: false, confidence: 0.85 },
  { pattern: /allow.*to\s+edit/i, responses: ['Yes', 'No'], requiresQuestion: false, confidence: 0.85 },
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
 * Get the character name for an agent command from the current theme.
 * Falls back to a friendly role name if theme data isn't available.
 * @param {string} agentCmd - Agent command like "/sm", "/dev", "/tea"
 * @returns {string} Character name like "The Mad Hatter" or friendly name like "Scrum Master"
 */
function getAgentDisplayName(agentCmd) {
  // Remove leading slash
  const role = agentCmd.replace(/^\//, '').toLowerCase();

  // Try to get character name from theme cache
  const themeAgents = getThemeAgents();
  if (themeAgents && themeAgents[role]) {
    return themeAgents[role].shortName || themeAgents[role].character || agentCmd;
  }

  // Fallback to friendly role names
  const friendlyNames = {
    'sm': 'Scrum Master',
    'tea': 'Test Engineer',
    'dev': 'Developer',
    'reviewer': 'Reviewer',
    'architect': 'Architect',
    'pm': 'Product Manager',
    'orchestrator': 'Orchestrator',
    'tech-writer': 'Tech Writer',
    'ux-designer': 'UX Designer',
    'devops': 'DevOps',
  };

  return friendlyNames[role] || agentCmd;
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
 * Detect structured CYCLIST markers in text.
 * Markers are HTML comments in the format: <!-- CYCLIST:TYPE:value -->
 * This provides 100% accurate detection vs pattern-based heuristics.
 *
 * @param {string} text - Text to analyze
 * @returns {Array|null} Array of marker objects with {type, value, source}, or null if none found
 */
export function detectStructuredMarkers(text) {
  if (!text) return null;

  // Remove code blocks first - we don't want to detect markers inside code
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');
  if (!withoutCode.trim()) return null;

  // Pattern: <!-- CYCLIST:TYPE:value -->
  // Case-insensitive for CYCLIST prefix and TYPE, preserves value case
  const markerPattern = /<!--\s*CYCLIST:(\w+):([^>]+?)\s*-->/gi;

  const markers = [];
  let match;

  while ((match = markerPattern.exec(withoutCode)) !== null) {
    markers.push({
      type: match[1].toLowerCase(),
      value: match[2].trim(),
      source: 'structured_marker',
    });
  }

  return markers.length > 0 ? markers : null;
}

/**
 * Extract option text from message content for numbered choices.
 * Looks for patterns like "1. Option text" or "1) Option text".
 * @param {string} text - Full message text
 * @param {number[]} choiceNumbers - Array of choice numbers to extract
 * @returns {Object[]} Array of {number, text} objects
 */
function extractChoiceTexts(text, choiceNumbers) {
  if (!text) return choiceNumbers.map(num => ({ number: num, text: `Option ${num}` }));

  // Remove code blocks
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');

  // Patterns for numbered lists
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm,           // "1. Option text"
    /^\s*(\d+)\)\s+(.+)$/gm,           // "1) Option text"
    /\*\*(\d+)[\.\)]\*\*\s*(.+)/gm,    // "**1.** Option text"
  ];

  const foundChoices = new Map();

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
 * Process structured markers and convert to quick action result format.
 * @param {Array} markers - Array of marker objects from detectStructuredMarkers
 * @param {string} fullText - Full message text for extracting choice labels
 * @returns {Object|null} Quick action result or null
 */
function processStructuredMarkers(markers, fullText = '') {
  if (!markers || markers.length === 0) return null;

  // Process the first/primary marker (most use cases have one)
  const primaryMarker = markers[0];

  // Structured markers always have confidence 1.0 - they're explicit signals
  switch (primaryMarker.type) {
    case 'handoff':
      return {
        type: 'handoff',
        agent: primaryMarker.value,
        responses: [primaryMarker.value, 'Not yet'],
        source: 'structured_marker',
        confidence: 1.0,
      };

    case 'question':
      if (primaryMarker.value === 'yesno') {
        return {
          type: 'yesno',
          responses: ['Yes', 'No'],
          source: 'structured_marker',
          confidence: 1.0,
        };
      }
      // choice type falls through to check for CHOICES marker
      break;

    case 'choices':
      // Parse choice numbers from value like "1,2,3"
      const choiceNumbers = primaryMarker.value.split(',').map(n => parseInt(n.trim(), 10));
      const choices = extractChoiceTexts(fullText, choiceNumbers);
      return {
        type: 'list',
        choices,
        source: 'structured_marker',
        confidence: 1.0,
      };
  }

  // Check if there's both a QUESTION:choice and CHOICES marker
  const choicesMarker = markers.find(m => m.type === 'choices');
  if (primaryMarker.type === 'question' && choicesMarker) {
    const choiceNumbers = choicesMarker.value.split(',').map(n => parseInt(n.trim(), 10));
    const choices = extractChoiceTexts(fullText, choiceNumbers);
    return {
      type: 'list',
      choices,
      source: 'structured_marker',
      confidence: 1.0,
    };
  }

  return null;
}

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

  for (const { pattern, responses, requiresQuestion, confidence } of QUESTION_PATTERNS) {
    if (pattern.test(lastParagraph)) {
      // If pattern requires a question mark, check for it
      if (requiresQuestion && !endsWithQuestion) {
        continue;
      }
      return { type: 'yesno', responses, confidence };
    }
  }

  return null;
}

/**
 * Detect handoff patterns in text.
 * Looks for agent invocation prompts like "invoke /reviewer" or "ready for review".
 * Only checks the LAST PARAGRAPH to avoid false positives from explanatory text.
 * @param {string} text - Text to analyze
 * @returns {Object|null} Detection result with type, agent, and responses, or null
 */
export function detectHandoffPattern(text) {
  if (!text) return null;

  // Remove code blocks first - we don't want to detect patterns inside code
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');
  if (!withoutCode.trim()) return null;

  // Focus on the last paragraph where handoff suggestions typically appear
  const lastParagraph = getLastParagraph(withoutCode);
  if (!lastParagraph) return null;

  // Track all matches and take the last one (most recent/relevant)
  let lastMatch = null;

  for (const { pattern, type } of HANDOFF_PATTERNS) {
    // Reset regex for global matching
    const regex = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));
    let match;

    while ((match = regex.exec(lastParagraph)) !== null) {
      const captured = match[1].toLowerCase();

      if (type === 'direct' || type === 'context') {
        // Direct agent mention - normalize to /agent format
        // Direct patterns have highest confidence (0.98)
        const agent = `/${captured}`;
        lastMatch = { agent, index: match.index, confidence: 0.98 };
      } else if (type === 'phase') {
        // Phase keyword - map to agent
        // Phase patterns have slightly lower confidence (0.90)
        const agent = PHASE_TO_AGENT[captured];
        if (agent) {
          lastMatch = { agent, index: match.index, confidence: 0.90 };
        }
      }
    }
  }

  if (!lastMatch) return null;

  return {
    type: 'handoff',
    agent: lastMatch.agent,
    responses: [lastMatch.agent, 'Not yet'],
    confidence: lastMatch.confidence,
  };
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
    // Don't filter out single-letter choices (e.g., "A", "B", "C")
    if (firstWord.length > 1 && notChoiceIndicators.includes(firstWord)) {
      return null;
    }
    // Also reject if it looks like a file path
    if (choices[i].text.match(/^[a-zA-Z0-9_\-./]+\.(js|ts|md|json|yaml|go|py|sh)$/)) {
      return null;
    }
  }

  // Require a "choice" context - look for indicators that these ARE choices
  const textLower = text.toLowerCase();

  // Strong indicators - explicit choice language
  const strongChoiceIndicators = [
    'which', 'choose', 'select', 'pick', 'prefer',
  ];

  // Weak indicators - might be choice context, but also common in documentation
  const weakChoiceIndicators = [
    'option', 'would you like', 'do you want', 'should i', 'approach',
    'alternative', 'either', 'or we could',
  ];

  const hasStrongContext = strongChoiceIndicators.some(indicator =>
    textLower.includes(indicator)
  );

  const hasWeakContext = weakChoiceIndicators.some(indicator =>
    textLower.includes(indicator)
  );

  // For long lists (>5 items), require strong choice indicators
  // Long lists are more likely to be documentation/enumeration
  if (choices.length > 5) {
    if (!hasStrongContext) {
      return null;
    }
  } else {
    // For shorter lists, weak context is sufficient
    if (!hasStrongContext && !hasWeakContext) {
      return null;
    }
  }

  // Calculate confidence based on context strength and list length
  // Strong context: 0.90 base, weak context: 0.70 base
  // Longer lists decrease confidence slightly
  let baseConfidence = hasStrongContext ? 0.90 : 0.70;

  // Decrease confidence for longer lists (each item after 3 reduces by 0.03)
  const lengthPenalty = Math.max(0, (choices.length - 3) * 0.03);
  const confidence = Math.max(0.60, baseConfidence - lengthPenalty);

  return { type: 'list', choices, confidence };
}

// =============================================================================
// Rendering Functions
// =============================================================================

/**
 * Render quick action buttons HTML
 * @param {Object} result - Detection result from detectQuestionPattern, detectHandoffPattern, or detectListChoices
 * @returns {string} HTML string for buttons
 */
export function renderQuickActions(result) {
  if (!result) return '';

  if (result.type === 'handoff') {
    // For handoffs: display shows character/role name, data-response has the command
    const buttons = result.responses.map(response => {
      // Check if this is an agent command (starts with /)
      const isAgentCmd = response.startsWith('/');
      const displayText = isAgentCmd ? getAgentDisplayName(response) : response;
      return `<button class="quick-action-btn" data-response="${escapeHtml(response)}">${escapeHtml(displayText)}</button>`;
    }).join('\n');

    return `<div class="quick-actions-container">\n${buttons}\n</div>`;
  }

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
      // Show just the text (no number prefix) - cleaner look, number is in data-response
      const displayText = truncateText(escapeHtml(cleanText), 20);
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
 *
 * NOTE: This function now ONLY uses structured CYCLIST markers for detection.
 * Pattern-based detection (handoff patterns, list choices, yes/no questions)
 * has been disabled to eliminate false positives during streaming.
 *
 * Markers are 100% reliable - agents emit them intentionally at turn completion.
 * Pattern detection was causing flakiness because it ran on incomplete streaming text.
 *
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

  // MARKERS ONLY: Check for structured CYCLIST markers (100% accuracy)
  // Pattern-based detection disabled to prevent false positives during streaming
  const markers = detectStructuredMarkers(textContent);
  if (markers) {
    // Pass full text so CHOICES markers can extract actual option labels
    const markerResult = processStructuredMarkers(markers, textContent);
    // Markers always have confidence 1.0, no threshold check needed
    if (markerResult) return markerResult;
  }

  // Pattern-based detection disabled (caused streaming flakiness):
  // - detectHandoffPattern() - "ready for review", "invoke /agent" etc.
  // - detectListChoices() - numbered option lists
  // - detectQuestionPattern() - "shall I", "would you like" etc.
  //
  // To re-enable, uncomment these blocks. But ensure processing happens
  // only on complete messages (onComplete), not during streaming (onMessage).

  return null;
}

export default {
  QUESTION_PATTERNS,
  HANDOFF_PATTERNS,
  PHASE_TO_AGENT,
  stripMarkdown,
  truncateText,
  detectStructuredMarkers,
  detectQuestionPattern,
  detectHandoffPattern,
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
