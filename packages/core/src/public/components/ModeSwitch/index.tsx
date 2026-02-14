/**
 * ModeSwitch Component
 *
 * A 3-way toggle for Plan/Manual/Accept permission modes with sliding highlight animation.
 * Story MSSCI-12773 - ModeSwitch Component
 *
 * Features:
 * - Three mode options: Plan, Manual, Accept
 * - Sliding highlight animation on mode change
 * - Keyboard accessible (arrow keys via Radix ToggleGroup, Cmd+1/2/3 shortcuts)
 * - ARIA radiogroup semantics provided by Radix ToggleGroup
 * - Color-coded modes: Plan (teal), Manual (gray), Accept (purple)
 * - Tooltips with mode descriptions via Radix Tooltip
 *
 * Refactored to use shadcn ToggleGroup primitive (replaces custom roving tabindex,
 * manual keyboard handling, and manual ARIA management).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import './ModeSwitch.css';

// =============================================================================
// Types and Constants
// =============================================================================

export type Mode = 'plan' | 'manual' | 'accept';

export const MODES: Mode[] = ['plan', 'manual', 'accept'];

export const MODE_LABELS: Record<Mode, string> = {
  plan: 'Plan',
  manual: 'Manual',
  accept: 'Accept',
};

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  plan: 'Read-only exploration mode',
  manual: 'Ask for permission before actions',
  accept: 'Auto-accept file edits',
};

// =============================================================================
// Mode Mapping (UI <-> Claude CLI)
// =============================================================================

/** Map UI mode names to Claude CLI mode names */
export const MODE_TO_CLAUDE: Record<Mode, string> = {
  plan: 'plan',
  manual: 'default',
  accept: 'acceptEdits',
};

/** Map Claude CLI mode names back to UI mode names */
export const CLAUDE_TO_MODE: Record<string, Mode> = {
  plan: 'plan',
  default: 'manual',
  acceptEdits: 'accept',
};

// =============================================================================
// Keyboard Shortcuts (AC6)
// =============================================================================

/** Cmd+1/2/3 shortcuts to switch modes */
export const MODE_SHORTCUTS: Record<string, Mode> = {
  '1': 'plan',
  '2': 'manual',
  '3': 'accept',
};

// =============================================================================
// Tooltip Support (AC7)
// =============================================================================

/** Flag indicating tooltips are enabled via Radix Tooltip */
export const TOOLTIP_ENABLED = true;

export interface ModeSwitchProps {
  /** Current active mode */
  mode?: Mode;
  /** Default mode if uncontrolled */
  defaultMode?: Mode;
  /** Callback when mode changes */
  onModeChange?: (mode: Mode) => void;
  /** Additional CSS class */
  className?: string;
  /** Disable the component */
  disabled?: boolean;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the default mode (manual)
 */
export function getDefaultMode(): Mode {
  return 'manual';
}

// =============================================================================
// useModeSwitch Hook
// =============================================================================

interface UseModesSwitchResult {
  mode: Mode;
  setMode: (mode: Mode) => void;
  nextMode: () => void;
  prevMode: () => void;
}

export function useModeSwitch(initialMode: Mode = 'manual'): UseModesSwitchResult {
  const [mode, setModeState] = useState<Mode>(initialMode);

  const setMode = useCallback((newMode: Mode) => {
    if (MODES.includes(newMode)) {
      setModeState(newMode);
    }
  }, []);

  const nextMode = useCallback(() => {
    const currentIndex = MODES.indexOf(mode);
    const nextIndex = (currentIndex + 1) % MODES.length;
    setModeState(MODES[nextIndex]);
  }, [mode]);

  const prevMode = useCallback(() => {
    const currentIndex = MODES.indexOf(mode);
    const prevIndex = (currentIndex - 1 + MODES.length) % MODES.length;
    setModeState(MODES[prevIndex]);
  }, [mode]);

  return { mode, setMode, nextMode, prevMode };
}

// =============================================================================
// useModeSwitchShortcuts Hook (AC6)
// =============================================================================

/**
 * Hook to register Cmd+1/2/3 keyboard shortcuts for mode switching
 */
export function useModeSwitchShortcuts(onModeChange: (mode: Mode) => void): void {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && MODE_SHORTCUTS[e.key]) {
        e.preventDefault();
        onModeChange(MODE_SHORTCUTS[e.key]);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onModeChange]);
}

// =============================================================================
// useModeSync Hook (Backend Integration via WebSocket)
// =============================================================================

interface UseModeSyncResult {
  mode: Mode;
  setMode: (mode: Mode) => void;
  isLoading: boolean;
}

/**
 * Hook to sync UI mode state with Claude backend via WebSocket
 * Migrated from IPC to WebSocket for unified communication
 */
export function useModeSync(): UseModeSyncResult {
  const [mode, setModeState] = useState<Mode>('manual');
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket and sync mode
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/claude`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Request current mode from server
      ws.send(JSON.stringify({ type: 'getMode' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'mode' && data.mode) {
          const uiMode = CLAUDE_TO_MODE[data.mode] || 'manual';
          setModeState(uiMode);
          setIsLoading(false);
          console.log('[ModeSwitch] Mode synced:', data.mode, '->', uiMode);
        }
      } catch (err) {
        console.error('[ModeSwitch] Failed to parse mode response:', err);
      }
    };

    ws.onerror = () => {
      setIsLoading(false);
    };

    // Timeout fallback if server doesn't respond
    const timeout = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
      }
    }, 2000);

    return () => {
      clearTimeout(timeout);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, []);

  // Set mode on Claude backend via WebSocket
  const setMode = useCallback((newMode: Mode) => {
    const claudeMode = MODE_TO_CLAUDE[newMode];

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setMode', mode: claudeMode }));
      setModeState(newMode);
      console.log('[ModeSwitch] Mode set to:', newMode, '->', claudeMode);
    } else {
      // WebSocket not connected, just update local state
      setModeState(newMode);
      console.warn('[ModeSwitch] WebSocket not connected, mode set locally only');
    }
  }, []);

  return { mode, setMode, isLoading };
}

// =============================================================================
// ModeSwitch Component
// =============================================================================

export function ModeSwitch({
  mode: controlledMode,
  defaultMode = 'manual',
  onModeChange,
  className = '',
  disabled = false,
}: ModeSwitchProps): React.ReactElement {
  // Support both controlled and uncontrolled usage
  const [internalMode, setInternalMode] = useState<Mode>(defaultMode);
  const [reducedMotion, setReducedMotion] = useState(false);
  const mode = controlledMode ?? internalMode;

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Calculate highlight position based on current mode
  const modeIndex = MODES.indexOf(mode);

  const handleModeChange = useCallback((newMode: Mode) => {
    if (disabled) return;
    if (!controlledMode) {
      setInternalMode(newMode);
    }
    onModeChange?.(newMode);
  }, [controlledMode, disabled, onModeChange]);

  /**
   * Radix ToggleGroup fires onValueChange with the new value string.
   * When the user clicks the already-selected item, value is '' (deselect);
   * we ignore that to enforce "always one selected".
   */
  const handleValueChange = useCallback(
    (value: string) => {
      if (!value) return; // prevent deselect
      handleModeChange(value as Mode);
    },
    [handleModeChange],
  );

  return (
    <div
      className={cn(
        'mode-switch',
        disabled && 'mode-switch--disabled',
        reducedMotion && 'reduced-motion',
        className,
      )}
      data-testid="mode-switch"
      style={reducedMotion ? { transition: 'none' } : undefined}
    >
      {/* Sliding highlight */}
      <div
        className="mode-switch__highlight"
        data-testid="mode-highlight"
        style={{
          transform: `translateX(${modeIndex * 100}%)`,
          transition: reducedMotion ? 'none' : undefined,
        }}
        data-mode={mode}
      />

      {/* Mode options via shadcn ToggleGroup */}
      <TooltipProvider delayDuration={400}>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={handleValueChange}
          disabled={disabled}
          className="relative z-[1] gap-0"
          aria-label="Permission mode"
        >
          {MODES.map((m) => {
            const isActive = mode === m;
            return (
              <Tooltip key={m}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={m}
                    data-mode={m}
                    data-testid={`mode-${m}`}
                    aria-label={`${MODE_LABELS[m]} mode: ${MODE_DESCRIPTIONS[m]}`}
                    className={cn(
                      'mode-option',
                      isActive && 'active',
                    )}
                  >
                    {MODE_LABELS[m]}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {MODE_DESCRIPTIONS[m]}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </TooltipProvider>

      {/* Screen reader announcement */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {`${MODE_LABELS[mode]} mode selected`}
      </div>
    </div>
  );
}

export default ModeSwitch;
