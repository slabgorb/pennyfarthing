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
import { findMonorepoRoot } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
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

// Pastel background colors by agent role
const AGENT_COLORS: Record<string, string> = {
  orchestrator: '#E8D5E8', // Soft lavender
  sm: '#D5E8D5', // Soft mint green
  tea: '#D5E0E8', // Soft sky blue
  dev: '#E8E8D5', // Soft cream
  reviewer: '#E8D5D5', // Soft rose
  architect: '#D5D8E8', // Soft periwinkle
  pm: '#E8DDD5', // Soft peach
  'tech-writer': '#D5E8E8', // Soft cyan
  'ux-designer': '#E8D8E8', // Soft orchid
  devops: '#DDE8D5', // Soft sage
};

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
 * Mappings (adjusted for visibility):
 * - O (Openness) → Eye size: 1→8px, 5→18px (more extreme)
 * - C (Conscientiousness) → Face shape: 1→95x95 round, 5→85x105 angular (reduced variance)
 * - E (Extraversion) → Mouth width: 1→12px, 5→50px (more extreme)
 * - A (Agreeableness) → Eyebrow angle: 1→-20°, 5→+20° (more extreme)
 * - N (Neuroticism) → Stroke width: 1→1.5px, 5→4px (more visible)
 */
export function oceanToParams(ocean: OceanScores): FaceParams {
  // Linear interpolation helper
  const lerp = (value: number, min: number, max: number): number => {
    // value is 1-5, normalize to 0-1 then interpolate
    const t = (value - 1) / 4;
    return min + t * (max - min);
  };

  // Openness → Eye Size (8px to 18px - more extreme range)
  const eyeRadius = Math.round(lerp(ocean.O, 8, 18));
  const pupilRadius = Math.round(lerp(ocean.O, 3, 8));

  // Conscientiousness → Face Shape (dramatic variance)
  // C=1: Wide round face (110x90), C=5: Narrow tall angular face (70x120)
  const faceWidth = Math.round(lerp(ocean.C, 110, 70));
  const faceHeight = Math.round(lerp(ocean.C, 90, 120));
  const cornerRadius = Math.round(lerp(ocean.C, 50, 5)); // Round to angular

  // Extraversion → Mouth (width 12 to 50, curve flat to strong - more extreme)
  const mouthWidth = Math.round(lerp(ocean.E, 12, 50));
  const mouthCurve = Math.round(lerp(ocean.E, -5, 20)); // Negative = frown, positive = smile

  // Agreeableness → Eyebrow Angle (-20° to +20° - more extreme)
  const eyebrowAngle = Math.round(lerp(ocean.A, -20, 20));

  // Neuroticism → Stroke Width (1.5px to 4px - more visible)
  const strokeWidth = lerp(ocean.N, 1.5, 4);

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
 * @param params - Face parameters from oceanToParams
 * @param backgroundColor - Optional background color (hex string)
 */
export function generateSvgFromParams(params: FaceParams, backgroundColor?: string): string {
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
  // In SVG, Y increases downward. For a smile, control point must be BELOW the line (larger Y)
  // Positive mouthCurve = smile (control point BELOW line, curve opens upward)
  // Negative mouthCurve = frown (control point ABOVE line, curve opens downward)
  const mouthStartX = cx - mouthHalfWidth;
  const mouthEndX = cx + mouthHalfWidth;
  const mouthControlY = mouthY + mouthCurve; // Add: positive curve = point goes down = smile opens up
  const mouthPath = `M ${mouthStartX} ${mouthY} Q ${cx} ${mouthControlY} ${mouthEndX} ${mouthY}`;

  // Eyebrow positions and rotation
  const eyebrowY = eyeY - eyeRadius - 8;
  const eyebrowLength = eyeRadius * 1.5;

  // Calculate vertical offset for eyebrow tilt
  // Positive angle (friendly): inner ends UP, outer ends DOWN
  // Negative angle (stern): inner ends DOWN, outer ends UP
  const browTilt = Math.sin((eyebrowAngle * Math.PI) / 180) * (eyebrowLength / 2);

  // Left eyebrow: outer=left (x1), inner=right (x2)
  const leftBrowOuterX = leftEyeX - eyebrowLength / 2;
  const leftBrowInnerX = leftEyeX + eyebrowLength / 2;
  const leftBrowOuterY = eyebrowY + browTilt;  // Positive tilt pushes outer DOWN
  const leftBrowInnerY = eyebrowY - browTilt;  // Positive tilt pushes inner UP

  // Right eyebrow: inner=left (x1), outer=right (x2) - mirrored
  const rightBrowInnerX = rightEyeX - eyebrowLength / 2;
  const rightBrowOuterX = rightEyeX + eyebrowLength / 2;
  const rightBrowInnerY = eyebrowY - browTilt; // Positive tilt pushes inner UP
  const rightBrowOuterY = eyebrowY + browTilt; // Positive tilt pushes outer DOWN

  // Background (optional)
  const bgRect = backgroundColor
    ? `\n  <!-- Background -->\n  <rect x="0" y="0" width="200" height="200" fill="${backgroundColor}" />\n`
    : '';

  // Build SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bgRect}
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
  <line x1="${leftBrowOuterX}" y1="${leftBrowOuterY}"
        x2="${leftBrowInnerX}" y2="${leftBrowInnerY}"
    stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" />

  <!-- Right Eyebrow -->
  <line x1="${rightBrowInnerX}" y1="${rightBrowInnerY}"
        x2="${rightBrowOuterX}" y2="${rightBrowOuterY}"
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
  const backgroundColor = AGENT_COLORS[agent] || '#F0F0F0'; // Default light gray
  return generateSvgFromParams(params, backgroundColor);
}
