/**
 * QueryBuilder Component (React Island)
 *
 * Interactive query builder for the /compare page with OCEAN filters,
 * role/theme filters, expression input, and sorting options.
 * Redesigned with stacked layout per UX spec.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import CharacterCard from './CharacterCard';
import {
  decodeUrlToState,
  updateBrowserUrl,
  buildShareableUrl,
  copyToClipboard,
  type UrlState,
} from '../lib/url-state';

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

export interface Character {
  theme: string;
  role: string;
  name: string;
  ocean: { O: number; C: number; E: number; A: number; N: number };
}

interface Props {
  themes: string[];
  characters: Character[];
}

export default function QueryBuilder({ themes, characters }: Props) {
  // Track if we've initialized from URL (prevents overwriting URL on first render)
  const initializedFromUrl = useRef(false);

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

  // Expression parse error (null = valid or empty)
  const [expressionError, setExpressionError] = useState<string | null>(null);

  // Sort option
  const [sortBy, setSortBy] = useState('name');

  // Advanced filters section collapsed state
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Filtered results
  const [results, setResults] = useState<Character[]>(characters);

  // Share button feedback state
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  // Initialize state from URL on mount
  useEffect(() => {
    const urlState = decodeUrlToState(new URLSearchParams(window.location.search));

    // Apply URL state to component state
    setOceanFilters(urlState.oceanFilters);
    setSelectedRoles(urlState.selectedRoles);
    setSelectedThemes(urlState.selectedThemes);
    setExpression(urlState.expression);
    setSortBy(urlState.sortBy);

    // Open advanced section if any advanced filters are active
    if (urlState.selectedRoles.length > 0 ||
        urlState.selectedThemes.length > 0 ||
        urlState.expression.trim() !== '') {
      setAdvancedOpen(true);
    }

    initializedFromUrl.current = true;
  }, []);

  // Build current state object for URL updates
  const getCurrentState = useCallback((): Partial<UrlState> => ({
    oceanFilters,
    selectedRoles,
    selectedThemes,
    expression,
    sortBy,
    selectedChars: [], // Character selection handled separately if needed
  }), [oceanFilters, selectedRoles, selectedThemes, expression, sortBy]);

  // Update URL when filter state changes (after initial load)
  useEffect(() => {
    if (!initializedFromUrl.current) return;
    updateBrowserUrl(getCurrentState());
  }, [getCurrentState]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlState = decodeUrlToState(new URLSearchParams(window.location.search));
      setOceanFilters(urlState.oceanFilters);
      setSelectedRoles(urlState.selectedRoles);
      setSelectedThemes(urlState.selectedThemes);
      setExpression(urlState.expression);
      setSortBy(urlState.sortBy);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle share button click
  const handleShare = async () => {
    const url = buildShareableUrl(getCurrentState());
    const success = await copyToClipboard(url);
    setShareStatus(success ? 'copied' : 'error');

    // Reset status after feedback duration
    setTimeout(() => setShareStatus('idle'), 2000);
  };

  // Filter themes based on search
  const filteredThemes = useMemo(() => {
    if (!themeSearch) return themes;
    return themes.filter(t =>
      t.toLowerCase().includes(themeSearch.toLowerCase())
    );
  }, [themes, themeSearch]);

  // Valid OCEAN dimensions and operators
  const VALID_DIMS = ['O', 'C', 'E', 'A', 'N'];

  // Parse and validate a single OCEAN condition
  const parseCondition = (condition: string): { error: string } | { dim: string; op: string; val: number } => {
    const trimmed = condition.trim();
    if (!trimmed) return { error: 'Empty condition' };

    const match = trimmed.match(/^([A-Za-z])\s*(>=|<=|>|<|=)\s*(.+)$/);

    if (!match) {
      const dimMatch = trimmed.match(/^([A-Za-z])/);
      if (dimMatch) {
        const dim = dimMatch[1].toUpperCase();
        if (!VALID_DIMS.includes(dim)) {
          return { error: `Invalid dimension: ${dim}. Use O, C, E, A, or N` };
        }
        return { error: `Invalid format: "${trimmed}". Use format like "O>=4"` };
      }
      return { error: `Cannot parse: "${trimmed}". Use format like "O>=4"` };
    }

    const [, dimRaw, op, valRaw] = match;
    const dim = dimRaw.toUpperCase();

    if (!VALID_DIMS.includes(dim)) {
      return { error: `Invalid dimension: ${dim}. Use O, C, E, A, or N` };
    }

    const val = parseInt(valRaw, 10);
    if (isNaN(val)) {
      return { error: `Invalid value: "${valRaw}". Must be a number 1-5` };
    }
    if (val < 1 || val > 5) {
      return { error: `Value out of range: ${val}. OCEAN scores are 1-5` };
    }

    return { dim, op, val };
  };

  // Parse expression and return filter + error
  const parseExpression = (expr: string): { filter: ((char: Character) => boolean) | null; error: string | null } => {
    if (!expr.trim()) return { filter: null, error: null };

    const conditions = expr.split(/\s+AND\s+/i);
    const parsed: Array<{ dim: string; op: string; val: number }> = [];

    for (const condition of conditions) {
      const result = parseCondition(condition);
      if ('error' in result) {
        return { filter: null, error: result.error };
      }
      parsed.push(result);
    }

    const filter = (char: Character) => {
      return parsed.every(({ dim, op, val }) => {
        const charValue = char.ocean[dim as keyof typeof char.ocean];
        switch (op) {
          case '>=': return charValue >= val;
          case '<=': return charValue <= val;
          case '>': return charValue > val;
          case '<': return charValue < val;
          case '=': return charValue === val;
          default: return true;
        }
      });
    };

    return { filter, error: null };
  };

  // Apply all filters and update results
  useEffect(() => {
    let filtered = [...characters];

    // Apply OCEAN range filters
    Object.entries(oceanFilters).forEach(([dim, range]) => {
      if (range) {
        filtered = filtered.filter(char => {
          const value = char.ocean[dim as keyof typeof char.ocean];
          return value >= range.min && value <= range.max;
        });
      }
    });

    // Apply role filter
    if (selectedRoles.length > 0) {
      filtered = filtered.filter(char => selectedRoles.includes(char.role));
    }

    // Apply theme filter
    if (selectedThemes.length > 0) {
      filtered = filtered.filter(char => selectedThemes.includes(char.theme));
    }

    // Apply expression filter
    const { filter: exprFilter, error } = parseExpression(expression);
    setExpressionError(error);
    if (exprFilter) {
      filtered = filtered.filter(exprFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      const dim = sortBy as keyof typeof a.ocean;
      return b.ocean[dim] - a.ocean[dim];
    });

    setResults(filtered);
  }, [oceanFilters, selectedRoles, selectedThemes, expression, sortBy, characters]);

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
  // Value format: "" (any), "=1" (exact), ">=1" (minimum)
  const setOceanFilter = (dim: keyof OceanFilters, value: string) => {
    if (!value) {
      setOceanFilters(prev => ({ ...prev, [dim]: null }));
      return;
    }

    const isExact = value.startsWith('=');
    const num = parseInt(value.replace(/^[>=]+/, ''), 10);

    setOceanFilters(prev => ({
      ...prev,
      [dim]: isExact ? { min: num, max: num } : { min: num, max: 5 },
    }));
  };

  // Get select value from filter state
  const getOceanSelectValue = (dim: keyof OceanFilters): string => {
    const filter = oceanFilters[dim];
    if (!filter) return '';
    if (filter.min === filter.max) return `=${filter.min}`;
    return `>=${filter.min}`;
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

  const hasOceanFilters = Object.values(oceanFilters).some(v => v !== null);
  const hasAdvancedFilters = selectedRoles.length > 0 || selectedThemes.length > 0 || expression.trim() !== '';
  const hasActiveFilters = hasOceanFilters || hasAdvancedFilters;
  const advancedFilterCount = selectedRoles.length + selectedThemes.length + (expression.trim() ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Primary Filter Bar */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* OCEAN Filters - Compact */}
          <div className="flex items-center gap-2 border-r border-[var(--border-color)] pr-4">
            {OCEAN_DIMENSIONS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center gap-1">
                <span
                  className="font-bold text-sm text-[var(--text-secondary)] w-4"
                  title={`${label} - ${description}`}
                >
                  {key}
                </span>
                <select
                  value={getOceanSelectValue(key as keyof OceanFilters)}
                  onChange={(e) => setOceanFilter(key as keyof OceanFilters, e.target.value)}
                  aria-label={`Filter by ${label}`}
                  className="text-sm py-1 px-2 border border-[var(--border-color)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] min-w-[70px] bg-[var(--bg-input)] text-[var(--text-primary)]"
                >
                  <option value="">Any</option>
                  <optgroup label="Exactly">
                    <option value="=1">=1</option>
                    <option value="=2">=2</option>
                    <option value="=3">=3</option>
                    <option value="=4">=4</option>
                    <option value="=5">=5</option>
                  </optgroup>
                  <optgroup label="At least">
                    <option value=">=1">1+</option>
                    <option value=">=2">2+</option>
                    <option value=">=3">3+</option>
                    <option value=">=4">4+</option>
                  </optgroup>
                </select>
              </div>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm py-1 px-2 border border-[var(--border-color)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] bg-[var(--bg-input)] text-[var(--text-primary)]"
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
              className="text-sm text-[var(--accent-cyan)] hover:text-[var(--accent-green)]"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters (Collapsible) */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--bg-card-hover)]"
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-sm font-medium text-[var(--text-secondary)]">Advanced Filters</span>
            {hasAdvancedFilters && (
              <span className="bg-[var(--accent-cyan)] text-[var(--bg-dark)] px-2 py-0.5 rounded-full text-xs font-medium">
                {advancedFilterCount}
              </span>
            )}
          </div>
        </button>

        {advancedOpen && (
          <div className="border-t border-[var(--border-color)] p-4 space-y-4">
            {/* Expression Input */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                OCEAN Expression
              </label>
              <input
                type="text"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="e.g., O>=4 AND C=3 AND E<=2"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)] ${
                  expressionError
                    ? 'border-[var(--accent-pink)] focus:ring-[var(--accent-pink)]'
                    : 'border-[var(--border-color)] focus:ring-[var(--accent-cyan)]'
                }`}
              />
              {expressionError ? (
                <p className="text-xs text-[var(--accent-pink)] mt-1">{expressionError}</p>
              ) : (
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Use O, C, E, A, N with operators: =, &gt;=, &lt;=, &gt;, &lt;. Combine with AND.
                </p>
              )}
            </div>

            {/* Role Filter */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Roles</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <label key={role} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="rounded border-[var(--border-color)] text-[var(--accent-cyan)] focus:ring-[var(--accent-cyan)] bg-[var(--bg-input)]"
                    />
                    <span className="ml-1.5 text-sm text-[var(--text-secondary)]">{role}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Theme Filter */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Themes</label>
              <input
                type="text"
                value={themeSearch}
                onChange={(e) => setThemeSearch(e.target.value)}
                placeholder="Search themes..."
                className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] mb-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)]"
              />
              <div className="max-h-32 overflow-y-auto border border-[var(--border-color)] rounded-md p-2 bg-[var(--bg-darker)]">
                <div className="flex flex-wrap gap-1.5">
                  {filteredThemes.slice(0, 30).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => toggleTheme(theme)}
                      className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                        selectedThemes.includes(theme)
                          ? 'bg-[var(--accent-cyan)] text-[var(--bg-dark)]'
                          : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                  {filteredThemes.length > 30 && (
                    <span className="text-xs text-[var(--text-muted)] py-0.5">
                      +{filteredThemes.length - 30} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Count and Share */}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-[var(--text-secondary)]">
          Showing {results.length} of {characters.length} characters
        </span>
        <button
          type="button"
          onClick={handleShare}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
            shareStatus === 'copied'
              ? 'bg-[var(--accent-green)] text-[var(--bg-dark)]'
              : shareStatus === 'error'
              ? 'bg-[var(--accent-pink)] text-[var(--text-primary)]'
              : 'bg-[var(--bg-card)] text-[var(--accent-cyan)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          {shareStatus === 'copied' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : shareStatus === 'error' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Failed
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </>
          )}
        </button>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {results.slice(0, 100).map((char, idx) => (
          <CharacterCard
            key={`${char.theme}-${char.role}-${idx}`}
            character={char}
          />
        ))}
      </div>

      {results.length > 100 && (
        <p className="text-center text-sm text-gray-500 py-4">
          Showing first 100 results. Use filters to narrow down.
        </p>
      )}

      {results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No characters match your filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
