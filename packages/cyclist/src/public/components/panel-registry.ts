/**
 * Shared panel component registry
 *
 * Used by both DockviewWorkspace and BikeRackWorkspace to look up
 * registered panel components by ID. Extracted to avoid importing
 * DockviewWorkspace (which has shadcn/ui deps) from BikeRackWorkspace.
 */

import type { ComponentType } from 'react';

export const panelRegistry: Map<string, ComponentType> = new Map();
