/**
 * AcceptanceCriteriaPanel - Display acceptance criteria checklist
 *
 * Story MSSCI-12849 - Missing AC & BikeLane panels in Progress tab
 *
 * STUB: This component exists to allow tests to import it.
 * Dev will implement the actual functionality.
 *
 * Reference: Deleted vanilla JS in commit 9aea4f371
 * - js/sidebar/acceptance-criteria.js
 */

import React from 'react';
import type { CriteriaItem } from '../../../story-parser.js';

export interface AcceptanceCriteriaPanelProps {
  criteria: CriteriaItem[] | null;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function AcceptanceCriteriaPanel(_props: AcceptanceCriteriaPanelProps): React.ReactElement {
  // STUB: Throw error so tests fail with clear message
  throw new Error('AcceptanceCriteriaPanel not implemented');
}

export default AcceptanceCriteriaPanel;
