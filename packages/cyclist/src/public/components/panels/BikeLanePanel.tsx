/**
 * BikeLanePanel - Display workflow visualization
 *
 * Story MSSCI-12849 - Missing AC & BikeLane panels in Progress tab
 *
 * STUB: This component exists to allow tests to import it.
 * Dev will implement the actual functionality.
 *
 * Reference: Deleted vanilla JS in commit 9aea4f371
 * - js/sidebar/bikelane.js
 */

import React from 'react';
import type { WorkflowPhase } from '../../../story-parser.js';

export interface PhaseHistoryEntry {
  phase: string;
  agent: string;
  status: 'done' | 'current' | 'pending';
  duration?: string;
}

export interface BikeLanePanelProps {
  workflowType: string | null;
  phases: WorkflowPhase[] | null;
  phaseHistory?: PhaseHistoryEntry[] | null;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function BikeLanePanel(_props: BikeLanePanelProps): React.ReactElement {
  // STUB: Throw error so tests fail with clear message
  throw new Error('BikeLanePanel not implemented');
}

export default BikeLanePanel;
