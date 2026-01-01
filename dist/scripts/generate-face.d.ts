/**
 * Chernoff Face Generator - OCEAN → SVG
 *
 * Story 11-3: Build Chernoff face generator (OCEAN → SVG)
 *
 * This module takes OCEAN personality scores and generates SVG Chernoff faces.
 * Mapping follows the OCEAN-TO-FACE.md specification.
 */
export interface OceanScores {
    O: number;
    C: number;
    E: number;
    A: number;
    N: number;
}
export interface FaceParams {
    eyeRadius: number;
    pupilRadius: number;
    faceWidth: number;
    faceHeight: number;
    cornerRadius: number;
    mouthWidth: number;
    mouthCurve: number;
    eyebrowAngle: number;
    strokeWidth: number;
}
/**
 * Load OCEAN scores from a theme YAML file for a specific agent
 */
export declare function loadThemeOcean(theme: string, agent: string): OceanScores;
/**
 * Map OCEAN scores to SVG face parameters per OCEAN-TO-FACE.md spec
 *
 * Mappings:
 * - O (Openness) → Eye size: 1→6px, 5→14px
 * - C (Conscientiousness) → Face shape: 1→100x100 round, 5→80x115 angular
 * - E (Extraversion) → Mouth width: 1→15px, 5→40px
 * - A (Agreeableness) → Eyebrow angle: 1→-15°, 5→+15°
 * - N (Neuroticism) → Stroke width: 1→1px, 5→3px
 */
export declare function oceanToParams(ocean: OceanScores): FaceParams;
/**
 * Generate SVG string from face parameters
 */
export declare function generateSvgFromParams(params: FaceParams): string;
/**
 * Main function: Generate SVG face for a theme's agent
 */
export declare function generateFace(theme: string, agent: string): string;
//# sourceMappingURL=generate-face.d.ts.map