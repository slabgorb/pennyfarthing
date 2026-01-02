/**
 * ThemeFilter Component (React Island)
 *
 * Interactive filter for the theme gallery with search and source type filtering.
 * Uses client:load directive for hydration in Astro.
 */

import { useState, useEffect, useMemo } from 'react';

export interface FilterState {
  search: string;
  sourceType: string[];
  sortBy: 'name' | 'source';
}

interface Props {
  sourceTypes: string[];
  onFilter: (filter: FilterState) => void;
  initialFilter?: FilterState;
}

export default function ThemeFilter({ sourceTypes, onFilter, initialFilter }: Props) {
  const [search, setSearch] = useState(initialFilter?.search ?? '');
  const [selectedSources, setSelectedSources] = useState<string[]>(
    initialFilter?.sourceType ?? []
  );
  const [sortBy, setSortBy] = useState<'name' | 'source'>(initialFilter?.sortBy ?? 'name');

  // Emit filter changes
  useEffect(() => {
    onFilter({
      search,
      sourceType: selectedSources,
      sortBy,
    });
  }, [search, selectedSources, sortBy, onFilter]);

  // Toggle source type selection
  const toggleSourceType = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setSelectedSources([]);
    setSortBy('name');
  };

  const hasActiveFilters = search || selectedSources.length > 0;

  return (
    <div className="theme-filter bg-white rounded-lg shadow p-4 mb-6">
      {/* Search input */}
      <div className="mb-4">
        <label htmlFor="theme-search" className="block text-sm font-medium text-gray-700 mb-1">
          Search
        </label>
        <input
          id="theme-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search themes..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Source type filter */}
      <div className="mb-4">
        <span className="block text-sm font-medium text-gray-700 mb-2">Source Type</span>
        <div className="flex flex-wrap gap-2">
          {sourceTypes.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => toggleSourceType(source)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedSources.includes(source)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {source}
            </button>
          ))}
        </div>
      </div>

      {/* Sort options */}
      <div className="mb-4">
        <label htmlFor="sort-by" className="block text-sm font-medium text-gray-700 mb-1">
          Sort by
        </label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'source')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="name">Name</option>
          <option value="source">Source</option>
        </select>
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
