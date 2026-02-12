/**
 * BikeRackWorkspace - Dockview-based panel layout for BikeRack mode
 *
 * Story MSSCI-14877: Migrate BikeRack from index page to Dockview layout
 * Epic: 102 (BikeRack Follow-up)
 *
 * Replaces BikeRackIndex with a proper Dockview layout.
 * No MessagePanel (sacred center) — BikeRack is a monitoring dashboard.
 * Two-region layout: left sidebar | right sidebar.
 */

import React, { useCallback, useRef } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  DockviewApi,
  IDockviewPanelProps,
  SerializedDockview,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { ErrorBoundary } from './ErrorBoundary';
import { panelRegistry } from './panel-registry';
import { SIDEBAR_WIDTHS } from '../hooks/useResponsiveLayout';
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
  'tty',
  'debug',
  'bikelane',
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
  tty: 'Terminal',
  debug: 'Debug',
  bikelane: 'BikeLane',
};

// Two-region layout groups (no sacred center)
const LEFT_PANELS = ['changed', 'diffs', 'debug', 'audit-log', 'tty', 'bikelane'];
const RIGHT_PANELS = ['sprint', 'git', 'workflow', 'ac', 'todo', 'background'];

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
// Layout
// =============================================================================

/**
 * Create default BikeRack Dockview layout.
 * Two-region layout: left sidebar | right sidebar (no sacred center).
 */
export function createBikeRackLayout(): SerializedDockview {
  return {
    grid: {
      root: {
        type: 'branch',
        data: [
          {
            type: 'leaf',
            data: {
              views: LEFT_PANELS,
              activeView: LEFT_PANELS[0],
              id: 'left-sidebar',
            },
            size: SIDEBAR_WIDTHS.medium,
          },
          {
            type: 'leaf',
            data: {
              views: RIGHT_PANELS,
              activeView: RIGHT_PANELS[0],
              id: 'right-sidebar',
            },
            size: SIDEBAR_WIDTHS.medium,
          },
        ],
        size: 800,
      },
      width: 1200,
      height: 800,
      orientation: 'HORIZONTAL',
    },
    panels: Object.fromEntries(
      BIKERACK_PANELS.map((id) => [
        id,
        {
          id,
          contentComponent: 'PanelAdapter',
          title: PANEL_TITLES[id] || id,
          params: { panelId: id },
        },
      ]),
    ),
    activeGroup: 'left-sidebar',
  };
}

// =============================================================================
// BikeRackWorkspace Component
// =============================================================================

export function BikeRackWorkspace(): React.ReactElement {
  const apiRef = useRef<DockviewApi | null>(null);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    apiRef.current = api;

    // Build two-region layout: left | right (no sacred center)
    const leftFirst = api.addPanel({
      id: LEFT_PANELS[0],
      component: 'PanelAdapter',
      params: { panelId: LEFT_PANELS[0] },
      title: PANEL_TITLES[LEFT_PANELS[0]],
    });

    for (let i = 1; i < LEFT_PANELS.length; i++) {
      api.addPanel({
        id: LEFT_PANELS[i],
        component: 'PanelAdapter',
        params: { panelId: LEFT_PANELS[i] },
        position: { referencePanel: leftFirst.id },
        title: PANEL_TITLES[LEFT_PANELS[i]],
      });
    }

    const rightFirst = api.addPanel({
      id: RIGHT_PANELS[0],
      component: 'PanelAdapter',
      params: { panelId: RIGHT_PANELS[0] },
      position: { referencePanel: leftFirst.id, direction: 'right' },
      title: PANEL_TITLES[RIGHT_PANELS[0]],
    });

    for (let i = 1; i < RIGHT_PANELS.length; i++) {
      api.addPanel({
        id: RIGHT_PANELS[i],
        component: 'PanelAdapter',
        params: { panelId: RIGHT_PANELS[i] },
        position: { referencePanel: rightFirst.id },
        title: PANEL_TITLES[RIGHT_PANELS[i]],
      });
    }

    // Set sidebar widths
    const leftGroup = leftFirst.group;
    const rightGroup = rightFirst.group;

    if (leftGroup) {
      leftGroup.api.setSize({ width: SIDEBAR_WIDTHS.medium });
    }
    if (rightGroup) {
      rightGroup.api.setSize({ width: SIDEBAR_WIDTHS.medium });
    }
  }, []);

  const components = { PanelAdapter };

  return (
    <div className="cyclist-dockview" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
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
