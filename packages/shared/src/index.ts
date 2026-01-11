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
  type Theme,
  type ThemeAgent,
} from './theme-loader.js';

export {
  searchSkills,
  type SearchOptions,
  type SkillResult,
} from './skill-search.js';
