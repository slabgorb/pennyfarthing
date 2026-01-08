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
 * Mappings (adjusted for visibility):
 * - O (Openness) → Eye size: 1→8px, 5→18px (more extreme)
 * - C (Conscientiousness) → Face shape: 1→95x95 round, 5→85x105 angular (reduced variance)
 * - E (Extraversion) → Mouth width: 1→12px, 5→50px (more extreme)
 * - A (Agreeableness) → Eyebrow angle: 1→-20°, 5→+20° (more extreme)
 * - N (Neuroticism) → Stroke width: 1→1.5px, 5→4px (more visible)
 */
export declare function oceanToParams(ocean: OceanScores): FaceParams;
/**
 * Generate SVG string from face parameters
 * @param params - Face parameters from oceanToParams
 * @param backgroundColor - Optional background color (hex string)
 */
export declare function generateSvgFromParams(params: FaceParams, backgroundColor?: string): string;
/**
 * Main function: Generate SVG face for a theme's agent
 */
export declare function generateFace(theme: string, agent: string): string;
//# sourceMappingURL=generate-face.d.ts.map