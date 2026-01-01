/**
 * Chernoff Face Generator - OCEAN → SVG
 *
 * Story 11-3: Build Chernoff face generator (OCEAN → SVG)
 *
 * This module takes OCEAN personality scores and generates SVG Chernoff faces.
 * Mapping follows the OCEAN-TO-FACE.md specification.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate from dist/scripts/ to project root
const projectRoot = join(__dirname, '..', '..');
const themesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');

export interface OceanScores {
  O: number; // Openness (1-5)
  C: number; // Conscientiousness (1-5)
  E: number; // Extraversion (1-5)
  A: number; // Agreeableness (1-5)
  N: number; // Neuroticism (1-5)
}

export interface FaceParams {
  eyeRadius: number;
  pupilRadius: number;
  faceWidth: number;
  faceHeight: number;
  cornerRadius: number;
  mouthWidth: number;
  mouthCurve: number; // Control point Y offset for bezier curve
  eyebrowAngle: number;
  strokeWidth: number;
}

/**
 * Load OCEAN scores from a theme YAML file for a specific agent
 */
export function loadThemeOcean(theme: string, agent: string): OceanScores {
  const themePath = join(themesDir, `${theme}.yaml`);

  if (!existsSync(themePath)) {
    throw new Error(`Theme not found: ${theme}`);
  }

  const content = readFileSync(themePath, 'utf-8');
  const parsed = parseYaml(content) as Record<string, unknown>;

  const agents = parsed.agents as Record<string, Record<string, unknown>> | undefined;
  if (!agents) {
    throw new Error(`Theme ${theme} has no agents section`);
  }

  const agentData = agents[agent];
  if (!agentData) {
    throw new Error(`Agent not found: ${agent} in theme ${theme}`);
  }

  const ocean = agentData.ocean as OceanScores | undefined;
  if (!ocean) {
    throw new Error(`Agent ${agent} in theme ${theme} has no OCEAN scores`);
  }

  return {
    O: ocean.O,
    C: ocean.C,
    E: ocean.E,
    A: ocean.A,
    N: ocean.N,
  };
}

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
export function oceanToParams(ocean: OceanScores): FaceParams {
  // Linear interpolation helper
  const lerp = (value: number, min: number, max: number): number => {
    // value is 1-5, normalize to 0-1 then interpolate
    const t = (value - 1) / 4;
    return min + t * (max - min);
  };

  // Openness → Eye Size (6px to 14px)
  const eyeRadius = Math.round(lerp(ocean.O, 6, 14));
  const pupilRadius = Math.round(lerp(ocean.O, 2, 6));

  // Conscientiousness → Face Shape
  // Width: 100 to 80, Height: 100 to 115, Corner: 50% to 10%
  const faceWidth = Math.round(lerp(ocean.C, 100, 80));
  const faceHeight = Math.round(lerp(ocean.C, 100, 115));
  const cornerRadius = Math.round(lerp(ocean.C, 50, 10));

  // Extraversion → Mouth (width 15 to 40, curve flat to strong)
  const mouthWidth = Math.round(lerp(ocean.E, 15, 40));
  const mouthCurve = Math.round(lerp(ocean.E, 0, 15)); // Bezier control Y offset

  // Agreeableness → Eyebrow Angle (-15° to +15°)
  const eyebrowAngle = Math.round(lerp(ocean.A, -15, 15));

  // Neuroticism → Stroke Width (1px to 3px)
  const strokeWidth = lerp(ocean.N, 1, 3);

  return {
    eyeRadius,
    pupilRadius,
    faceWidth,
    faceHeight,
    cornerRadius,
    mouthWidth,
    mouthCurve,
    eyebrowAngle,
    strokeWidth,
  };
}

/**
 * Generate SVG string from face parameters
 */
export function generateSvgFromParams(params: FaceParams): string {
  const {
    eyeRadius,
    pupilRadius,
    faceWidth,
    faceHeight,
    cornerRadius,
    mouthWidth,
    mouthCurve,
    eyebrowAngle,
    strokeWidth,
  } = params;

  // ViewBox is 200x200, center at 100,100
  const cx = 100;
  const cy = 100;

  // Face ellipse (centered)
  const faceRx = faceWidth / 2;
  const faceRy = faceHeight / 2;

  // Eye positions (relative to center)
  const eyeY = cy - faceRy * 0.15; // Slightly above center
  const eyeSpacing = faceWidth * 0.25;
  const leftEyeX = cx - eyeSpacing;
  const rightEyeX = cx + eyeSpacing;

  // Mouth position
  const mouthY = cy + faceRy * 0.35;
  const mouthHalfWidth = mouthWidth / 2;

  // Mouth path (quadratic bezier for curve)
  const mouthStartX = cx - mouthHalfWidth;
  const mouthEndX = cx + mouthHalfWidth;
  const mouthControlY = mouthY + mouthCurve; // Positive = smile down, we want smile up
  const mouthPath = mouthCurve > 0
    ? `M ${mouthStartX} ${mouthY} Q ${cx} ${mouthY - mouthCurve} ${mouthEndX} ${mouthY}`
    : `M ${mouthStartX} ${mouthY} L ${mouthEndX} ${mouthY}`;

  // Eyebrow positions and rotation
  const eyebrowY = eyeY - eyeRadius - 8;
  const eyebrowLength = eyeRadius * 1.5;
  const eyebrowRad = (eyebrowAngle * Math.PI) / 180;

  // Generate eyebrow lines (rotated around their outer edge)
  // Left eyebrow: rotate around left end
  const leftBrowStartX = leftEyeX - eyebrowLength / 2;
  const leftBrowEndX = leftEyeX + eyebrowLength / 2;
  const leftBrowDy = Math.sin(-eyebrowRad) * eyebrowLength; // Negative for inner end higher when positive angle

  // Right eyebrow: mirror
  const rightBrowStartX = rightEyeX - eyebrowLength / 2;
  const rightBrowEndX = rightEyeX + eyebrowLength / 2;
  const rightBrowDy = Math.sin(eyebrowRad) * eyebrowLength;

  // Build SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <!-- Face -->
  <ellipse cx="${cx}" cy="${cy}" rx="${faceRx}" ry="${faceRy}"
    fill="none" stroke="black" stroke-width="${strokeWidth}" />

  <!-- Left Eye -->
  <circle cx="${leftEyeX}" cy="${eyeY}" r="${eyeRadius}"
    fill="none" stroke="black" stroke-width="${strokeWidth}" />
  <circle cx="${leftEyeX}" cy="${eyeY}" r="${pupilRadius}"
    fill="black" stroke="none" />

  <!-- Right Eye -->
  <circle cx="${rightEyeX}" cy="${eyeY}" r="${eyeRadius}"
    fill="none" stroke="black" stroke-width="${strokeWidth}" />
  <circle cx="${rightEyeX}" cy="${eyeY}" r="${pupilRadius}"
    fill="black" stroke="none" />

  <!-- Left Eyebrow -->
  <line x1="${leftBrowStartX}" y1="${eyebrowY + leftBrowDy / 2}"
        x2="${leftBrowEndX}" y2="${eyebrowY - leftBrowDy / 2}"
    stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" />

  <!-- Right Eyebrow -->
  <line x1="${rightBrowStartX}" y1="${eyebrowY - rightBrowDy / 2}"
        x2="${rightBrowEndX}" y2="${eyebrowY + rightBrowDy / 2}"
    stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" />

  <!-- Mouth -->
  <path d="${mouthPath}"
    fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" />
</svg>`;

  return svg;
}

/**
 * Main function: Generate SVG face for a theme's agent
 */
export function generateFace(theme: string, agent: string): string {
  const ocean = loadThemeOcean(theme, agent);
  const params = oceanToParams(ocean);
  return generateSvgFromParams(params);
}
