/**
 * BikeRackWorkspace - Dockview-based panel layout for BikeRack mode
 *
 * Story MSSCI-14877: Migrate BikeRack from index page to Dockview layout
 * Epic: 102 (BikeRack Follow-up)
 *
 * Replaces BikeRackIndex with a proper Dockview layout.
 * No MessagePanel (sacred center) — BikeRack is a monitoring dashboard.
 * Single Dockview group — users can freely rearrange panels.
 */

import React, { useCallback, useRef } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
  IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { ErrorBoundary } from './ErrorBoundary';
import { panelRegistry } from './panel-registry';
import PersonaHeader from './PersonaHeader.js';
import '../styles/dockview-theme.css';

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
  'background',
  'audit-log',
  'changed',
  'ac',
  'debug',
];

const PANEL_TITLES: Record<string, string> = {
  sprint: 'Sprint',
  git: 'Git',
  diffs: 'Diffs',
  todo: 'Todo',
  workflow: 'Workflow',
  background: 'Subagents',
  'audit-log': 'Audit Log',
  changed: 'Changed',
  ac: 'AC',
  debug: 'Debug',
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

export function BikeRackWorkspace(): React.ReactElement {
  const apiRef = useRef<DockviewApi | null>(null);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;

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
  }, []);

  const components = { PanelAdapter };

  return (
    <div className="cyclist-app cyclist-dockview" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div data-testid="bikerack-portrait-anchor" style={{ flexShrink: 0 }}>
        <PersonaHeader />
      </div>
      <div className="flex-1" style={{ flexGrow: 1, minHeight: 0 }}>
        <DockviewReact
          className="dockview-container"
          onReady={onReady}
          components={components}
          watermarkComponent={() => null}
        />
      </div>
    </div>
  );
}

export default BikeRackWorkspace;
