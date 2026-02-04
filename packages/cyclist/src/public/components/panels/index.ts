/**
 * Panel Components Index
 *
 * Story MSSCI-12717 - React Migration
 * UX Consolidation: AC and BikeLane are now internal tabs within ProgressPanel
 */

export { MessagePanel } from './MessagePanel';
export { SprintPanel, EnhancedSprintPanel } from './SprintPanel';
export { GitPanel } from './GitPanel';
export { ProgressPanel } from './ProgressPanel';  // Contains Workflow/AC/Todo tabs
export { BackgroundPanel } from './BackgroundPanel';
export { ChangedPanel } from './ChangedPanel';
export { DiffsPanel } from './DiffsPanel';
export { DebugPanel } from './DebugPanel';
export { SettingsPanel } from './SettingsPanel';
export { AuditLogPanel } from './AuditLogPanel';

// Legacy exports - kept for backwards compatibility and tests
// These panels are now rendered as internal tabs within ProgressPanel
export { AcceptanceCriteriaPanel, ConnectedAcceptanceCriteriaPanel } from './AcceptanceCriteriaPanel';
export { BikeLanePanel, ConnectedBikeLanePanel } from './BikeLanePanel';
