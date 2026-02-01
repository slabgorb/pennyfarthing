/**
 * Root React component for Cyclist
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12706 - Layout Persistence
 * Story MSSCI-12769 - Font Customization
 *
 * Renders the DockingWorkspace with all panels registered.
 * Persists layout changes to config.local.yaml.
 */

import React, { useEffect } from 'react';
import {
  DockingWorkspace,
  registerPanelComponent,
  PANEL_INVENTORY,
} from './components/DockingWorkspace';
import { CommandPaletteProvider } from './components/CommandPalette';
import { useLayoutPersistence } from './hooks/useLayoutPersistence';
import { loadFontSettings, applyFontSettings } from './js/font-presets.js';

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
  const { layout, isLoading, saveLayout } = useLayoutPersistence();

  // Load and apply font settings on startup (MSSCI-12769)
  useEffect(() => {
    loadFontSettings().then(settings => {
      applyFontSettings(settings);
    });
  }, []);

  // Show nothing while loading to avoid flash of default layout
  if (isLoading || !layout) {
    return (
      <div className="cyclist-app cyclist-loading">
        <div className="loading-spinner" aria-label="Loading layout..." />
      </div>
    );
  }

  return (
    <CommandPaletteProvider>
      <div className="cyclist-app">
        <DockingWorkspace
          initialLayout={layout}
          onLayoutChange={saveLayout}
        />
      </div>
    </CommandPaletteProvider>
  );
}
