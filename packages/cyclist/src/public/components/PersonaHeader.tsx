/**
 * PersonaHeader Component
 *
 * Displays the current agent persona with portrait, character name, theme, role.
 * Story MSSCI-12700 - PersonaHeader Component
 * Story 72-3 - Catchphrase and Badge Improvements
 *
 * Features:
 * - Portrait image display with adjacent role badge
 * - Character name display with prominent styling
 * - Random catchphrase from theme
 * - Color-coded role badge matching CLI statusbar
 * - Real-time updates via IPC subscriptions
 * - Graceful handling of missing data
 * - Accessible with ARIA labels
 */

import React, { useState } from 'react';
import { usePersona } from '../hooks/usePersona';

// Agent colors matching CLI statusbar (statusline.sh)
const AGENT_COLORS: Record<string, string> = {
  pm: '#a78bfa',           // Purple - strategic
  sm: '#60a5fa',           // Blue - coordination
  dev: '#4ade80',          // Green - building
  tea: '#2dd4bf',          // Teal - testing
  reviewer: '#f87171',     // Red - critical eye
  architect: '#fb923c',    // Orange - design
  devops: '#22d3ee',       // Cyan - infrastructure
  'ux-designer': '#f0abfc', // Pink - design
  'tech-writer': '#e5e5e5', // White/light gray - documentation
  orchestrator: '#e879f9', // Magenta - coordination
};

// Convert kebab-case theme name to Title Case (e.g., "princess-bride" -> "Princess Bride")
function humanizeTheme(theme: string): string {
  return theme
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function PersonaHeader(): React.ReactElement {
  const { persona } = usePersona();
  const [portraitError, setPortraitError] = useState(false);

  const character = persona?.character || 'Agent';
  const theme = persona?.theme || 'default';
  const role = persona?.role || 'agent';
  const slug = persona?.slug;
  const quote = persona?.quote;

  // Get role color, fallback to magenta
  const roleColor = AGENT_COLORS[role] || '#e879f9';

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
      <div className="persona-portrait-group">
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
        <span
          className="persona-role badge"
          data-testid="persona-role"
          title={role}
          style={{ backgroundColor: roleColor }}
        >
          {role}
        </span>
      </div>
      <div className="persona-info">
        <div className="persona-name-row">
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
            {humanizeTheme(theme)}
          </span>
        </div>
        {quote && (
          <span
            className="persona-catchphrase"
            data-testid="persona-catchphrase"
            title={quote}
          >
            "{quote}"
          </span>
        )}
      </div>
    </div>
  );
}
