/**
 * ModeSwitch Component
 *
 * A 3-way toggle for Plan/Manual/Accept permission modes with sliding highlight animation.
 * Story MSSCI-12773 - ModeSwitch Component
 *
 * Features:
 * - Three mode options: Plan, Manual, Accept
 * - Sliding highlight animation on mode change
 * - Keyboard accessible (arrow keys, Enter/Space)
 * - ARIA attributes for screen readers
 * - Color-coded modes: Plan (teal), Manual (gray), Accept (purple)
 */

import React, { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
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
  const mode = controlledMode ?? internalMode;

  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Calculate highlight position based on current mode
  const modeIndex = MODES.indexOf(mode);

  const handleModeChange = useCallback((newMode: Mode) => {
    if (disabled) return;
    if (!controlledMode) {
      setInternalMode(newMode);
    }
    onModeChange?.(newMode);
  }, [controlledMode, disabled, onModeChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    const currentIndex = MODES.indexOf(mode);
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = (currentIndex - 1 + MODES.length) % MODES.length;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = (currentIndex + 1) % MODES.length;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = MODES.length - 1;
        break;
      default:
        return;
    }

    const newMode = MODES[newIndex];
    handleModeChange(newMode);
    optionRefs.current[newIndex]?.focus();
  }, [disabled, mode, handleModeChange]);

  // Focus management for roving tabindex
  useEffect(() => {
    const currentIndex = MODES.indexOf(mode);
    optionRefs.current.forEach((ref, index) => {
      if (ref) {
        ref.tabIndex = index === currentIndex ? 0 : -1;
      }
    });
  }, [mode]);

  const classNames = [
    'mode-switch',
    disabled ? 'mode-switch--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={classNames}
      data-testid="mode-switch"
      role="radiogroup"
      aria-label="Permission mode"
      onKeyDown={handleKeyDown}
    >
      {/* Sliding highlight */}
      <div
        className="mode-switch__highlight"
        data-testid="mode-highlight"
        style={{
          transform: `translateX(${modeIndex * 100}%)`,
        }}
        data-mode={mode}
      />

      {/* Mode options */}
      {MODES.map((m, index) => {
        const isActive = mode === m;
        return (
          <button
            key={m}
            ref={(el) => { optionRefs.current[index] = el; }}
            type="button"
            className={`mode-option ${isActive ? 'active' : ''}`}
            data-mode={m}
            data-testid={`mode-${m}`}
            role="radio"
            aria-checked={isActive}
            aria-label={`${MODE_LABELS[m]} mode: ${MODE_DESCRIPTIONS[m]}`}
            onClick={() => handleModeChange(m)}
            disabled={disabled}
          >
            {MODE_LABELS[m]}
          </button>
        );
      })}

      {/* Screen reader announcement */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {`${MODE_LABELS[mode]} mode selected`}
      </div>
    </div>
  );
}

export default ModeSwitch;
