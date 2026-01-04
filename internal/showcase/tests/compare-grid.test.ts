/**
 * Story 13-9: CompareGrid Component Tests
 *
 * Tests for character selection grid with 2-4 limit enforcement.
 *
 * AC1: CompareGrid displays filtered characters as clickable cards in responsive grid
 * AC2: Users can select 2-4 characters; UI prevents selecting more than 4
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSelectionState,
  toggleSelection,
  canSelect,
  getSelectedCharacters,
  type SelectionState,
  type Character,
} from '../src/lib/compare-selection';

// Mock characters for testing
const mockCharacters: Character[] = [
  { theme: 'star-trek', role: 'sm', name: 'Picard', ocean: { O: 4, C: 5, E: 3, A: 4, N: 2 } },
  { theme: 'discworld', role: 'dev', name: 'Vimes', ocean: { O: 2, C: 4, E: 2, A: 3, N: 4 } },
  { theme: 'shakespeare', role: 'tea', name: 'Hamlet', ocean: { O: 5, C: 2, E: 3, A: 2, N: 5 } },
  { theme: 'jane-austen', role: 'reviewer', name: 'Darcy', ocean: { O: 3, C: 5, E: 1, A: 2, N: 3 } },
  { theme: 'literary-classics', role: 'architect', name: 'Holmes', ocean: { O: 5, C: 4, E: 1, A: 2, N: 3 } },
];

describe('Story 13-9: Compare Grid Selection', () => {
  describe('AC1: Grid Display', () => {
    describe('createSelectionState', () => {
      it('should create empty selection state', () => {
        const state = createSelectionState();

        expect(state.selectedIds).toEqual(new Set());
        expect(state.maxSelection).toBe(4);
        expect(state.minSelection).toBe(2);
      });

      it('should accept custom limits', () => {
        const state = createSelectionState({ maxSelection: 3, minSelection: 2 });

        expect(state.maxSelection).toBe(3);
      });
    });

    describe('getSelectedCharacters', () => {
      it('should return empty array when no selection', () => {
        const state = createSelectionState();
        const selected = getSelectedCharacters(state, mockCharacters);

        expect(selected).toEqual([]);
      });

      it('should return selected characters in order', () => {
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');
        state.selectedIds.add('discworld:dev');

        const selected = getSelectedCharacters(state, mockCharacters);

        expect(selected).toHaveLength(2);
        expect(selected[0].name).toBe('Picard');
        expect(selected[1].name).toBe('Vimes');
      });
    });
  });

  describe('AC2: Selection Limits (2-4 characters)', () => {
    describe('toggleSelection', () => {
      it('should add character to selection when not selected', () => {
        const state = createSelectionState();
        const newState = toggleSelection(state, 'star-trek:sm');

        expect(newState.selectedIds.has('star-trek:sm')).toBe(true);
      });

      it('should remove character from selection when already selected', () => {
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');

        const newState = toggleSelection(state, 'star-trek:sm');

        expect(newState.selectedIds.has('star-trek:sm')).toBe(false);
      });

      it('should allow selecting up to 4 characters', () => {
        let state = createSelectionState();

        state = toggleSelection(state, 'star-trek:sm');
        state = toggleSelection(state, 'discworld:dev');
        state = toggleSelection(state, 'shakespeare:tea');
        state = toggleSelection(state, 'jane-austen:reviewer');

        expect(state.selectedIds.size).toBe(4);
      });

      it('should prevent selecting more than 4 characters', () => {
        let state = createSelectionState();

        // Select 4 characters
        state = toggleSelection(state, 'star-trek:sm');
        state = toggleSelection(state, 'discworld:dev');
        state = toggleSelection(state, 'shakespeare:tea');
        state = toggleSelection(state, 'jane-austen:reviewer');

        // Try to select 5th - should not be added
        state = toggleSelection(state, 'literary-classics:architect');

        expect(state.selectedIds.size).toBe(4);
        expect(state.selectedIds.has('literary-classics:architect')).toBe(false);
      });

      it('should allow deselecting when at max', () => {
        let state = createSelectionState();

        state = toggleSelection(state, 'star-trek:sm');
        state = toggleSelection(state, 'discworld:dev');
        state = toggleSelection(state, 'shakespeare:tea');
        state = toggleSelection(state, 'jane-austen:reviewer');

        // Deselect one
        state = toggleSelection(state, 'star-trek:sm');

        expect(state.selectedIds.size).toBe(3);
        expect(state.selectedIds.has('star-trek:sm')).toBe(false);
      });
    });

    describe('canSelect', () => {
      it('should return true when under max limit', () => {
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');

        expect(canSelect(state, 'discworld:dev')).toBe(true);
      });

      it('should return false when at max limit for new character', () => {
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');
        state.selectedIds.add('discworld:dev');
        state.selectedIds.add('shakespeare:tea');
        state.selectedIds.add('jane-austen:reviewer');

        expect(canSelect(state, 'literary-classics:architect')).toBe(false);
      });

      it('should return true for already selected character (can deselect)', () => {
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');
        state.selectedIds.add('discworld:dev');
        state.selectedIds.add('shakespeare:tea');
        state.selectedIds.add('jane-austen:reviewer');

        // Can still toggle an already selected character
        expect(canSelect(state, 'star-trek:sm')).toBe(true);
      });
    });

    describe('isValidForComparison', () => {
      it('should return false when fewer than 2 selected', async () => {
        const { isValidForComparison } = await import('../src/lib/compare-selection');
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');

        expect(isValidForComparison(state)).toBe(false);
      });

      it('should return true when 2 or more selected', async () => {
        const { isValidForComparison } = await import('../src/lib/compare-selection');
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');
        state.selectedIds.add('discworld:dev');

        expect(isValidForComparison(state)).toBe(true);
      });

      it('should return true when exactly 4 selected', async () => {
        const { isValidForComparison } = await import('../src/lib/compare-selection');
        const state = createSelectionState();
        state.selectedIds.add('star-trek:sm');
        state.selectedIds.add('discworld:dev');
        state.selectedIds.add('shakespeare:tea');
        state.selectedIds.add('jane-austen:reviewer');

        expect(isValidForComparison(state)).toBe(true);
      });
    });
  });
});
