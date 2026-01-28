/**
 * Story MSSCI-12473: Persona section: Random catchphrase on activation
 *
 * These tests verify the acceptance criteria for random catchphrase selection.
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 *
 * Acceptance Criteria:
 * - AC1: Random catchphrase selected from array on agent switch
 * - AC2: Falls back to first catchphrase if array has one item
 * - AC3: Falls back to quote field if catchphrases missing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the function under test - will fail until implemented
import { selectCatchphrase } from '../src/pennyfarthing.js';

describe('Story MSSCI-12473: Random Catchphrase Selection', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1: Random catchphrase selected from array on agent switch', () => {

    it('should return a catchphrase from the catchphrases array', () => {
      const catchphrases = [
        'Inconceivable!',
        'You fell victim to one of the classic blunders!',
        'Never go against a Sicilian when deadlines are on the line!'
      ];

      const result = selectCatchphrase(catchphrases, 'fallback quote');

      expect(catchphrases).toContain(result);
    });

    it('should select randomly across multiple calls (statistical check)', () => {
      const catchphrases = [
        'Phrase A',
        'Phrase B',
        'Phrase C',
        'Phrase D',
        'Phrase E'
      ];

      // Run 100 times and count occurrences
      const occurrences: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        const result = selectCatchphrase(catchphrases, 'fallback');
        occurrences[result] = (occurrences[result] || 0) + 1;
      }

      // With 100 samples across 5 options, each should appear at least once
      // (probability of one never appearing with uniform distribution is negligible)
      const uniqueSelections = Object.keys(occurrences).length;
      expect(uniqueSelections).toBeGreaterThan(1);
    });

    it('should always return a valid string', () => {
      const catchphrases = ['Hello', 'World'];

      for (let i = 0; i < 10; i++) {
        const result = selectCatchphrase(catchphrases, 'fallback');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

  });

  describe('AC2: Falls back to first catchphrase if array has one item', () => {

    it('should return the single catchphrase when array has one item', () => {
      const catchphrases = ['Only one catchphrase'];

      const result = selectCatchphrase(catchphrases, 'fallback quote');

      expect(result).toBe('Only one catchphrase');
    });

    it('should consistently return the same catchphrase for single-item array', () => {
      const catchphrases = ['The lone phrase'];

      // Run multiple times - should always return the same
      for (let i = 0; i < 5; i++) {
        const result = selectCatchphrase(catchphrases, 'fallback');
        expect(result).toBe('The lone phrase');
      }
    });

  });

  describe('AC3: Falls back to quote field if catchphrases missing', () => {

    it('should return fallback quote when catchphrases is undefined', () => {
      const result = selectCatchphrase(undefined, 'This is the fallback quote');

      expect(result).toBe('This is the fallback quote');
    });

    it('should return fallback quote when catchphrases is null', () => {
      const result = selectCatchphrase(null as any, 'Fallback quote here');

      expect(result).toBe('Fallback quote here');
    });

    it('should return fallback quote when catchphrases is empty array', () => {
      const result = selectCatchphrase([], 'Empty array fallback');

      expect(result).toBe('Empty array fallback');
    });

    it('should return empty string when both catchphrases and fallback are missing', () => {
      const result = selectCatchphrase(undefined, undefined);

      expect(result).toBe('');
    });

    it('should return empty string when catchphrases empty and fallback is null', () => {
      const result = selectCatchphrase([], null as any);

      expect(result).toBe('');
    });

  });

  describe('Edge cases', () => {

    it('should handle catchphrases with special characters', () => {
      const catchphrases = [
        "Hello. My name is Inigo Montoya. You killed my father. Prepare to die.",
        "I'm not left-handed either!",
        '"As you wish..." — Westley'
      ];

      const result = selectCatchphrase(catchphrases, 'fallback');

      expect(catchphrases).toContain(result);
    });

    it('should handle catchphrases with unicode characters', () => {
      const catchphrases = [
        '¡Inconceivable!',
        'Très magnifique!',
        '日本語 catchphrase'
      ];

      const result = selectCatchphrase(catchphrases, 'fallback');

      expect(catchphrases).toContain(result);
    });

    it('should handle very long catchphrases', () => {
      const longPhrase = 'A'.repeat(1000);
      const catchphrases = [longPhrase];

      const result = selectCatchphrase(catchphrases, 'fallback');

      expect(result).toBe(longPhrase);
    });

    it('should handle catchphrases with leading/trailing whitespace', () => {
      const catchphrases = ['  Phrase with spaces  ', '\tTabbed phrase\t'];

      const result = selectCatchphrase(catchphrases, 'fallback');

      // Should return as-is (no trimming - that's the theme author's responsibility)
      expect(catchphrases).toContain(result);
    });

  });

});
