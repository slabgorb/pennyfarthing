/**
 * PersonaHeader Component
 *
 * Displays the current agent persona (character name, theme, role).
 * Story MSSCI-12700 - PersonaHeader Component
 *
 * Features:
 * - Character name display with prominent styling
 * - Theme name display
 * - Role/title badge
 * - Real-time updates via IPC subscriptions
 * - Graceful handling of missing data
 * - Accessible with ARIA labels
 */

import React from 'react';
import { usePersona } from '../hooks/usePersona';

export default function PersonaHeader(): React.ReactElement {
  const { persona } = usePersona();

  const character = persona?.character || 'Agent';
  const theme = persona?.theme || 'default';
  const role = persona?.role || 'agent';

  return (
    <div
      className="persona-header"
      data-testid="persona-header"
      role="banner"
      aria-label="Current agent persona"
      aria-live="polite"
    >
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
  );
}
