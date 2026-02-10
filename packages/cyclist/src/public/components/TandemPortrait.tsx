/**
 * TandemPortrait Component (STUB)
 *
 * Renders backseat agent portrait below primary in PersonaHeader.
 * Story: MSSCI-14674 (96-1) - TandemPortrait Component
 * Epic: MSSCI-14673 (Cyclist Tandem UI)
 *
 * TODO: Implement component - see .session/96-1-session.md for requirements
 */

import React from 'react';

export interface TandemPortraitProps {
  character: string;
  role: string;
  slug: string;
  theme: string;
  isActive: boolean;
  isThinking: boolean;
}

export default function TandemPortrait(_props: TandemPortraitProps): React.ReactElement | null {
  // STUB: Returns null — tests will fail on assertions, not imports
  return null;
}
