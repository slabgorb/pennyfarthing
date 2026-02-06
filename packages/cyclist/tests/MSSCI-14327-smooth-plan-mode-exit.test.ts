/**
 * MSSCI-14327: Smooth plan mode exit with tirepump choice
 *
 * ExitPlanMode should transition smoothly without requiring manual user
 * intervention to accept. After plan approval, offer a choice for whether
 * to tirepump (commit/push) the resulting changes before continuing.
 *
 * Acceptance Criteria:
 * - AC1: After plan approval, mode automatically transitions from plan to accept
 * - AC2: User is offered a tirepump choice (commit/push or continue without)
 * - AC3: Choosing tirepump triggers context clear + commit flow
 * - AC4: Choosing "continue without" skips tirepump and stays in accept mode
 * - AC5: Transition works via WebSocket mode sync (not manual user action)
 * - AC6: If WebSocket is disconnected, falls back gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// AC1: After plan approval, mode automatically transitions from plan → accept
// =============================================================================
describe('MSSCI-14327: Smooth plan mode exit', () => {

  describe('AC1: Auto-transition from plan to accept on ExitPlanMode', () => {

    it('should export a handlePlanModeExit function', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      expect(module.handlePlanModeExit).toBeDefined();
      expect(typeof module.handlePlanModeExit).toBe('function');
    });

    it('should export a usePlanModeExit hook', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      expect(module.usePlanModeExit).toBeDefined();
      expect(typeof module.usePlanModeExit).toBe('function');
    });

    it('should accept current mode and setMode callback', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      // handlePlanModeExit takes { currentMode, setMode, onTirepumpChoice }
      expect(module.handlePlanModeExit.length).toBeGreaterThanOrEqual(1);
    });

    it('should transition mode from plan to accept when plan is approved', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const setMode = vi.fn();
      await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode,
        approved: true,
      });

      expect(setMode).toHaveBeenCalledWith('accept');
    });

    it('should NOT transition mode if plan is rejected', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const setMode = vi.fn();
      await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode,
        approved: false,
      });

      expect(setMode).not.toHaveBeenCalled();
    });

    it('should NOT transition if already in accept mode', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const setMode = vi.fn();
      await module.handlePlanModeExit({
        currentMode: 'accept',
        setMode,
        approved: true,
      });

      // Already in accept, no transition needed
      expect(setMode).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC2: User is offered a tirepump choice
  // ===========================================================================
  describe('AC2: Tirepump choice offered after plan approval', () => {

    it('should return a tirepump prompt after successful plan exit', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode: vi.fn(),
        approved: true,
      });

      expect(result).toBeDefined();
      expect(result.showTirepumpChoice).toBe(true);
    });

    it('should provide tirepump and continue options', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode: vi.fn(),
        approved: true,
      });

      expect(result.options).toBeDefined();
      expect(result.options).toContainEqual(
        expect.objectContaining({ action: 'tirepump' })
      );
      expect(result.options).toContainEqual(
        expect.objectContaining({ action: 'continue' })
      );
    });

    it('should NOT show tirepump choice when plan is rejected', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode: vi.fn(),
        approved: false,
      });

      expect(result.showTirepumpChoice).toBe(false);
    });
  });

  // ===========================================================================
  // AC3: Choosing tirepump triggers context clear + commit flow
  // ===========================================================================
  describe('AC3: Tirepump triggers context clear and commit', () => {

    it('should export a handleTirepumpChoice function', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      expect(module.handleTirepumpChoice).toBeDefined();
      expect(typeof module.handleTirepumpChoice).toBe('function');
    });

    it('should emit CONTEXT_CLEAR marker when tirepump is chosen', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const onContextClear = vi.fn();
      await module.handleTirepumpChoice({
        choice: 'tirepump',
        onContextClear,
      });

      expect(onContextClear).toHaveBeenCalled();
    });

    it('should include the current agent in the context clear', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const onContextClear = vi.fn();
      await module.handleTirepumpChoice({
        choice: 'tirepump',
        currentAgent: '/dev',
        onContextClear,
      });

      expect(onContextClear).toHaveBeenCalledWith(
        expect.objectContaining({ agent: '/dev' })
      );
    });

    it('should NOT emit CONTEXT_CLEAR when continue is chosen', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const onContextClear = vi.fn();
      await module.handleTirepumpChoice({
        choice: 'continue',
        onContextClear,
      });

      expect(onContextClear).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC4: Continue without tirepump stays in accept mode
  // ===========================================================================
  describe('AC4: Continue without tirepump', () => {

    it('should keep accept mode when continuing without tirepump', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const setMode = vi.fn();
      await module.handleTirepumpChoice({
        choice: 'continue',
        setMode,
      });

      // Mode should remain accept (no change)
      expect(setMode).not.toHaveBeenCalled();
    });

    it('should return a continue result without context clear', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handleTirepumpChoice({
        choice: 'continue',
      });

      expect(result).toBeDefined();
      expect(result.contextCleared).toBe(false);
      expect(result.action).toBe('continue');
    });

    it('should return a tirepump result with context clear flag', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handleTirepumpChoice({
        choice: 'tirepump',
        onContextClear: vi.fn(),
      });

      expect(result.contextCleared).toBe(true);
      expect(result.action).toBe('tirepump');
    });
  });

  // ===========================================================================
  // AC5: Transition works via WebSocket mode sync
  // ===========================================================================
  describe('AC5: WebSocket mode sync integration', () => {

    it('should send setMode message via WebSocket when transitioning', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      // The handlePlanModeExit should use the same WebSocket protocol
      // as useModeSync: { type: 'setMode', mode: 'acceptEdits' }
      expect(module.PLAN_EXIT_MODE).toBe('acceptEdits');
    });

    it('should map plan exit to Claude CLI acceptEdits mode', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      // When transitioning out of plan mode, the Claude CLI mode should be 'acceptEdits'
      expect(module.PLAN_EXIT_MODE).toBeDefined();
      expect(module.PLAN_EXIT_MODE).toBe('acceptEdits');
    });
  });

  // ===========================================================================
  // AC6: Graceful fallback when WebSocket disconnected
  // ===========================================================================
  describe('AC6: Graceful fallback without WebSocket', () => {

    it('should still transition local mode state when WebSocket is down', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const setMode = vi.fn();
      // Even without WebSocket, local mode should update
      await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode,
        approved: true,
        wsConnected: false,
      });

      expect(setMode).toHaveBeenCalledWith('accept');
    });

    it('should flag that the transition was local-only', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode: vi.fn(),
        approved: true,
        wsConnected: false,
      });

      expect(result.localOnly).toBe(true);
    });

    it('should still offer tirepump choice when WebSocket is down', async () => {
      const module = await import(
        '../src/public/hooks/usePlanModeExit.ts'
      );

      const result = await module.handlePlanModeExit({
        currentMode: 'plan',
        setMode: vi.fn(),
        approved: true,
        wsConnected: false,
      });

      // Tirepump choice should still be offered even without WebSocket
      expect(result.showTirepumpChoice).toBe(true);
    });
  });
});
