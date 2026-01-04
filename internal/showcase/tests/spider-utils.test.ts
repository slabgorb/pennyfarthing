/**
 * Story 13-9: Spider Utilities Tests
 *
 * Tests for OCEAN to SVG polygon geometry calculations.
 * These functions power the overlay spider chart.
 *
 * AC3: Overlay spider chart renders selected characters with distinct colors
 */

import { describe, it, expect } from 'vitest';
import {
  oceanToPolygonPoints,
  generateOverlayPolygons,
  getOverlayColors,
  type OceanScores,
} from '../src/lib/spider-utils';

describe('Story 13-9: Spider Utilities', () => {
  describe('oceanToPolygonPoints', () => {
    it('should convert OCEAN scores to SVG polygon points string', () => {
      const ocean: OceanScores = { O: 3, C: 3, E: 3, A: 3, N: 3 };
      const points = oceanToPolygonPoints(ocean, 100);

      // Should return space-separated "x,y" pairs
      expect(points).toMatch(/^\d+\.?\d*,\d+\.?\d*( \d+\.?\d*,\d+\.?\d*){4}$/);
    });

    it('should return 5 points for the pentagon vertices', () => {
      const ocean: OceanScores = { O: 4, C: 2, E: 5, A: 1, N: 3 };
      const points = oceanToPolygonPoints(ocean, 100);
      const pointPairs = points.split(' ');

      expect(pointPairs).toHaveLength(5);
    });

    it('should scale points based on size parameter', () => {
      const ocean: OceanScores = { O: 5, C: 5, E: 5, A: 5, N: 5 };

      const small = oceanToPolygonPoints(ocean, 50);
      const large = oceanToPolygonPoints(ocean, 200);

      // Parse first point from each
      const smallX = parseFloat(small.split(',')[0]);
      const largeX = parseFloat(large.split(',')[0]);

      // Large should have proportionally larger coordinates
      expect(largeX).toBeGreaterThan(smallX);
    });

    it('should handle minimum scores (all 1s)', () => {
      const ocean: OceanScores = { O: 1, C: 1, E: 1, A: 1, N: 1 };
      const points = oceanToPolygonPoints(ocean, 100);

      // Should still produce valid points
      expect(points).toBeTruthy();
      expect(points.split(' ')).toHaveLength(5);
    });

    it('should handle maximum scores (all 5s)', () => {
      const ocean: OceanScores = { O: 5, C: 5, E: 5, A: 5, N: 5 };
      const points = oceanToPolygonPoints(ocean, 100);

      // Points should extend to maximum radius
      expect(points).toBeTruthy();
    });
  });

  describe('generateOverlayPolygons', () => {
    const mockCharacters = [
      { theme: 'star-trek', role: 'sm', name: 'Picard', ocean: { O: 4, C: 5, E: 3, A: 4, N: 2 } },
      { theme: 'discworld', role: 'dev', name: 'Vimes', ocean: { O: 2, C: 4, E: 2, A: 3, N: 4 } },
    ];

    it('should generate polygon data for 2 characters', () => {
      const polygons = generateOverlayPolygons(mockCharacters.slice(0, 2), 100);

      expect(polygons).toHaveLength(2);
      expect(polygons[0]).toHaveProperty('points');
      expect(polygons[0]).toHaveProperty('color');
      expect(polygons[0]).toHaveProperty('character');
    });

    it('should generate polygon data for 3 characters', () => {
      const threeChars = [
        ...mockCharacters,
        { theme: 'shakespeare', role: 'tea', name: 'Hamlet', ocean: { O: 5, C: 2, E: 3, A: 2, N: 5 } },
      ];
      const polygons = generateOverlayPolygons(threeChars, 100);

      expect(polygons).toHaveLength(3);
    });

    it('should generate polygon data for 4 characters', () => {
      const fourChars = [
        ...mockCharacters,
        { theme: 'shakespeare', role: 'tea', name: 'Hamlet', ocean: { O: 5, C: 2, E: 3, A: 2, N: 5 } },
        { theme: 'jane-austen', role: 'reviewer', name: 'Darcy', ocean: { O: 3, C: 5, E: 1, A: 2, N: 3 } },
      ];
      const polygons = generateOverlayPolygons(fourChars, 100);

      expect(polygons).toHaveLength(4);
    });

    it('should assign distinct colors to each character', () => {
      const polygons = generateOverlayPolygons(mockCharacters, 100);

      const colors = polygons.map((p) => p.color);
      const uniqueColors = new Set(colors);

      expect(uniqueColors.size).toBe(colors.length);
    });

    it('should include character reference in each polygon', () => {
      const polygons = generateOverlayPolygons(mockCharacters, 100);

      expect(polygons[0].character.name).toBe('Picard');
      expect(polygons[1].character.name).toBe('Vimes');
    });
  });

  describe('getOverlayColors', () => {
    it('should return 4 distinct colors', () => {
      const colors = getOverlayColors();

      expect(colors).toHaveLength(4);
      const unique = new Set(colors);
      expect(unique.size).toBe(4);
    });

    it('should return valid CSS color values', () => {
      const colors = getOverlayColors();

      colors.forEach((color) => {
        // Should be hex color or valid CSS color name
        expect(color).toMatch(/^(#[0-9a-fA-F]{6}|[a-z]+)$/i);
      });
    });
  });
});
