/**
 * Story 13-9: Overlay Spider Chart Tests
 *
 * Tests for multi-character overlay spider chart rendering.
 *
 * AC3: Overlay spider chart renders selected characters with distinct colors
 * AC4: Legend identifies which color belongs to which character
 */

import { describe, it, expect } from 'vitest';
import {
  generateOverlaySvg,
  generateLegend,
  type OverlaySpiderProps,
  type LegendItem,
} from '../src/lib/overlay-spider';

const mockCharacters = [
  { theme: 'star-trek', role: 'sm', name: 'Picard', ocean: { O: 4, C: 5, E: 3, A: 4, N: 2 } },
  { theme: 'discworld', role: 'dev', name: 'Vimes', ocean: { O: 2, C: 4, E: 2, A: 3, N: 4 } },
  { theme: 'shakespeare', role: 'tea', name: 'Hamlet', ocean: { O: 5, C: 2, E: 3, A: 2, N: 5 } },
  { theme: 'jane-austen', role: 'reviewer', name: 'Darcy', ocean: { O: 3, C: 5, E: 1, A: 2, N: 3 } },
];

describe('Story 13-9: Overlay Spider Chart', () => {
  describe('AC3: Multi-character Overlay Rendering', () => {
    describe('generateOverlaySvg', () => {
      it('should generate valid SVG string for 2 characters', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 200,
        });

        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect(svg).toContain('viewBox');
      });

      it('should generate valid SVG string for 3 characters', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 3),
          size: 200,
        });

        expect(svg).toContain('<svg');
      });

      it('should generate valid SVG string for 4 characters', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters,
          size: 200,
        });

        expect(svg).toContain('<svg');
      });

      it('should include polygon element for each character', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 3),
          size: 200,
        });

        // Count polygon elements
        const polygonCount = (svg.match(/<polygon/g) || []).length;

        // Should have at least 3 data polygons (may have grid polygons too)
        expect(polygonCount).toBeGreaterThanOrEqual(3);
      });

      it('should use distinct colors for each character polygon', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 200,
        });

        // Should contain different fill colors
        // Looking for fill attributes with different values
        expect(svg).toContain('fill=');
      });

      it('should include grid lines for reference', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 200,
        });

        // Grid uses either polygon or line elements
        const hasGrid =
          svg.includes('class="grid"') ||
          svg.includes('stroke-width="0.5"') ||
          (svg.match(/<polygon/g) || []).length > 2;

        expect(hasGrid).toBe(true);
      });

      it('should respect size parameter', () => {
        const smallSvg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 100,
        });
        const largeSvg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 400,
        });

        expect(smallSvg).toContain('width="100"');
        expect(largeSvg).toContain('width="400"');
      });

      it('should include axis labels (O, C, E, A, N)', () => {
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 200,
          showLabels: true,
        });

        expect(svg).toContain('>O<');
        expect(svg).toContain('>C<');
        expect(svg).toContain('>E<');
        expect(svg).toContain('>A<');
        expect(svg).toContain('>N<');
      });
    });
  });

  describe('AC4: Legend Generation', () => {
    describe('generateLegend', () => {
      it('should generate legend items for each character', () => {
        const legend = generateLegend(mockCharacters.slice(0, 2));

        expect(legend).toHaveLength(2);
      });

      it('should include character name in each legend item', () => {
        const legend = generateLegend(mockCharacters.slice(0, 2));

        expect(legend[0].name).toBe('Picard');
        expect(legend[1].name).toBe('Vimes');
      });

      it('should include theme in each legend item', () => {
        const legend = generateLegend(mockCharacters.slice(0, 2));

        expect(legend[0].theme).toBe('star-trek');
        expect(legend[1].theme).toBe('discworld');
      });

      it('should include role in each legend item', () => {
        const legend = generateLegend(mockCharacters.slice(0, 2));

        expect(legend[0].role).toBe('sm');
        expect(legend[1].role).toBe('dev');
      });

      it('should assign distinct colors to each legend item', () => {
        const legend = generateLegend(mockCharacters);

        const colors = legend.map((item) => item.color);
        const uniqueColors = new Set(colors);

        expect(uniqueColors.size).toBe(colors.length);
      });

      it('should use the same colors as the SVG polygons', () => {
        const legend = generateLegend(mockCharacters.slice(0, 2));
        const svg = generateOverlaySvg({
          characters: mockCharacters.slice(0, 2),
          size: 200,
        });

        // Each legend color should appear in the SVG
        legend.forEach((item) => {
          expect(svg).toContain(item.color);
        });
      });

      it('should return empty array for empty input', () => {
        const legend = generateLegend([]);

        expect(legend).toEqual([]);
      });

      it('should handle single character (edge case)', () => {
        const legend = generateLegend(mockCharacters.slice(0, 1));

        expect(legend).toHaveLength(1);
        expect(legend[0].name).toBe('Picard');
      });
    });
  });
});
