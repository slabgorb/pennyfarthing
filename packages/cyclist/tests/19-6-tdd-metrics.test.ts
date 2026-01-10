/**
 * Story 19-6: TDD Phase Transitions Tests
 *
 * Tests for tracking time spent in each TDD phase (RED/GREEN/REVIEW)
 * and calculating duration metrics for efficiency analysis.
 *
 * These tests are written to FAIL initially (RED phase) and should pass
 * after Dev implements the TDD metrics functionality.
 *
 * Acceptance Criteria:
 * 1. Session file parsed for phase changes
 * 2. Phase transition timestamps recorded
 * 3. Duration calculated between phases
 * 4. TDD cycle metrics exposed via API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Types from telemetry-types.ts
import type { TDDMetrics } from '../src/telemetry-types.js';

// NEW functions that need to be implemented for this story
import {
  parsePhaseFromSession,
  recordPhaseTransition,
  getTDDMetrics,
  resetTDDMetrics,
  initializeTDDMetrics,
  calculatePhaseDurations,
} from '../src/tdd-metrics.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/** Session file content with RED phase */
const sessionWithRedPhase = `# Story 19-6: Track TDD Phase Transitions

**Jira:** MSSCI-11431
**Points:** 3

## Status

| Field | Value |
|-------|-------|
| Phase | RED |
| Agent | TEA |
| Started | 2026-01-10 |
| Branch | feature/19-6-tdd-phase-transitions |

## Story Description

Measure time in each TDD phase.
`;

/** Session file content with GREEN phase */
const sessionWithGreenPhase = `# Story 19-6: Track TDD Phase Transitions

## Status

| Field | Value |
|-------|-------|
| Phase | GREEN |
| Agent | Dev |
| Started | 2026-01-10 |
`;

/** Session file content with REVIEW phase */
const sessionWithReviewPhase = `# Story 19-6: Track TDD Phase Transitions

## Status

| Field | Value |
|-------|-------|
| Phase | REVIEW |
| Agent | Reviewer |
| Started | 2026-01-10 |
`;

/** Session file without Phase field */
const sessionWithoutPhase = `# Story 19-6: Track TDD Phase Transitions

## Status

| Field | Value |
|-------|-------|
| Agent | SM |
| Started | 2026-01-10 |
`;

/** Session file with malformed table */
const sessionMalformedTable = `# Story 19-6

## Status

Phase is RED but not in table format.
`;

// =============================================================================
// AC1: Session file parsed for phase changes
// =============================================================================

describe('Story 19-6: TDD Phase Transitions', () => {

  describe('AC1: Session file parsed for phase changes', () => {

    it('should parse RED phase from session file', () => {
      const phase = parsePhaseFromSession(sessionWithRedPhase);

      expect(phase).toBe('RED');
    });

    it('should parse GREEN phase from session file', () => {
      const phase = parsePhaseFromSession(sessionWithGreenPhase);

      expect(phase).toBe('GREEN');
    });

    it('should parse REVIEW phase from session file', () => {
      const phase = parsePhaseFromSession(sessionWithReviewPhase);

      expect(phase).toBe('REVIEW');
    });

    it('should return null when no Phase field exists', () => {
      const phase = parsePhaseFromSession(sessionWithoutPhase);

      expect(phase).toBeNull();
    });

    it('should return null for malformed session file', () => {
      const phase = parsePhaseFromSession(sessionMalformedTable);

      expect(phase).toBeNull();
    });

    it('should handle case-insensitive phase values', () => {
      const lowercaseSession = sessionWithRedPhase.replace('RED', 'red');
      const phase = parsePhaseFromSession(lowercaseSession);

      // Should normalize to uppercase
      expect(phase).toBe('RED');
    });

    it('should handle whitespace around phase value', () => {
      const spacedSession = sessionWithRedPhase.replace('| RED |', '|  RED  |');
      const phase = parsePhaseFromSession(spacedSession);

      expect(phase).toBe('RED');
    });

    it('should parse REFACTOR phase (if used)', () => {
      const refactorSession = sessionWithRedPhase.replace('RED', 'REFACTOR');
      const phase = parsePhaseFromSession(refactorSession);

      expect(phase).toBe('REFACTOR');
    });

  });

  // =============================================================================
  // AC2: Phase transition timestamps recorded
  // =============================================================================

  describe('AC2: Phase transition timestamps recorded', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('should record first phase transition with timestamp', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');

      const metrics = getTDDMetrics();

      expect(metrics).not.toBeNull();
      expect(metrics!.phases.redStart).toBeDefined();
      expect(metrics!.phases.redStart).toBeGreaterThan(0);
    });

    it('should record RED to GREEN transition', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');

      // Simulate time passing
      const redStart = Date.now();

      recordPhaseTransition('GREEN');

      const metrics = getTDDMetrics();

      expect(metrics!.phases.redStart).toBeDefined();
      expect(metrics!.phases.redEnd).toBeDefined();
      expect(metrics!.phases.greenStart).toBeDefined();
      expect(metrics!.phases.redEnd).toBe(metrics!.phases.greenStart);
    });

    it('should record GREEN to REVIEW transition', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');
      recordPhaseTransition('GREEN');
      recordPhaseTransition('REVIEW');

      const metrics = getTDDMetrics();

      expect(metrics!.phases.greenEnd).toBeDefined();
      expect(metrics!.phases.reviewStart).toBeDefined();
      expect(metrics!.phases.greenEnd).toBe(metrics!.phases.reviewStart);
    });

    it('should record complete TDD cycle', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');
      recordPhaseTransition('GREEN');
      recordPhaseTransition('REVIEW');

      const metrics = getTDDMetrics();

      // All phase starts should be defined
      expect(metrics!.phases.redStart).toBeDefined();
      expect(metrics!.phases.greenStart).toBeDefined();
      expect(metrics!.phases.reviewStart).toBeDefined();

      // Transitions should be sequential
      expect(metrics!.phases.redStart!).toBeLessThanOrEqual(metrics!.phases.greenStart!);
      expect(metrics!.phases.greenStart!).toBeLessThanOrEqual(metrics!.phases.reviewStart!);
    });

    it('should store story ID in metrics', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');

      const metrics = getTDDMetrics();

      expect(metrics!.storyId).toBe('19-6');
    });

    it('should handle recording same phase twice (no-op)', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');
      const firstRedStart = getTDDMetrics()!.phases.redStart;

      // Recording RED again should not change the timestamp
      recordPhaseTransition('RED');

      const metrics = getTDDMetrics();
      expect(metrics!.phases.redStart).toBe(firstRedStart);
    });

    it('should allow custom timestamp for testing', () => {
      initializeTDDMetrics('19-6');
      const customTime = 1704844800000; // 2024-01-10 00:00:00 UTC

      recordPhaseTransition('RED', customTime);

      const metrics = getTDDMetrics();
      expect(metrics!.phases.redStart).toBe(customTime);
    });

  });

  // =============================================================================
  // AC3: Duration calculated between phases
  // =============================================================================

  describe('AC3: Duration calculated between phases', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('should calculate RED phase duration', () => {
      initializeTDDMetrics('19-6');

      // RED phase: 10 seconds
      recordPhaseTransition('RED', 1000);
      recordPhaseTransition('GREEN', 11000);

      const metrics = getTDDMetrics();

      expect(metrics!.redPhaseDurationMs).toBe(10000);
    });

    it('should calculate GREEN phase duration', () => {
      initializeTDDMetrics('19-6');

      recordPhaseTransition('RED', 1000);
      recordPhaseTransition('GREEN', 11000);
      recordPhaseTransition('REVIEW', 31000); // GREEN: 20 seconds

      const metrics = getTDDMetrics();

      expect(metrics!.greenPhaseDurationMs).toBe(20000);
    });

    it('should calculate REVIEW phase duration', () => {
      initializeTDDMetrics('19-6');

      recordPhaseTransition('RED', 1000);
      recordPhaseTransition('GREEN', 11000);
      recordPhaseTransition('REVIEW', 31000);

      // End the review phase (simulates story completion)
      const metrics = getTDDMetrics();

      // REVIEW duration only calculable when review ends
      // For now, check it's undefined while still in REVIEW
      expect(metrics!.reviewPhaseDurationMs).toBeUndefined();
    });

    it('should calculate total cycle duration', () => {
      initializeTDDMetrics('19-6');

      recordPhaseTransition('RED', 1000);
      recordPhaseTransition('GREEN', 11000);
      recordPhaseTransition('REVIEW', 31000);

      const metrics = getTDDMetrics();

      // Total from RED start to REVIEW start
      expect(metrics!.totalCycleDurationMs).toBe(30000);
    });

    it('should use calculatePhaseDurations helper', () => {
      const phases = {
        redStart: 1000,
        redEnd: 11000,
        greenStart: 11000,
        greenEnd: 31000,
        reviewStart: 31000,
        reviewEnd: 36000,
      };

      const durations = calculatePhaseDurations(phases);

      expect(durations.redPhaseDurationMs).toBe(10000);
      expect(durations.greenPhaseDurationMs).toBe(20000);
      expect(durations.reviewPhaseDurationMs).toBe(5000);
      expect(durations.totalCycleDurationMs).toBe(35000);
    });

    it('should handle missing phases in duration calculation', () => {
      const phases = {
        redStart: 1000,
        redEnd: 11000,
        greenStart: 11000,
        // No greenEnd or review phases
      };

      const durations = calculatePhaseDurations(phases);

      expect(durations.redPhaseDurationMs).toBe(10000);
      expect(durations.greenPhaseDurationMs).toBeUndefined();
      expect(durations.reviewPhaseDurationMs).toBeUndefined();
    });

    it('should return undefined durations when phase not started', () => {
      initializeTDDMetrics('19-6');

      const metrics = getTDDMetrics();

      expect(metrics!.redPhaseDurationMs).toBeUndefined();
      expect(metrics!.greenPhaseDurationMs).toBeUndefined();
      expect(metrics!.reviewPhaseDurationMs).toBeUndefined();
    });

  });

  // =============================================================================
  // AC4: TDD cycle metrics exposed via API
  // =============================================================================

  describe('AC4: TDD cycle metrics exposed via API', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('should return null when no metrics initialized', () => {
      const metrics = getTDDMetrics();

      expect(metrics).toBeNull();
    });

    it('should return TDDMetrics after initialization', () => {
      initializeTDDMetrics('19-6');

      const metrics = getTDDMetrics();

      expect(metrics).not.toBeNull();
      expect(metrics!.storyId).toBe('19-6');
    });

    it('should return complete metrics structure', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED', 1000);
      recordPhaseTransition('GREEN', 11000);
      recordPhaseTransition('REVIEW', 31000);

      const metrics = getTDDMetrics();

      // Check structure matches TDDMetrics type
      expect(metrics).toMatchObject({
        storyId: '19-6',
        phases: {
          redStart: 1000,
          redEnd: 11000,
          greenStart: 11000,
          greenEnd: 31000,
          reviewStart: 31000,
        },
        redPhaseDurationMs: 10000,
        greenPhaseDurationMs: 20000,
        totalCycleDurationMs: 30000,
      });
    });

    it('should reset metrics for new story', () => {
      initializeTDDMetrics('19-5');
      recordPhaseTransition('RED');

      resetTDDMetrics();

      expect(getTDDMetrics()).toBeNull();
    });

    it('should allow re-initialization for new story', () => {
      initializeTDDMetrics('19-5');
      recordPhaseTransition('RED');

      initializeTDDMetrics('19-6');

      const metrics = getTDDMetrics();
      expect(metrics!.storyId).toBe('19-6');
      expect(metrics!.phases.redStart).toBeUndefined();
    });

  });

  // =============================================================================
  // Type Conformance
  // =============================================================================

  describe('Type Conformance', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('getTDDMetrics should return TDDMetrics or null', () => {
      const result = getTDDMetrics();

      // Should be null or conform to TDDMetrics
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('TDDMetrics should have required storyId field', () => {
      initializeTDDMetrics('19-6');

      const metrics = getTDDMetrics()!;

      expect(typeof metrics.storyId).toBe('string');
    });

    it('TDDMetrics.phases should have correct structure', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');

      const metrics = getTDDMetrics()!;

      // phases is an object with optional timestamp fields
      expect(typeof metrics.phases).toBe('object');
      expect(
        metrics.phases.redStart === undefined ||
        typeof metrics.phases.redStart === 'number'
      ).toBe(true);
    });

    it('parsePhaseFromSession should return valid phase or null', () => {
      const validPhases = ['RED', 'GREEN', 'REFACTOR', 'REVIEW'];
      const result = parsePhaseFromSession(sessionWithRedPhase);

      expect(result === null || validPhases.includes(result)).toBe(true);
    });

  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('should handle empty session content', () => {
      const phase = parsePhaseFromSession('');

      expect(phase).toBeNull();
    });

    it('should handle session with only header', () => {
      const phase = parsePhaseFromSession('# Story 19-6');

      expect(phase).toBeNull();
    });

    it('should handle unknown phase value', () => {
      const unknownPhaseSession = sessionWithRedPhase.replace('RED', 'UNKNOWN');
      const phase = parsePhaseFromSession(unknownPhaseSession);

      // Should return null for unknown phases
      expect(phase).toBeNull();
    });

    it('should handle phase changes out of expected order', () => {
      initializeTDDMetrics('19-6');

      // Skip straight to GREEN (unusual but possible)
      recordPhaseTransition('GREEN');

      const metrics = getTDDMetrics();

      expect(metrics!.phases.greenStart).toBeDefined();
      expect(metrics!.phases.redStart).toBeUndefined();
    });

    it('should handle recording after reset', () => {
      initializeTDDMetrics('19-6');
      recordPhaseTransition('RED');
      resetTDDMetrics();

      // Should not throw, just be no-op without initialization
      expect(() => recordPhaseTransition('GREEN')).not.toThrow();

      expect(getTDDMetrics()).toBeNull();
    });

    it('should handle multiple status tables in session', () => {
      const multipleTablesSession = `
## Status

| Field | Value |
|-------|-------|
| Phase | RED |

## Old Status

| Field | Value |
|-------|-------|
| Phase | GREEN |
`;
      // Should pick the first Phase field
      const phase = parsePhaseFromSession(multipleTablesSession);
      expect(phase).toBe('RED');
    });

    it('should handle timestamps at Date boundaries', () => {
      initializeTDDMetrics('19-6');

      // Timestamp 0 (epoch)
      recordPhaseTransition('RED', 0);

      const metrics = getTDDMetrics();
      expect(metrics!.phases.redStart).toBe(0);
    });

    it('should handle very long story IDs', () => {
      const longId = 'epic-100-story-999-subtask-abc-def-ghi';
      initializeTDDMetrics(longId);

      const metrics = getTDDMetrics();
      expect(metrics!.storyId).toBe(longId);
    });

  });

  // =============================================================================
  // Integration with Session File
  // =============================================================================

  describe('Integration with Session File', () => {

    beforeEach(() => {
      resetTDDMetrics();
    });

    it('should initialize and record phase from session content', () => {
      initializeTDDMetrics('19-6');
      const phase = parsePhaseFromSession(sessionWithRedPhase);

      if (phase) {
        recordPhaseTransition(phase);
      }

      const metrics = getTDDMetrics();
      expect(metrics!.phases.redStart).toBeDefined();
    });

    it('should track phase progression through session updates', () => {
      initializeTDDMetrics('19-6');

      // TEA writes tests (RED)
      const phase1 = parsePhaseFromSession(sessionWithRedPhase);
      if (phase1) recordPhaseTransition(phase1, 1000);

      // Dev implements (GREEN)
      const phase2 = parsePhaseFromSession(sessionWithGreenPhase);
      if (phase2) recordPhaseTransition(phase2, 11000);

      // Reviewer checks (REVIEW)
      const phase3 = parsePhaseFromSession(sessionWithReviewPhase);
      if (phase3) recordPhaseTransition(phase3, 31000);

      const metrics = getTDDMetrics();

      expect(metrics!.phases.redStart).toBe(1000);
      expect(metrics!.phases.greenStart).toBe(11000);
      expect(metrics!.phases.reviewStart).toBe(31000);
      expect(metrics!.redPhaseDurationMs).toBe(10000);
      expect(metrics!.greenPhaseDurationMs).toBe(20000);
    });

  });

});
