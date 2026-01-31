/**
 * useLayoutPersistence Hook
 *
 * React hook for saving and restoring layout state to config.local.yaml.
 * Story MSSCI-12706 - Layout Persistence
 *
 * Features:
 * - Load layout from config on mount
 * - Save layout on changes (debounced)
 * - Per-project independent layouts
 * - Graceful handling of corrupted/missing config
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkspaceLayoutConfig } from '../components/DockingWorkspace';
import { createWorkspaceLayout } from '../components/DockingWorkspace';

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

function isValidLayout(config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  const layout = config.layout;
  if (!layout || typeof layout !== 'object') return false;

  // Check for valid sidebar structures
  const left = layout.leftSidebar;
  const right = layout.rightSidebar;

  if (!left || !right) return false;
  if (typeof left.width !== 'number' || typeof right.width !== 'number') return false;
  if (!Array.isArray(left.panels) && left.panels !== undefined) return false;
  if (!Array.isArray(right.panels) && right.panels !== undefined) return false;

  return true;
}

function configToWorkspaceLayout(config: any): WorkspaceLayoutConfig {
  const defaultLayout = createWorkspaceLayout();
  const layout = config?.layout;

  if (!layout) return defaultLayout;

  return {
    leftSidebar: {
      panels: Array.isArray(layout.leftSidebar?.panels)
        ? layout.leftSidebar.panels
        : defaultLayout.leftSidebar.panels,
      width: typeof layout.leftSidebar?.width === 'number'
        ? layout.leftSidebar.width
        : defaultLayout.leftSidebar.width,
      collapsed: typeof layout.leftSidebar?.collapsed === 'boolean'
        ? layout.leftSidebar.collapsed
        : defaultLayout.leftSidebar.collapsed,
    },
    center: defaultLayout.center,
    rightSidebar: {
      panels: Array.isArray(layout.rightSidebar?.panels)
        ? layout.rightSidebar.panels
        : defaultLayout.rightSidebar.panels,
      width: typeof layout.rightSidebar?.width === 'number'
        ? layout.rightSidebar.width
        : defaultLayout.rightSidebar.width,
      collapsed: typeof layout.rightSidebar?.collapsed === 'boolean'
        ? layout.rightSidebar.collapsed
        : defaultLayout.rightSidebar.collapsed,
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
    },
    rightSidebar: {
      panels: layout.rightSidebar.panels,
      width: layout.rightSidebar.width,
      collapsed: layout.rightSidebar.collapsed,
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

  // Load layout on mount
  useEffect(() => {
    const api = window.electronAPI;

    const loadLayout = async () => {
      try {
        // Get project info for context
        if (api?.projectInfo) {
          await api.projectInfo.get();
        }

        // Load layout from config
        if (api?.layout) {
          const config = await api.layout.get();

          if (config && isValidLayout(config)) {
            setLayout(configToWorkspaceLayout(config));
          } else {
            // Use default layout for null/undefined/invalid config
            setLayout(createWorkspaceLayout());
          }
        } else {
          setLayout(createWorkspaceLayout());
        }
      } catch (err) {
        // On error, use default layout
        setLayout(createWorkspaceLayout());
        setError(err instanceof Error ? err : new Error('Failed to load layout'));
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, []);

  // Debounced save function
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

      const api = window.electronAPI;
      if (!api?.layout) return;

      setIsSaving(true);
      try {
        const config = workspaceLayoutToConfig(layoutToSave);
        await api.layout.save(config);
        setError(null);
      } catch (err) {
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
