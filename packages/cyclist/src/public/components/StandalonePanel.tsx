/**
 * StandalonePanel - Full-screen panel wrapper for BikeRack mode
 *
 * Story MSSCI-14821: StandalonePanel wrapper and ?panel=X client routing
 * Epic: 101 (BikeRack Mode)
 *
 * Renders a single panel full-screen based on ?panel=X URL parameter.
 * PANEL_REGISTRY is the single source of truth for routing (CE-2).
 *
 * Rules:
 * - No dockview-react imports (Rule 7)
 * - No BikeRack-specific props to panels (Rule 2)
 * - URL-based detection only (Rule 10)
 */

import React from 'react';

/**
 * Registry mapping panel URL names to their components.
 * Single source of truth for standalone panel routing (CE-2).
 */
export const PANEL_REGISTRY: Record<string, React.ComponentType> = {};

/**
 * Detect standalone panel mode from URL parameters (Rule 10).
 */
export function getStandalonePanelName(): string | null {
  return null;
}

/**
 * StandalonePanel wrapper - renders a single panel full-screen.
 */
export function StandalonePanel(): React.ReactElement {
  return <div data-testid="standalone-panel">Not implemented</div>;
}
