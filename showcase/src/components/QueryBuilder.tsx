/**
 * QueryBuilder Component (React Island)
 *
 * Interactive query builder for the /compare page with OCEAN filters,
 * role/theme filters, expression input, and sorting options.
 * Redesigned with stacked layout per UX spec.
 */

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import CharacterCard from './CharacterCard';
import {
  decodeUrlToState,
  updateBrowserUrl,
  buildShareableUrl,
  copyToClipboard,
  type UrlState,
} from '../lib/url-state';
import { getOverlayColors, oceanToPolygonPoints } from '../lib/spider-utils';

// Overlay Spider Chart for comparing multiple characters
function OverlaySpiderChart({ characters, size = 250 }: { characters: Character[]; size?: number }) {
  const colors = getOverlayColors();
  const center = size / 2;
  const maxRadius = (size / 2) * 0.8;
  const dimensions = ['O', 'C', 'E', 'A', 'N'];

  // Generate grid pentagons
  const gridLevels = [1, 2, 3, 4, 5].map(level => {
    const radius = (level / 5) * maxRadius;
    return dimensions.map((_, i) => {
      const angle = (i * 72 - 90) * (Math.PI / 180);
      return `${(center + radius * Math.cos(angle)).toFixed(1)},${(center + radius * Math.sin(angle)).toFixed(1)}`;
    }).join(' ');
  });

  // Generate axis lines
  const axisLines = dimensions.map((_, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return { x2: center + maxRadius * Math.cos(angle), y2: center + maxRadius * Math.sin(angle) };
  });

  // Generate label positions
  const labelPositions = dimensions.map((dim, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    const labelRadius = (size / 2) * 0.95;
    return { x: center + labelRadius * Math.cos(angle), y: center + labelRadius * Math.sin(angle), label: dim };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid pentagons */}
        {gridLevels.map((points, i) => (
          <polygon key={i} points={points} fill="none" stroke="#57534e" strokeWidth="0.5" opacity={0.4 + i * 0.1} />
        ))}
        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line key={i} x1={center} y1={center} x2={line.x2} y2={line.y2} stroke="#57534e" strokeWidth="0.5" />
        ))}
        {/* Character polygons */}
        {characters.map((char, idx) => (
          <polygon
            key={`${char.theme}-${char.role}`}
            points={oceanToPolygonPoints(char.ocean, size)}
            fill={colors[idx]}
            fillOpacity="0.2"
            stroke={colors[idx]}
            strokeWidth="2.5"
          />
        ))}
        {/* Labels */}
        {labelPositions.map((pos) => (
          <text key={pos.label} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" className="text-sm font-medium" fill="#fef3c7">
            {pos.label}
          </text>
        ))}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {characters.map((char, idx) => (
          <div key={`${char.theme}-${char.role}`} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: colors[idx] }} />
            <span className="text-sm text-stone-200">{char.name}</span>
            <span className="text-xs text-stone-400">({char.role})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Small portrait for chips
function ChipPortrait({ themeId, role, emoji, name }: { themeId?: string; role: string; emoji?: string; name: string }) {
  const [imgError, setImgError] = useState(false);
  const spritePath = themeId ? `/sprites/${themeId}/${role}.png` : null;

  if (!spritePath || imgError) {
    return (
      <div className="w-6 h-6 flex items-center justify-center text-sm bg-stone-600 rounded">
        {emoji || '👤'}
      </div>
    );
  }

  return (
    <img
      src={spritePath}
      alt={name}
      className="w-6 h-6 object-cover rounded"
      onError={() => setImgError(true)}
    />
  );
}

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
  themeId?: string;
  role: string;
  name: string;
  ocean: { O: number; C: number; E: number; A: number; N: number };
  style?: string;
  expertise?: string;
  trait?: string;
  roleSummary?: string;
  emoji?: string;
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

  // Selected characters for comparison (max 4)
  const [selectedChars, setSelectedChars] = useState<Character[]>([]);

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
  // Value format: "" (any), "=1" (exact), ">=1" (at least), "<=5" (at most)
  const setOceanFilter = (dim: keyof OceanFilters, value: string) => {
    if (!value) {
      setOceanFilters(prev => ({ ...prev, [dim]: null }));
      return;
    }

    const isExact = value.startsWith('=');
    const isAtMost = value.startsWith('<=');
    const num = parseInt(value.replace(/^[<>=]+/, ''), 10);

    let range: { min: number; max: number };
    if (isExact) {
      range = { min: num, max: num };
    } else if (isAtMost) {
      range = { min: 1, max: num };
    } else {
      range = { min: num, max: 5 };
    }

    setOceanFilters(prev => ({
      ...prev,
      [dim]: range,
    }));
  };

  // Get select value from filter state
  const getOceanSelectValue = (dim: keyof OceanFilters): string => {
    const filter = oceanFilters[dim];
    if (!filter) return '';
    if (filter.min === filter.max) return `=${filter.min}`;
    if (filter.min === 1) return `<=${filter.max}`;
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

  // Toggle character selection for comparison
  const toggleCharSelection = (char: Character) => {
    const charKey = `${char.theme}-${char.role}`;
    const isSelected = selectedChars.some(c => `${c.theme}-${c.role}` === charKey);

    if (isSelected) {
      setSelectedChars(prev => prev.filter(c => `${c.theme}-${c.role}` !== charKey));
    } else if (selectedChars.length < 4) {
      setSelectedChars(prev => [...prev, char]);
    }
  };

  // Check if a character is selected
  const isCharSelected = (char: Character) => {
    return selectedChars.some(c => `${c.theme}-${c.role}` === `${char.theme}-${char.role}`);
  };

  // Clear comparison selection
  const clearSelection = () => setSelectedChars([]);

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
                    <option value=">=2">2+</option>
                    <option value=">=3">3+</option>
                    <option value=">=4">4+</option>
                    <option value=">=5">5</option>
                  </optgroup>
                  <optgroup label="At most">
                    <option value="<=2">≤2</option>
                    <option value="<=3">≤3</option>
                    <option value="<=4">≤4</option>
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

      {/* Comparison Panel */}
      {selectedChars.length > 0 && (
        <div className="bg-stone-800 border border-amber-600 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-amber-100">
              Comparing {selectedChars.length} Character{selectedChars.length > 1 ? 's' : ''}
            </h3>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-stone-400 hover:text-amber-500"
            >
              Clear selection
            </button>
          </div>

          {/* Selected character chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedChars.map((char) => (
              <div
                key={`${char.theme}-${char.role}`}
                className="flex items-center gap-2 bg-stone-700 rounded-lg px-2 py-1.5"
              >
                <ChipPortrait themeId={char.themeId} role={char.role} emoji={char.emoji} name={char.name} />
                <span className="text-amber-100 font-medium text-sm">{char.name}</span>
                <span className="text-stone-400 text-xs">{char.role}</span>
                <button
                  type="button"
                  onClick={() => toggleCharSelection(char)}
                  className="text-stone-400 hover:text-red-400 ml-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Overlay Spider Chart - show when 2+ selected */}
          {selectedChars.length >= 2 ? (
            <div className="space-y-6">
              <OverlaySpiderChart characters={selectedChars} size={280} />

              {/* Personality Traits Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-700">
                      <th className="text-left py-2 px-3 text-stone-400 font-medium">Character</th>
                      <th className="text-left py-2 px-3 text-stone-400 font-medium">Style</th>
                      <th className="text-left py-2 px-3 text-stone-400 font-medium">Trait</th>
                      <th className="text-left py-2 px-3 text-stone-400 font-medium">Expertise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedChars.map((char, idx) => (
                      <tr key={`${char.theme}-${char.role}`} className="border-b border-stone-700/50">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: getOverlayColors()[idx] }} />
                            <span className="text-amber-100 font-medium">{char.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-stone-300">{char.style || '—'}</td>
                        <td className="py-2 px-3 text-stone-300">{char.trait || '—'}</td>
                        <td className="py-2 px-3 text-stone-300">{char.expertise || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-stone-400 text-sm text-center py-8">
              Select one more character to see the overlay comparison
            </p>
          )}
        </div>
      )}

      {/* Results Count and Share */}
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-stone-300">
          {selectedChars.length === 0
            ? `Showing ${results.length} of ${characters.length} characters — click to select for comparison`
            : `Showing ${results.length} of ${characters.length} characters`
          }
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
            onSelect={() => toggleCharSelection(char)}
            isSelected={isCharSelected(char)}
          />
        ))}
      </div>

      {results.length > 100 && (
        <p className="text-center text-sm text-stone-400 py-4">
          Showing first 100 results. Use filters to narrow down.
        </p>
      )}

      {results.length === 0 && (
        <div className="text-center py-12">
          <p className="text-stone-400">No characters match your filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-sm text-amber-500 hover:text-amber-400"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
