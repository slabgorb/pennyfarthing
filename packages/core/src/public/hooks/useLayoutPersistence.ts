/**
 * useLayoutPersistence Hook
 *
 * React hook for saving and restoring layout state to config.local.yaml.
 * Story MSSCI-12706 - Layout Persistence
 *
 * Uses native Dockview SerializedDockview format for complete layout fidelity.
 *
 * REST API:
 * - GET /api/settings/layout - Load layout
 * - PATCH /api/settings/layout - Save layout
 *
 * Features:
 * - Load layout from config on mount
 * - Save layout on changes (debounced)
 * - Per-project independent layouts
 * - Graceful handling of corrupted/missing config
 * - Native Dockview serialization for perfect restore
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SerializedDockview } from 'dockview-react';

const DEBOUNCE_DELAY = 300;

interface UseLayoutPersistenceResult {
  layout: SerializedDockview | null;
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
  saveLayout: (layout: SerializedDockview) => void;
}

/**
 * Validate that the layout has the native Dockview structure
 */
function isValidDockviewLayout(layout: unknown): layout is SerializedDockview {
  if (!layout || typeof layout !== 'object') return false;
  const layoutObj = layout as Record<string, unknown>;

  // Check for native Dockview structure: grid and panels are required
  if (!layoutObj.grid || typeof layoutObj.grid !== 'object') return false;
  if (!layoutObj.panels || typeof layoutObj.panels !== 'object') return false;

  // A layout with zero panels is empty — treat as invalid so default panels get created
  if (Object.keys(layoutObj.panels as Record<string, unknown>).length === 0) return false;

  const grid = layoutObj.grid as Record<string, unknown>;
  // Grid should have root, width, height, orientation
  if (!grid.root || typeof grid.width !== 'number' || typeof grid.height !== 'number') return false;

  return true;
}

export function useLayoutPersistence(endpoint: string = '/api/settings/layout'): UseLayoutPersistenceResult {
  const [layout, setLayout] = useState<SerializedDockview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayoutRef = useRef<SerializedDockview | null>(null);

  // Load layout on mount via REST API
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          if (data.layout && isValidDockviewLayout(data.layout)) {
            // Use native Dockview layout directly
            setLayout(data.layout as SerializedDockview);
          } else {
            // No saved layout or invalid format - let DockviewWorkspace build default
            setLayout(null);
          }
        } else {
          // API error - let DockviewWorkspace build default
          setLayout(null);
        }
      } catch (err) {
        // On error, let DockviewWorkspace build default
        console.error('[useLayoutPersistence] Failed to load layout:', err);
        setLayout(null);
        setError(err instanceof Error ? err : new Error('Failed to load layout'));
      } finally {
        setIsLoading(false);
      }
    };

    loadLayout();
  }, [endpoint]);

  // Debounced save function via REST API - saves native Dockview format directly
  const saveLayout = useCallback((newLayout: SerializedDockview) => {
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
        // Save native Dockview format directly - no conversion needed
        const response = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(layoutToSave),
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
  }, [endpoint]);

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
