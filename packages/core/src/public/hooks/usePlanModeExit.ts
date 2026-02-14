/**
 * usePlanModeExit - Smooth plan mode exit with tirepump choice
 *
 * Story: MSSCI-14327
 *
 * Handles the transition from plan mode to accept mode after plan approval,
 * and offers the user a choice to tirepump (commit/push) changes.
 */

import { useState, useCallback } from 'react';
import type { Mode } from '../components/ModeSwitch/index';

/** The Claude CLI mode to transition to after plan exit */
export const PLAN_EXIT_MODE = 'acceptEdits';

export interface PlanModeExitOptions {
  currentMode: Mode;
  setMode: (mode: Mode) => void;
  approved: boolean;
  wsConnected?: boolean;
}

export interface TirepumpOption {
  action: 'tirepump' | 'continue';
  label: string;
}

export interface PlanModeExitResult {
  showTirepumpChoice: boolean;
  options?: TirepumpOption[];
  localOnly?: boolean;
}

export interface TirepumpChoiceOptions {
  choice: 'tirepump' | 'continue';
  currentAgent?: string;
  setMode?: (mode: Mode) => void;
  onContextClear?: (data: { agent: string }) => void;
}

export interface TirepumpChoiceResult {
  contextCleared: boolean;
  action: 'tirepump' | 'continue';
}

const TIREPUMP_OPTIONS: TirepumpOption[] = [
  { action: 'tirepump', label: 'Commit & push changes' },
  { action: 'continue', label: 'Continue without committing' },
];

export async function handlePlanModeExit(
  options: PlanModeExitOptions
): Promise<PlanModeExitResult> {
  const { currentMode, setMode, approved, wsConnected } = options;

  if (!approved) {
    return { showTirepumpChoice: false };
  }

  // Transition from plan to accept if not already there
  if (currentMode !== 'accept') {
    setMode('accept');
  }

  const localOnly = wsConnected === false;

  return {
    showTirepumpChoice: true,
    options: TIREPUMP_OPTIONS,
    ...(localOnly && { localOnly: true }),
  };
}

export async function handleTirepumpChoice(
  options: TirepumpChoiceOptions
): Promise<TirepumpChoiceResult> {
  const { choice, currentAgent, onContextClear } = options;

  if (choice === 'tirepump') {
    onContextClear?.({ agent: currentAgent ?? '' });
    return { contextCleared: true, action: 'tirepump' };
  }

  return { contextCleared: false, action: 'continue' };
}

export function usePlanModeExit() {
  const [showChoice, setShowChoice] = useState(false);
  const [exitResult, setExitResult] = useState<PlanModeExitResult | null>(null);

  const exitPlanMode = useCallback(async (options: PlanModeExitOptions) => {
    const result = await handlePlanModeExit(options);
    setExitResult(result);
    setShowChoice(result.showTirepumpChoice);
    return result;
  }, []);

  const chooseTirepump = useCallback(async (options: TirepumpChoiceOptions) => {
    const result = await handleTirepumpChoice(options);
    setShowChoice(false);
    return result;
  }, []);

  return { showChoice, exitResult, exitPlanMode, chooseTirepump };
}
