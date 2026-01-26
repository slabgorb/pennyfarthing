/**
 * MessageView Module Index
 *
 * Re-exports all MessageView functionality for backward compatibility.
 * Import from this file or directly from submodules.
 */

// Syntax highlighting
export { highlightCode } from './syntax-highlighter.js';

// Markdown parsing
export { parseMarkdown, escapeHtml, stripMarkers } from './markdown-parser.js';

// Quick actions
export {
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
  renderBellInjectedMessage,
} from './message-renderers.js';
