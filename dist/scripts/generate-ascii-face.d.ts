/**
 * ASCII Chernoff Face Generator - OCEAN → Unicode Art
 *
 * Generates Unicode art Chernoff faces from OCEAN personality scores.
 * Companion to generate-face.ts (SVG version).
 */
import { loadThemeOcean, OceanScores } from './generate-face.js';
export { OceanScores, loadThemeOcean };
/**
 * ASCII face features derived from OCEAN scores
 */
export interface AsciiFaceFeatures {
    eyeChar: string;
    faceWidth: 'narrow' | 'medium' | 'wide';
    browLeft: string;
    browRight: string;
    mouth: string;
    borderTL: string;
    borderTR: string;
    borderBL: string;
    borderBR: string;
    borderH: string;
    borderV: string;
}
/**
 * Map OCEAN scores to ASCII face features
 *
 * Mappings:
 * - O (Openness) → Eye size: small • → medium ○ → large ◉
 * - C (Conscientiousness) → Face width: wide → medium → narrow
 * - E (Extraversion) → Mouth: frown ╭─╮ → flat ─── → smile ╰─╯
 * - A (Agreeableness) → Eyebrows: stern ╲ ╱ → flat ─ ─ → raised ╱ ╲
 * - N (Neuroticism) → Border style: rounded (calm) → angular (tense)
 */
export declare function oceanToAsciiFeatures(ocean: OceanScores): AsciiFaceFeatures;
/**
 * Generate ASCII face string from features
 */
export declare function generateAsciiFromFeatures(features: AsciiFaceFeatures): string;
/**
 * Generate ASCII face directly from OCEAN scores
 */
export declare function generateAsciiFromOcean(ocean: OceanScores): string;
/**
 * Main function: Generate ASCII face for a theme's agent
 */
export declare function generateAsciiFace(theme: string, agent: string): string;
/**
 * Generate a labeled ASCII face with agent name
 */
export declare function generateLabeledAsciiFace(theme: string, agent: string, characterName?: string): string;
//# sourceMappingURL=generate-ascii-face.d.ts.map