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

export function PortraitPanel(): React.ReactElement {
  return <div data-testid="portrait-panel">TODO: implement</div>;
}
