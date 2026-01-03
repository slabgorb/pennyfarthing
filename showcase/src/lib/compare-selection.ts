/**
 * Compare Selection State Management
 *
 * Handles character selection logic for the comparison view.
 * Enforces 2-4 character limit for meaningful comparisons.
 */

export interface OceanScores {
  O: number;
  C: number;
  E: number;
  A: number;
  N: number;
}

export interface Character {
  theme: string;
  role: string;
  name: string;
  ocean: OceanScores;
}

export interface SelectionState {
  selectedIds: Set<string>;
  maxSelection: number;
  minSelection: number;
}

export interface SelectionOptions {
  maxSelection?: number;
  minSelection?: number;
}

/**
 * Generate a unique ID for a character (theme:role format).
 */
export function getCharacterId(character: Character): string {
  return `${character.theme}:${character.role}`;
}

/**
 * Create initial selection state with default or custom limits.
 */
export function createSelectionState(options?: SelectionOptions): SelectionState {
  return {
    selectedIds: new Set(),
    maxSelection: options?.maxSelection ?? 4,
    minSelection: options?.minSelection ?? 2,
  };
}

/**
 * Toggle a character's selection state.
 * Returns a new state (immutable update).
 */
export function toggleSelection(state: SelectionState, id: string): SelectionState {
  const newSelectedIds = new Set(state.selectedIds);

  if (newSelectedIds.has(id)) {
    // Deselect
    newSelectedIds.delete(id);
  } else {
    // Only add if under the max limit
    if (newSelectedIds.size < state.maxSelection) {
      newSelectedIds.add(id);
    }
  }

  return {
    ...state,
    selectedIds: newSelectedIds,
  };
}

/**
 * Check if a character can be selected/toggled.
 * Returns true if already selected (can deselect) or if under limit.
 */
export function canSelect(state: SelectionState, id: string): boolean {
  // Can always deselect an already selected character
  if (state.selectedIds.has(id)) {
    return true;
  }
  // Can select if under the limit
  return state.selectedIds.size < state.maxSelection;
}

/**
 * Get the selected characters from the full list.
 * Maintains the order from the characters array.
 */
export function getSelectedCharacters(
  state: SelectionState,
  characters: Character[]
): Character[] {
  return characters.filter((char) => state.selectedIds.has(getCharacterId(char)));
}

/**
 * Check if the current selection is valid for comparison.
 * Needs at least minSelection characters.
 */
export function isValidForComparison(state: SelectionState): boolean {
  return state.selectedIds.size >= state.minSelection;
}
