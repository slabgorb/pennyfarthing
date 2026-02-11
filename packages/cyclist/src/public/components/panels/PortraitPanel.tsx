/**
 * PortraitPanel - Agent identity display with tandem support
 *
 * Story MSSCI-14823 (101-4): PortraitPanel with tandem support
 * Epic: 101 (BikeRack Mode)
 *
 * Displays agent character name, role, and portrait image.
 * Shows tandem agent when active. Uses existing usePersona() hook.
 *
 * Rules:
 * - Uses existing usePersona() hook (CE-1)
 * - No new WebSocket connections or endpoints (CE-5, Rule 3)
 * - Renders in StandalonePanel wrapper via ?panel=portrait
 */

import React from 'react';
import { usePersona } from '../../hooks/usePersona';

export function PortraitPanel(): React.ReactElement {
  const { persona } = usePersona();

  if (!persona || !persona.character) {
    return (
      <div data-testid="portrait-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem' }}>
        <p>No agent active</p>
      </div>
    );
  }

  const portraitUrl = `/portraits/${persona.theme}/medium/${persona.slug}.png`;

  return (
    <div data-testid="portrait-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <img
          src={portraitUrl}
          alt={persona.character}
          style={{ width: '128px', height: '128px', borderRadius: '50%', objectFit: 'cover' }}
        />
        <h2>{persona.character}</h2>
        <span>{persona.role}</span>
      </div>

      {persona.tandemAgent && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
          <img
            src={`/portraits/${persona.tandemAgent.theme}/medium/${persona.tandemAgent.slug}.png`}
            alt={persona.tandemAgent.character}
            style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <h3>{persona.tandemAgent.character}</h3>
          <span>{persona.tandemAgent.role}</span>
        </div>
      )}
    </div>
  );
}
