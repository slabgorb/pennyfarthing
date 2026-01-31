/**
 * Root React component for Cyclist
 * Story MSSCI-12717 - React Migration
 *
 * Renders the DockingWorkspace with all panels registered.
 */

import React from 'react';
import {
  DockingWorkspace,
  registerPanelComponent,
  PANEL_INVENTORY,
} from './components/DockingWorkspace';

// Import all panel components
import {
  MessagePanel,
  SprintPanel,
  GitPanel,
  ProgressPanel,
  BackgroundPanel,
  ChangedPanel,
  DiffsPanel,
  DebugPanel,
  SettingsPanel,
} from './components/panels';

// =============================================================================
// Panel Registration
// =============================================================================

// Register all panels BEFORE render
// Center panel (sacred)
registerPanelComponent(PANEL_INVENTORY.MESSAGE, MessagePanel);

// Left sidebar panels
registerPanelComponent(PANEL_INVENTORY.CHANGED, ChangedPanel);
registerPanelComponent(PANEL_INVENTORY.DIFFS, DiffsPanel);
registerPanelComponent(PANEL_INVENTORY.DEBUG, DebugPanel);

// Right sidebar panels
registerPanelComponent(PANEL_INVENTORY.SPRINT, SprintPanel);
registerPanelComponent(PANEL_INVENTORY.PROGRESS, ProgressPanel);
registerPanelComponent(PANEL_INVENTORY.BACKGROUND, BackgroundPanel);
registerPanelComponent(PANEL_INVENTORY.GIT, GitPanel);
registerPanelComponent(PANEL_INVENTORY.SETTINGS, SettingsPanel);

// =============================================================================
// App Component
// =============================================================================

export default function App(): React.ReactElement {
  return <DockingWorkspace />;
}
