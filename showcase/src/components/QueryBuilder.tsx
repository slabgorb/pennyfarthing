/**
 * QueryBuilder Component (React Island)
 *
 * Interactive query builder for the /compare page with OCEAN filters,
 * role/theme filters, expression input, and sorting options.
 * Uses client:load directive for hydration in Astro.
 */

import { useState, useEffect, useMemo } from 'react';

// OCEAN dimension labels
const OCEAN_DIMENSIONS = [
  { key: 'O', label: 'Openness', description: 'Creativity and curiosity' },
  { key: 'C', label: 'Conscientiousness', description: 'Organization and dependability' },
  { key: 'E', label: 'Extraversion', description: 'Sociability and energy' },
  { key: 'A', label: 'Agreeableness', description: 'Cooperation and trust' },
  { key: 'N', label: 'Neuroticism', description: 'Emotional sensitivity' },
] as const;

// Available roles
const ROLES = [
  'sm', 'tea', 'dev', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'
] as const;

// Sort options
const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'O', label: 'Openness' },
  { value: 'C', label: 'Conscientiousness' },
  { value: 'E', label: 'Extraversion' },
  { value: 'A', label: 'Agreeableness' },
  { value: 'N', label: 'Neuroticism' },
] as const;

export interface OceanFilters {
  O: { min: number; max: number } | null;
  C: { min: number; max: number } | null;
  E: { min: number; max: number } | null;
  A: { min: number; max: number } | null;
  N: { min: number; max: number } | null;
}

export interface QueryState {
  ocean: OceanFilters;
  roles: string[];
  themes: string[];
  themeSearch: string;
  expression: string;
  sortBy: string;
}

export interface Character {
  theme: string;
  role: string;
  name: string;
  ocean: { O: number; C: number; E: number; A: number; N: number };
}

interface Props {
  themes: string[];
  characters: Character[];
  onResults?: (results: Character[]) => void;
}

export default function QueryBuilder({ themes, characters, onResults = () => {} }: Props) {
  // OCEAN range filters (null = no filter)
  const [oceanFilters, setOceanFilters] = useState<OceanFilters>({
    O: null, C: null, E: null, A: null, N: null,
  });

  // Selected roles (empty = all)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  // Selected themes (empty = all)
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  // Theme search filter
  const [themeSearch, setThemeSearch] = useState('');

  // Expression input for advanced OCEAN queries
  const [expression, setExpression] = useState('');

  // Sort option
  const [sortBy, setSortBy] = useState('name');

  // Filter themes based on search
  const filteredThemes = useMemo(() => {
    if (!themeSearch) return themes;
    return themes.filter(t =>
      t.toLowerCase().includes(themeSearch.toLowerCase())
    );
  }, [themes, themeSearch]);

  // Parse expression and apply filters
  const parseExpression = (expr: string): ((char: Character) => boolean) | null => {
    if (!expr.trim()) return null;

    // Simple parser for expressions like "O>=4 AND C=3"
    const conditions = expr.split(/\s+AND\s+/i);

    return (char: Character) => {
      return conditions.every(condition => {
        const match = condition.match(/^([OCEAN])\s*(>=|<=|>|<|=)\s*(\d)$/i);
        if (!match) return true; // Invalid condition, skip

        const [, dim, op, valStr] = match;
        const dimension = dim.toUpperCase() as keyof typeof char.ocean;
        const value = parseInt(valStr, 10);
        const charValue = char.ocean[dimension];

        switch (op) {
          case '>=': return charValue >= value;
          case '<=': return charValue <= value;
          case '>': return charValue > value;
          case '<': return charValue < value;
          case '=': return charValue === value;
          default: return true;
        }
      });
    };
  };

  // Apply all filters and update results
  useEffect(() => {
    let results = [...characters];

    // Apply OCEAN range filters (AND logic)
    Object.entries(oceanFilters).forEach(([dim, range]) => {
      if (range) {
        results = results.filter(char => {
          const value = char.ocean[dim as keyof typeof char.ocean];
          return value >= range.min && value <= range.max;
        });
      }
    });

    // Apply role filter (OR within roles, AND with other filters)
    if (selectedRoles.length > 0) {
      results = results.filter(char => selectedRoles.includes(char.role));
    }

    // Apply theme filter (OR within themes, AND with other filters)
    if (selectedThemes.length > 0) {
      results = results.filter(char => selectedThemes.includes(char.theme));
    }

    // Apply expression filter
    const exprFilter = parseExpression(expression);
    if (exprFilter) {
      results = results.filter(exprFilter);
    }

    // Apply sorting
    results.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      const dim = sortBy as keyof typeof a.ocean;
      return b.ocean[dim] - a.ocean[dim]; // Descending for OCEAN scores
    });

    onResults(results);
  }, [oceanFilters, selectedRoles, selectedThemes, expression, sortBy, characters, onResults]);

  // Toggle role selection
  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Toggle theme selection
  const toggleTheme = (theme: string) => {
    setSelectedThemes(prev =>
      prev.includes(theme) ? prev.filter(t => t !== theme) : [...prev, theme]
    );
  };

  // Set OCEAN dimension filter
  const setOceanFilter = (dim: keyof OceanFilters, value: number | null) => {
    setOceanFilters(prev => ({
      ...prev,
      [dim]: value !== null ? { min: value, max: 5 } : null,
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setOceanFilters({ O: null, C: null, E: null, A: null, N: null });
    setSelectedRoles([]);
    setSelectedThemes([]);
    setThemeSearch('');
    setExpression('');
    setSortBy('name');
  };

  const hasActiveFilters =
    Object.values(oceanFilters).some(v => v !== null) ||
    selectedRoles.length > 0 ||
    selectedThemes.length > 0 ||
    expression.trim() !== '';

  return (
    <div className="query-builder bg-white rounded-lg shadow p-6">
      {/* OCEAN Dimension Filters */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">OCEAN Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {OCEAN_DIMENSIONS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {key}: {label}
              </label>
              <select
                value={oceanFilters[key as keyof OceanFilters]?.min ?? ''}
                onChange={(e) => setOceanFilter(
                  key as keyof OceanFilters,
                  e.target.value ? parseInt(e.target.value, 10) : null
                )}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
                <option value="5">5</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Expression Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          OCEAN Expression (Advanced Query)
        </label>
        <input
          type="text"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="e.g., O>=4 AND C=3 AND E<=2"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          Use O, C, E, A, N with operators: =, &gt;=, &lt;=, &gt;, &lt;. Combine with AND.
        </p>
      </div>

      {/* Role Filter */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Roles</h3>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <label key={role} className="inline-flex items-center">
              <input
                type="checkbox"
                checked={selectedRoles.includes(role)}
                onChange={() => toggleRole(role)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="ml-2 text-sm text-gray-700">{role}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Theme Filter */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Themes</h3>
        <input
          type="text"
          value={themeSearch}
          onChange={(e) => setThemeSearch(e.target.value)}
          placeholder="Search themes..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
        />
        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
          <div className="flex flex-wrap gap-2">
            {filteredThemes.slice(0, 20).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => toggleTheme(theme)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedThemes.includes(theme)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {theme}
              </button>
            ))}
            {filteredThemes.length > 20 && (
              <span className="text-sm text-gray-500 py-1">
                +{filteredThemes.length - 20} more
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sort Options */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Sort by
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
