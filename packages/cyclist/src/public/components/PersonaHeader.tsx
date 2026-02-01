/**
 * PersonaHeader Component
 *
 * Displays the current agent persona with portrait, character name, theme, role.
 * Story MSSCI-12700 - PersonaHeader Component
 *
 * Features:
 * - Portrait image display
 * - Character name display with prominent styling
 * - Theme name display
 * - Role/title badge
 * - Real-time updates via IPC subscriptions
 * - Graceful handling of missing data
 * - Accessible with ARIA labels
 */

import React, { useState } from 'react';
import { usePersona } from '../hooks/usePersona';

export default function PersonaHeader(): React.ReactElement {
  const { persona } = usePersona();
  const [portraitError, setPortraitError] = useState(false);

  const character = persona?.character || 'Agent';
  const theme = persona?.theme || 'default';
  const role = persona?.role || 'agent';
  const slug = persona?.slug;

  // Don't render if no persona data
  if (!persona?.character) {
    return <div className="persona-header empty" data-testid="persona-header" />;
  }

  return (
    <div
      className="persona-header"
      data-testid="persona-header"
      role="banner"
      aria-label="Current agent persona"
      aria-live="polite"
    >
      <div className="persona-portrait" data-testid="persona-portrait">
        {slug && theme && !portraitError ? (
          <img
            src={`/portraits/${theme}/small/${slug}.png`}
            alt={character}
            className="portrait-image"
            onError={() => setPortraitError(true)}
          />
        ) : (
          <span className="portrait-fallback">🤖</span>
        )}
      </div>
      <div className="persona-info">
        <span
          className="persona-character"
          data-testid="persona-character"
          title={character}
        >
          {character}
        </span>
        <span
          className="persona-theme"
          data-testid="persona-theme"
          title={`Theme: ${theme}`}
        >
          {theme}
        </span>
        <span
          className="persona-role badge"
          data-testid="persona-role"
          title={role}
        >
          {role}
        </span>
      </div>
    </div>
  );
}
