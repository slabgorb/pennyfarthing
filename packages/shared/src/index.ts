/**
 * @pennyfarthing/shared
 * Shared utilities for Pennyfarthing including portrait path resolution
 */

export {
  resolvePennyfarthingDist,
  resolvePortraitPath,
  getPortraitPaths,
  type PortraitPaths,
} from './portrait-resolver.js';

export {
  loadTheme,
  listThemes,
  getAgentPersona,
  resolveThemePath,
  discoverAllThemeDirs,
  discoverThemePackages,
  loadAllThemeMetadata,
  deriveCategory,
  CATEGORY_MAP,
  type Theme,
  type ThemeAgent,
  type ThemePackageInfo,
  type ThemeMetadata,
} from './theme-loader.js';

export {
  searchSkills,
  type SearchOptions,
  type SkillResult,
} from './skill-search.js';

export {
  suggestSkills,
  suggestFromSession,
  suggestFromKeywords,
  type SuggestOptions,
  type SkillSuggestion,
  type SessionContext,
} from './skill-suggest.js';

export {
  generateSkillDocs,
  type GeneratorOptions,
  type GeneratorResult,
} from './generate-skill-docs.js';

// Marker module - Reflector protocol marker detection
// @see docs/adr/0011-reflector-marker-consolidation.md
export {
  detectMarkers,
  stripMarkers,
  stripCodeBlocks,
  MARKER_PATTERN,
  MARKER_TYPES,
  VALID_MARKER_TYPES,
  type Marker,
  type MarkerType,
} from './marker/index.js';
