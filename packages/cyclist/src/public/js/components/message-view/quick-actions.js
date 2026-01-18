/**
 * Quick Actions
 *
 * Detect actionable questions from Claude and render quick action buttons.
 * Extracted from MessageView.js for better maintainability.
 */

import { escapeHtml } from './markdown-parser.js';
import { insertAndSubmit } from '../../editor.js';
import { getThemeAgents, loadThemeAgents } from '../../story.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Known marker types for CYCLIST structured markers (MSSCI-11840)
 * Used by detectStructuredMarkers to classify marker types
 */
export const MARKER_TYPES = {
  HANDOFF: 'handoff',
  QUESTION: 'question',
  CHOICES: 'choices',
  CONTEXT_CLEAR: 'context_clear',
};

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

// Fallback role names (used when theme cache not available)
const FRIENDLY_ROLE_NAMES = {
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

  // If cache is null, trigger a load for next time (fire-and-forget)
  if (!themeAgents) {
    loadThemeAgents().catch(() => {}); // Silent fail, will use fallback
  }

  return FRIENDLY_ROLE_NAMES[role] || agentCmd;
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

    case 'context_clear':
      // MSSCI-11840: Context clear marker triggers session clear and agent reload
      // Value is the agent command to load after clear (e.g., '/sm')
      return {
        type: 'context_clear',
        agent: primaryMarker.value,
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

// =============================================================================
// Rendering Functions
// =============================================================================

/**
 * Render quick action buttons HTML
 * @param {Object} result - Detection result from processStructuredMarkers
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
 * Process a message to determine if quick actions should be shown.
 * Uses structured CYCLIST markers for 100% reliable detection.
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

  // Check for structured CYCLIST markers (100% accuracy)
  const markers = detectStructuredMarkers(textContent);
  if (markers) {
    // Pass full text so CHOICES markers can extract actual option labels
    const markerResult = processStructuredMarkers(markers, textContent);
    if (markerResult) return markerResult;
  }

  return null;
}

// =============================================================================
// Context Clear Handling (MSSCI-11840)
// =============================================================================

/**
 * Handle a CONTEXT_CLEAR marker by triggering session clear and agent reload
 *
 * @param {string} agent - Agent command to load after clear (e.g., '/dev')
 * @param {Window} windowObj - Window object with electronAPI (for testability)
 * @returns {Promise<void>}
 */
export async function handleContextClearMarker(agent, windowObj = window) {
  if (!windowObj?.electronAPI?.claude?.clearAndReload) {
    console.warn('[MessageView] clearAndReload API not available');
    return;
  }

  console.log(`[MessageView] Handling CONTEXT_CLEAR marker for agent: ${agent}`);
  await windowObj.electronAPI.claude.clearAndReload(agent);
}

export default {
  MARKER_TYPES,
  PHASE_TO_AGENT,
  stripMarkdown,
  truncateText,
  detectStructuredMarkers,
  renderQuickActions,
  clearQuickActions,
  handleQuickActionClick,
  handleContextClearMarker,
  setQuickActionsVisible,
  getQuickActionsVisible,
  setAutoSubmit,
  getAutoSubmit,
  onResponseSubmitted,
  processMessageForQuickActions,
};
