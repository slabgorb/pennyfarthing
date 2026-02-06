/**
 * usePlanModeExit - Smooth plan mode exit with tirepump choice
 *
 * Story: MSSCI-14327
 *
 * Handles the transition from plan mode to accept mode after plan approval,
 * and offers the user a choice to tirepump (commit/push) changes.
 *
 * STUB: Not yet implemented. All functions throw to confirm RED state.
 */

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

export async function handlePlanModeExit(
  _options: PlanModeExitOptions
): Promise<PlanModeExitResult> {
  throw new Error('handlePlanModeExit not implemented');
}

export async function handleTirepumpChoice(
  _options: TirepumpChoiceOptions
): Promise<TirepumpChoiceResult> {
  throw new Error('handleTirepumpChoice not implemented');
}

export function usePlanModeExit() {
  throw new Error('usePlanModeExit not implemented');
}
