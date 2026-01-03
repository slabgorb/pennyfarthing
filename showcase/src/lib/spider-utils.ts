/**
 * Spider Chart Utilities
 *
 * Geometry calculations for OCEAN personality visualization spider charts.
 * Used by overlay spider component for multi-character comparisons.
 */

export interface OceanScores {
  O: number;
  C: number;
  E: number;
  A: number;
  N: number;
}

export interface Character {
  theme: string;
  role: string;
  name: string;
  ocean: OceanScores;
}

export interface PolygonData {
  points: string;
  color: string;
  character: Character;
}

// Fixed color palette for up to 4 characters - distinct, accessible colors
const OVERLAY_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'];

/**
 * Convert OCEAN scores to SVG polygon points string.
 * Creates a pentagon with vertices scaled by each dimension's score.
 */
export function oceanToPolygonPoints(ocean: OceanScores, size: number): string {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.8; // 80% of half-size for padding

  // 5 axes at 72 degree intervals, starting from top
  const dimensions: (keyof OceanScores)[] = ['O', 'C', 'E', 'A', 'N'];

  const points = dimensions.map((dim, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180); // Start from top (-90 degrees)
    const score = ocean[dim];
    const radius = (score / 5) * maxRadius; // Normalize 1-5 to 0-maxRadius

    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return points.join(' ');
}

/**
 * Generate polygon data for multiple characters with distinct colors.
 */
export function generateOverlayPolygons(
  characters: Character[],
  size: number
): PolygonData[] {
  return characters.map((character, index) => ({
    points: oceanToPolygonPoints(character.ocean, size),
    color: OVERLAY_COLORS[index % OVERLAY_COLORS.length],
    character,
  }));
}

/**
 * Get the fixed color palette for overlays.
 */
export function getOverlayColors(): string[] {
  return [...OVERLAY_COLORS];
}
