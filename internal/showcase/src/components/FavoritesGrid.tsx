/**
 * FavoritesGrid Component
 *
 * React island for displaying favorite characters.
 * Handles client-side filtering since localStorage is client-only.
 */

import { useState, useEffect } from 'react';
import CharacterCard from './CharacterCard';
import { getFavorites, buildCharacterId, clearFavorites } from '../lib/favorites-store';

interface Character {
  name: string;
  theme: string;
  role: string;
  ocean: { O: number; C: number; E: number; A: number; N: number };
}

interface FavoritesGridProps {
  allCharacters: Character[];
}

export default function FavoritesGrid({ allCharacters }: FavoritesGridProps) {
  const [favorites, setFavorites] = useState<Character[]>([]);
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const favoriteIds = getFavorites();
    const favoriteChars = allCharacters.filter(char =>
      favoriteIds.has(buildCharacterId(char.theme, char.role))
    );
    setFavorites(favoriteChars);
    setIsLoaded(true);
  }, [allCharacters]);

  // Re-check favorites when a character might be unfavorited
  const refreshFavorites = () => {
    const favoriteIds = getFavorites();
    const favoriteChars = allCharacters.filter(char =>
      favoriteIds.has(buildCharacterId(char.theme, char.role))
    );
    setFavorites(favoriteChars);
    // Also remove from selection if unfavorited
    setSelectedChars(prev => {
      const newSelected = new Set(prev);
      for (const id of prev) {
        if (!favoriteIds.has(id)) {
          newSelected.delete(id);
        }
      }
      return newSelected;
    });
  };

  const toggleSelection = (char: Character) => {
    const charId = buildCharacterId(char.theme, char.role);
    setSelectedChars(prev => {
      const newSet = new Set(prev);
      if (newSet.has(charId)) {
        newSet.delete(charId);
      } else if (newSet.size < 4) {
        newSet.add(charId);
      }
      return newSet;
    });
  };

  const handleCompare = () => {
    if (selectedChars.size >= 2) {
      const params = new URLSearchParams();
      selectedChars.forEach(id => params.append('char', id));
      window.location.href = `/compare?${params.toString()}`;
    }
  };

  const handleClearAll = () => {
    if (confirm('Remove all favorites?')) {
      clearFavorites();
      setFavorites([]);
      setSelectedChars(new Set());
    }
  };

  if (!isLoaded) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Loading favorites...
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-16 h-16 mx-auto text-[var(--text-muted)] mb-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No favorites yet</h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Click the heart icon on any character card to add them to your favorites.
        </p>
        <a
          href="/compare"
          className="inline-flex items-center px-4 py-2 bg-[var(--accent-cyan)] text-[var(--bg-dark)] rounded-lg hover:bg-[var(--accent-green)] transition-colors font-medium"
        >
          Browse Characters
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <p className="text-[var(--text-secondary)]">
          {favorites.length} favorite{favorites.length !== 1 ? 's' : ''}
          {selectedChars.size > 0 && (
            <span className="ml-2 text-[var(--accent-cyan)]">
              • {selectedChars.size} selected
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCompare}
            disabled={selectedChars.size < 2}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedChars.size >= 2
                ? 'bg-[var(--accent-cyan)] text-[var(--bg-dark)] hover:bg-[var(--accent-green)]'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            Compare Selected ({selectedChars.size}/4)
          </button>
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-[var(--accent-pink)] hover:text-[var(--accent-orange)] hover:bg-[var(--bg-card)] rounded-lg transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Selection hint */}
      {selectedChars.size === 0 && (
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Click on cards to select characters for comparison (2-4 characters)
        </p>
      )}

      {/* Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        onMouseUp={refreshFavorites}
      >
        {favorites.map(char => {
          const charId = buildCharacterId(char.theme, char.role);
          const isSelected = selectedChars.has(charId);
          return (
            <div
              key={charId}
              className={`rounded-lg ${
                isSelected ? 'ring-2 ring-[var(--accent-cyan)] ring-offset-2 ring-offset-[var(--bg-dark)]' : ''
              }`}
            >
              <CharacterCard
                character={char}
                onSelect={() => toggleSelection(char)}
                showFavorite={true}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
