/**
 * OCEAN Spider Chart Generator
 *
 * Story 11-10: Build OCEAN spider chart generator (complement to Chernoff faces)
 *
 * Generates pentagon-shaped spider charts showing OCEAN personality profiles.
 * Charts are unfilled (stroke only) to enable clean stacking for comparisons.
 */
import { OceanScores } from './generate-face.js';
export declare const ROLE_COLORS: Record<string, string>;
/**
 * Generate SVG spider chart from OCEAN scores
 */
export declare function generateSpiderFromOcean(ocean: OceanScores, color?: string): string;
/**
 * Generate SVG spider chart from theme and agent
 * Uses role-specific color for consistent visual training
 */
export declare function generateSpider(theme: string, agent: string): string;
/**
 * Character specification for overlay mode
 */
export interface CharacterSpec {
    theme: string;
    agent: string;
    label?: string;
}
/**
 * Generate overlay spider chart comparing multiple characters
 */
export declare function generateOverlaySpider(characters: CharacterSpec[]): string;
/**
 * Generate team overlay spider chart showing all 10 agents for a theme
 * Uses role-specific colors for consistent visual training
 */
export declare function generateTeamOverlay(theme: string): string;
//# sourceMappingURL=generate-spider.d.ts.map