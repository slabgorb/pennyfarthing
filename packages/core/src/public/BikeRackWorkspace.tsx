/**
 * BikeRackWorkspace - Dockview-based panel layout for BikeRack mode
 *
 * Story MSSCI-14877: Migrate BikeRack from index page to Dockview layout
 * Epic: 102 (BikeRack Follow-up)
 * Moved to @pennyfarthing/bikerack in Story 124-5 (MSSCI-15556)
 *
 * Replaces BikeRackIndex with a proper Dockview layout.
 * No MessagePanel (sacred center) — BikeRack is a monitoring dashboard.
 * Single Dockview group — users can freely rearrange panels.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
  IDockviewPanelProps,
  SerializedDockview,
  DockviewDefaultTab,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { ErrorBoundary } from '../public/components/ErrorBoundary.js';
import { panelRegistry } from '../public/components/panel-registry.js';
import PersonaHeader from '../public/components/PersonaHeader.js';
import ProjectInfoBar from '../public/components/ProjectInfoBar.js';
import { useFocusPanel } from '../public/hooks/useFocusPanel.js';
import '../public/styles/dockview-theme.css';

// =============================================================================
// BikeRack Panel Definitions
// =============================================================================

/**
 * Panels included in BikeRack Dockview mode.
 * Unlike base Cyclist, BikeRack does NOT include MessagePanel.
 */
export const BIKERACK_PANELS: string[] = [
  'sprint',
  'git',
  'diffs',
  'todo',
  'workflow',
  'audit-log',
  'ac',
  'debug',
  'settings',
];

const PANEL_TITLES: Record<string, string> = {
  sprint: 'Sprint',
  git: 'Git',
  diffs: 'Diffs',
  todo: 'Todo',
  workflow: 'Workflow',
  'audit-log': 'Audit Log',
  ac: 'AC',
  debug: 'Debug',
  settings: 'Settings',
};

// =============================================================================
// Panel Adapter
// =============================================================================

interface PanelAdapterParams {
  panelId: string;
}

function PanelAdapter({ params }: IDockviewPanelProps<PanelAdapterParams>): React.ReactElement | null {
  const Component = panelRegistry.get(params.panelId);

  if (!Component) {
    return (
      <div data-testid={`panel-${params.panelId}`} className="dockview-panel-content">
        <div style={{ padding: '16px', color: 'var(--text-secondary, #94a3b8)' }}>
          {PANEL_TITLES[params.panelId] || params.panelId}
        </div>
      </div>
    );
  }

  return (
    <div data-testid={`panel-${params.panelId}`} className="dockview-panel-content">
      <ErrorBoundary panelName={params.panelId}>
        <div className="error-boundary-wrapper">
          <Component />
        </div>
      </ErrorBoundary>
    </div>
  );
}

// =============================================================================
// BikeRackWorkspace Component
// =============================================================================

export interface BikeRackWorkspaceProps {
  initialLayout?: SerializedDockview;
  onLayoutChange?: (layout: SerializedDockview) => void;
}

export function BikeRackWorkspace({
  initialLayout,
  onLayoutChange,
}: BikeRackWorkspaceProps): React.ReactElement {
  const apiRef = useRef<DockviewApi | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Panel focus mode — stash/restore layout on /bc CLI events
  useFocusPanel(dockviewApi);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;
    setDockviewApi(api);

    // Restore saved layout if available (must have actual panels, not just empty {})
    if (initialLayout && initialLayout.grid && initialLayout.panels
        && Object.keys(initialLayout.panels).length > 0) {
      try {
        api.fromJSON(initialLayout);
        // Verify panels were actually created
        if (api.panels.length > 0) {
          return;
        }
        console.warn('[BikeRackWorkspace] Restored layout produced no panels, building default');
      } catch (err) {
        console.warn('[BikeRackWorkspace] Failed to restore layout, building default:', err);
      }
    }

    // Single group — all panels as tabs, user can rearrange freely
    const first = api.addPanel({
      id: BIKERACK_PANELS[0],
      component: 'PanelAdapter',
      params: { panelId: BIKERACK_PANELS[0] },
      title: PANEL_TITLES[BIKERACK_PANELS[0]],
    });

    for (let i = 1; i < BIKERACK_PANELS.length; i++) {
      api.addPanel({
        id: BIKERACK_PANELS[i],
        component: 'PanelAdapter',
        params: { panelId: BIKERACK_PANELS[i] },
        position: { referencePanel: first.id },
        title: PANEL_TITLES[BIKERACK_PANELS[i]],
      });
    }
  }, [initialLayout]);

  // Subscribe to layout changes for persistence
  const handleLayoutChange = useCallback(() => {
    const api = apiRef.current;
    if (!api || !onLayoutChange) return;

    // Never save empty layouts — prevents corruption loop
    if (api.panels.length === 0) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const serialized = api.toJSON();
      // Double-check: don't persist if serialization produced empty panels
      if (serialized.panels && Object.keys(serialized.panels).length > 0) {
        onLayoutChange(serialized);
      }
    }, 300);
  }, [onLayoutChange]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    const disposables = [
      api.onDidLayoutChange(() => handleLayoutChange()),
      api.onDidAddPanel(() => handleLayoutChange()),
      api.onDidRemovePanel(() => handleLayoutChange()),
    ];

    return () => disposables.forEach(d => d.dispose());
  }, [handleLayoutChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Memoize to prevent DockviewReact from reinitializing on re-render
  const components = React.useMemo(() => ({ PanelAdapter }), []);

  return (
    <div className="cyclist-app cyclist-dockview" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div data-testid="bikerack-portrait-anchor" style={{ flexShrink: 0 }}>
        <PersonaHeader />
      </div>
      <ProjectInfoBar />
      <DockviewReact
        className="dockview-container"
        onReady={onReady}
        components={components}
        defaultTabComponent={(props) => <DockviewDefaultTab {...props} hideClose />}
        watermarkComponent={() => null}
      />
    </div>
  );
}

export default BikeRackWorkspace;
