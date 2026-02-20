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
import {
  EnhancedSprintPanel,
  GitPanel,
  DiffsPanel,
  TodoPanel,
  WorkflowPanel,
  BackgroundPanel,
  AuditLogPanel,
  ACPanel,
  DebugPanel,
  BikeLanePanel,
  SettingsPanel,
  ProgressPanel,
} from './panels';

/**
 * Registry mapping panel URL names to their components.
 * Single source of truth for standalone panel routing (CE-2).
 */
export const PANEL_REGISTRY: Record<string, React.ComponentType> = {
  sprint: EnhancedSprintPanel,
  git: GitPanel,
  diffs: DiffsPanel,
  todos: TodoPanel,
  workflow: WorkflowPanel,
  background: BackgroundPanel,
  audit: AuditLogPanel,
  ac: ACPanel,
  debug: DebugPanel,
  bikelane: BikeLanePanel,
  settings: SettingsPanel,
  progress: ProgressPanel,
};

/**
 * Detect standalone panel mode from URL parameters (Rule 10).
 */
export function getStandalonePanelName(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('panel');
}

/**
 * StandalonePanel wrapper - renders a single panel full-screen.
 */
export function StandalonePanel(): React.ReactElement {
  const panelName = getStandalonePanelName();
  const PanelComponent = panelName ? PANEL_REGISTRY[panelName] : null;

  if (!PanelComponent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-primary, #1a1a2e)', color: 'var(--text-primary, #e4e4e7)' }}>
        <h1>Panel not found</h1>
        <p>
          <a href="/" style={{ color: 'var(--accent, #818cf8)' }}>Back to BikeRack</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'auto', backgroundColor: 'var(--bg-primary, #1a1a2e)', color: 'var(--text-primary, #e4e4e7)' }}>
      <PanelComponent />
    </div>
  );
}
