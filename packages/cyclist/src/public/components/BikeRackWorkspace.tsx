/**
 * BikeRackWorkspace - Dockview-based panel layout for BikeRack mode
 *
 * Story MSSCI-14877: Migrate BikeRack from index page to Dockview layout
 * Epic: 102 (BikeRack Follow-up)
 *
 * Replaces BikeRackIndex with a proper Dockview layout.
 * No MessagePanel (sacred center) — BikeRack is a monitoring dashboard.
 *
 * TODO: Implement with DockviewReact, register BikeRack panels,
 * create two-sidebar layout without center sacred panel.
 */
import React from 'react';

/**
 * Panels included in BikeRack Dockview mode.
 * Unlike base Cyclist, BikeRack does NOT include MessagePanel.
 */
export const BIKERACK_PANELS: string[] = [];

/**
 * Create default BikeRack Dockview layout.
 * Two-region layout: left sidebar | right sidebar (no sacred center).
 */
export function createBikeRackLayout(): object {
  return {};
}

export function BikeRackWorkspace(): React.ReactElement {
  return <div>Not implemented</div>;
}

export default BikeRackWorkspace;
