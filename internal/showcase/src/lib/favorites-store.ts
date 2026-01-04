/**
 * Favorites Store - localStorage persistence for favorite characters
 *
 * Follows the same SSR-safe patterns as url-state.ts.
 * Character IDs use format: "{theme}:{role}" (e.g., "star-trek:sm")
 */

const STORAGE_KEY = 'pennyfarthing-favorites';

/**
 * Get all favorite character IDs from localStorage.
 * Returns empty Set if not in browser or no favorites stored.
 */
export function getFavorites(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch {
    // Ignore parse errors, return empty set
  }

  return new Set();
}

/**
 * Check if a character is favorited.
 */
export function isFavorite(characterId: string): boolean {
  return getFavorites().has(characterId);
}

/**
 * Toggle favorite status for a character.
 * Returns the new favorited state (true = now favorited, false = now unfavorited).
 */
export function toggleFavorite(characterId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const favorites = getFavorites();
  const wasFavorited = favorites.has(characterId);

  if (wasFavorited) {
    favorites.delete(characterId);
  } else {
    favorites.add(characterId);
  }

  saveFavorites(favorites);
  return !wasFavorited;
}

/**
 * Add a character to favorites.
 */
export function addFavorite(characterId: string): void {
  if (typeof window === 'undefined') return;

  const favorites = getFavorites();
  favorites.add(characterId);
  saveFavorites(favorites);
}

/**
 * Remove a character from favorites.
 */
export function removeFavorite(characterId: string): void {
  if (typeof window === 'undefined') return;

  const favorites = getFavorites();
  favorites.delete(characterId);
  saveFavorites(favorites);
}

/**
 * Clear all favorites.
 */
export function clearFavorites(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get the count of favorites.
 */
export function getFavoritesCount(): number {
  return getFavorites().size;
}

/**
 * Save favorites to localStorage.
 */
function saveFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {
    // Ignore storage errors (quota exceeded, private browsing, etc.)
  }
}

/**
 * Build a character ID from theme and role.
 */
export function buildCharacterId(theme: string, role: string): string {
  return `${theme}:${role}`;
}

/**
 * Parse a character ID into theme and role.
 */
export function parseCharacterId(characterId: string): { theme: string; role: string } | null {
  const parts = characterId.split(':');
  if (parts.length === 2) {
    return { theme: parts[0], role: parts[1] };
  }
  return null;
}
