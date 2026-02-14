/**
 * Shared panel component registry
 *
 * Used by both DockviewWorkspace and BikeRackWorkspace to look up
 * registered panel components by ID. Extracted to avoid importing
 * DockviewWorkspace (which has shadcn/ui deps) from BikeRackWorkspace.
 */

import type { ComponentType } from 'react';

export type PanelComponent = ComponentType;

export const panelRegistry: Map<string, PanelComponent> = new Map();
