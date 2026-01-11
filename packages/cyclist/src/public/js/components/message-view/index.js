/**
 * MessageView Module Index
 *
 * Re-exports all MessageView functionality for backward compatibility.
 * Import from this file or directly from submodules.
 */

// Syntax highlighting
export { highlightCode } from './syntax-highlighter.js';

// Markdown parsing
export { parseMarkdown, escapeHtml } from './markdown-parser.js';

// Quick actions
export {
  QUESTION_PATTERNS,
  HANDOFF_PATTERNS,
  PHASE_TO_AGENT,
  stripMarkdown,
  truncateText,
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
} from './quick-actions.js';

// Message renderers
export {
  formatModelName,
  formatPermissionMode,
  formatTurnCount,
  formatDuration,
  getToolStatus,
  setToolStatus,
  clearToolStatuses,
  setVerboseMode,
  getVerboseMode,
  renderTextMessage,
  renderToolUseMessage,
  isToolUseCollapsible,
  renderToolResultMessage,
  renderSystemMessage,
  renderResultMessage,
  renderErrorMessage,
  renderUserMessage,
} from './message-renderers.js';
