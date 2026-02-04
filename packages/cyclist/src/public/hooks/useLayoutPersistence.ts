/**
 * useLayoutPersistence Hook
 *
 * React hook for saving and restoring layout state to config.local.yaml.
 * Story MSSCI-12706 - Layout Persistence
 *
 * IPC DEPRECATED - Now uses REST API:
 * - GET /api/settings/layout - Load layout
 * - PATCH /api/settings/layout - Save layout
 *
 * Features:
 * - Load layout from config on mount
 * - Save layout on changes (debounced)
 * - Per-project independent layouts
 * - Graceful handling of corrupted/missing config
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkspaceLayoutConfig } from '../components/DockviewWorkspace';
import {
  createWorkspaceLayout,
  LEFT_SIDEBAR_PANELS,
  RIGHT_SIDEBAR_PANELS,
} from '../components/DockviewWorkspace';

const LAYOUT_VERSION = 1;
const DEBOUNCE_DELAY = 300;

interface LayoutConfig {
  version: number;
  leftSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
    activePanel?: string;
  };
  rightSidebar: {
    panels: string[];
    width: number;
    collapsed: boolean;
    activePanel?: string;
  };
}

interface UseLayoutPersistenceResult {
  layout: WorkspaceLayoutConfig | null;
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
  saveLayout: (layout: WorkspaceLayoutConfig) => void;
}

function isValidLayoutData(layout: unknown): boolean {
  if (!layout || typeof layout !== 'object') return false;
  const layoutObj = layout as Record<string, unknown>;

  // Check for valid sidebar structures
  const left = layoutObj.leftSidebar as Record<string, unknown> | undefined;
  const right = layoutObj.rightSidebar as Record<string, unknown> | undefined;

  if (!left || !right) return false;
  if (typeof left.width !== 'number' || typeof right.width !== 'number') return false;
  if (!Array.isArray(left.panels) && left.panels !== undefined) return false;
  if (!Array.isArray(right.panels) && right.panels !== undefined) return false;

  return true;
}

/**
 * Merge saved panels with canonical panel list to ensure no panels are missing.
 * New panels added to PANEL_INVENTORY will be appended to the saved layout.
 * Panels removed from PANEL_INVENTORY will be filtered out.
 */
function mergePanelsWithCanonical(
  savedPanels: string[],
  canonicalPanels: readonly string[]
): string[] {
  // Keep only panels that exist in canonical list (preserving user order)
  const validSavedPanels = savedPanels.filter(p => canonicalPanels.includes(p));

  // Find panels in canonical that are missing from saved
  const missingPanels = canonicalPanels.filter(p => !savedPanels.includes(p));

  // Append missing panels to maintain user's custom ordering for existing panels
  return [...validSavedPanels, ...missingPanels];
}

function layoutDataToWorkspaceLayout(layout: unknown): WorkspaceLayoutConfig {
  const defaultLayout = createWorkspaceLayout();
  const layoutObj = layout as Record<string, unknown> | null | undefined;

  if (!layoutObj) return defaultLayout;

  const leftSidebar = layoutObj.leftSidebar as Record<string, unknown> | undefined;
  const rightSidebar = layoutObj.rightSidebar as Record<string, unknown> | undefined;

  // Get saved panels or use defaults
  const savedLeftPanels = Array.isArray(leftSidebar?.panels)
    ? leftSidebar.panels as string[]
    : defaultLayout.leftSidebar.panels;
  const savedRightPanels = Array.isArray(rightSidebar?.panels)
    ? rightSidebar.panels as string[]
    : defaultLayout.rightSidebar.panels;

  // Merge with canonical panel lists to ensure no panels are missing
  // This handles the case where new panels are added to PANEL_INVENTORY
  const mergedLeftPanels = mergePanelsWithCanonical(savedLeftPanels, LEFT_SIDEBAR_PANELS);
  const mergedRightPanels = mergePanelsWithCanonical(savedRightPanels, RIGHT_SIDEBAR_PANELS);

  return {
    leftSidebar: {
      panels: mergedLeftPanels,
      width: typeof leftSidebar?.width === 'number'
        ? leftSidebar.width as number
        : defaultLayout.leftSidebar.width,
      collapsed: typeof leftSidebar?.collapsed === 'boolean'
        ? leftSidebar.collapsed as boolean
        : defaultLayout.leftSidebar.collapsed,
      activePanel: typeof leftSidebar?.activePanel === 'string'
        ? leftSidebar.activePanel as string
        : undefined,
    },
    center: defaultLayout.center,
    rightSidebar: {
      panels: mergedRightPanels,
      width: typeof rightSidebar?.width === 'number'
        ? rightSidebar.width as number
        : defaultLayout.rightSidebar.width,
      collapsed: typeof rightSidebar?.collapsed === 'boolean'
        ? rightSidebar.collapsed as boolean
        : defaultLayout.rightSidebar.collapsed,
      activePanel: typeof rightSidebar?.activePanel === 'string'
        ? rightSidebar.activePanel as string
        : undefined,
    },
  };
}

function workspaceLayoutToConfig(layout: WorkspaceLayoutConfig): LayoutConfig {
  return {
    version: LAYOUT_VERSION,
    leftSidebar: {
      panels: layout.leftSidebar.panels,
      width: layout.leftSidebar.width,
      collapsed: layout.leftSidebar.collapsed,
      activePanel: layout.leftSidebar.activePanel,
    },
    rightSidebar: {
      panels: layout.rightSidebar.panels,
      width: layout.rightSidebar.width,
      collapsed: layout.rightSidebar.collapsed,
      activePanel: layout.rightSidebar.activePanel,
    },
  };
}

export function useLayoutPersistence(): UseLayoutPersistenceResult {
  const [layout, setLayout] = useState<WorkspaceLayoutConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayoutRef = useRef<WorkspaceLayoutConfig | null>(null);

  // Load layout on mount via REST API
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const response = await fetch('/api/settings/layout');
        if (response.ok) {
          const data = await response.json();
          if (data.layout && isValidLayoutData(data.layout)) {
            setLayout(layoutDataToWorkspaceLayout(data.layout));
          } else {
            // Use default layout for null/undefined/invalid config
            setLayout(createWorkspaceLayout());
          }
        } else {
          setLayout(createWorkspaceLayout());
        }
      } catch (err) {
        // On error, use default layout
        console.error('[useLayoutPersistence] Failed to load layout:', err);
        setLayout(createWorkspaceLayout());
        setError(err instanceof Error ? err : new Error('Failed to load layout'));
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, []);

  // Debounced save function via REST API
  const saveLayout = useCallback((newLayout: WorkspaceLayoutConfig) => {
    pendingLayoutRef.current = newLayout;

    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounce timer
    debounceRef.current = setTimeout(async () => {
      const layoutToSave = pendingLayoutRef.current;
      if (!layoutToSave) return;

      setIsSaving(true);
      try {
        const config = workspaceLayoutToConfig(layoutToSave);
        const response = await fetch('/api/settings/layout', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });

        if (!response.ok) {
          throw new Error('Failed to save layout');
        }
        setError(null);
      } catch (err) {
        console.error('[useLayoutPersistence] Failed to save layout:', err);
        setError(err instanceof Error ? err : new Error('Failed to save layout'));
      } finally {
        setIsSaving(false);
      }
    }, DEBOUNCE_DELAY);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return { layout, isLoading, isSaving, error, saveLayout };
}
