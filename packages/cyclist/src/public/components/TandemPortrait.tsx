/**
 * TandemPortrait Component
 *
 * Renders backseat agent portrait below primary in PersonaHeader.
 * Story: MSSCI-14674 (96-1) - TandemPortrait Component
 * Epic: MSSCI-14673 (Cyclist Tandem UI)
 */

import React, { useState } from 'react';

export interface TandemPortraitProps {
  character: string;
  role: string;
  slug: string;
  theme: string;
  isActive: boolean;
  isThinking: boolean;
}

const AGENT_ABBREV: Record<string, string> = {
  pm: 'PM',
  sm: 'SM',
  dev: 'DEV',
  tea: 'TEA',
  reviewer: 'REV',
  architect: 'ARC',
  devops: 'OPS',
  'ux-designer': 'UX',
  'tech-writer': 'TW',
  orchestrator: 'ORC',
};

export default function TandemPortrait({
  character,
  role,
  slug,
  theme,
  isActive,
  isThinking,
}: TandemPortraitProps): React.ReactElement | null {
  const [portraitError, setPortraitError] = useState(false);

  if (!isActive) return null;

  return (
    <div
      className={`persona-tandem-portrait${isThinking ? ' avatar-tandem-thinking' : ''}`}
      data-testid="tandem-portrait"
    >
      {!portraitError ? (
        <img
          src={`/portraits/${theme}/medium/${slug}.png`}
          alt={`${character} (${role}) - observing`}
          className="tandem-portrait-image"
          onError={() => setPortraitError(true)}
        />
      ) : (
        <span className="tandem-portrait-fallback">🤖</span>
      )}
      <span className="tandem-role-badge" data-testid="tandem-role-badge">
        {AGENT_ABBREV[role] || role.toUpperCase()}
      </span>
    </div>
  );
}
