/**
 * Story 13-9: Export Functionality Tests
 *
 * Tests for exporting comparisons as markdown or SVG.
 *
 * AC5: Export comparison as markdown table or downloadable SVG image
 */

import { describe, it, expect } from 'vitest';
import {
  exportAsMarkdown,
  exportAsSvg,
  generateComparisonTable,
  type ExportOptions,
} from '../src/lib/export';

const mockCharacters = [
  { theme: 'star-trek', role: 'sm', name: 'Picard', ocean: { O: 4, C: 5, E: 3, A: 4, N: 2 } },
  { theme: 'discworld', role: 'dev', name: 'Vimes', ocean: { O: 2, C: 4, E: 2, A: 3, N: 4 } },
  { theme: 'shakespeare', role: 'tea', name: 'Hamlet', ocean: { O: 5, C: 2, E: 3, A: 2, N: 5 } },
];

describe('Story 13-9: Export Functionality', () => {
  describe('AC5: Markdown Export', () => {
    describe('generateComparisonTable', () => {
      it('should generate markdown table header', () => {
        const table = generateComparisonTable(mockCharacters.slice(0, 2));

        expect(table).toContain('| Character |');
        expect(table).toContain('| O | C | E | A | N |');
      });

      it('should include separator row', () => {
        const table = generateComparisonTable(mockCharacters.slice(0, 2));

        expect(table).toContain('|---');
      });

      it('should include row for each character', () => {
        const table = generateComparisonTable(mockCharacters.slice(0, 2));

        expect(table).toContain('Picard');
        expect(table).toContain('Vimes');
      });

      it('should include OCEAN scores for each character', () => {
        const table = generateComparisonTable(mockCharacters.slice(0, 2));

        // Picard's scores: O:4, C:5, E:3, A:4, N:2
        expect(table).toContain('| 4 | 5 | 3 | 4 | 2 |');
        // Vimes's scores: O:2, C:4, E:2, A:3, N:4
        expect(table).toContain('| 2 | 4 | 2 | 3 | 4 |');
      });

      it('should include theme and role in character column', () => {
        const table = generateComparisonTable(mockCharacters.slice(0, 2));

        expect(table).toMatch(/Picard.*star-trek/);
        expect(table).toMatch(/Vimes.*discworld/);
      });
    });

    describe('exportAsMarkdown', () => {
      it('should generate complete markdown document', () => {
        const markdown = exportAsMarkdown(mockCharacters.slice(0, 2));

        expect(markdown).toContain('# OCEAN Comparison');
        expect(markdown).toContain('|');
      });

      it('should include comparison table', () => {
        const markdown = exportAsMarkdown(mockCharacters.slice(0, 2));

        expect(markdown).toContain('| Character |');
        expect(markdown).toContain('Picard');
      });

      it('should include timestamp', () => {
        const markdown = exportAsMarkdown(mockCharacters.slice(0, 2));

        // Should contain date in some format
        expect(markdown).toMatch(/\d{4}/); // Year
      });

      it('should include character count summary', () => {
        const markdown = exportAsMarkdown(mockCharacters);

        expect(markdown).toContain('3');
        expect(markdown).toMatch(/character|persona/i);
      });

      it('should accept custom title option', () => {
        const markdown = exportAsMarkdown(mockCharacters.slice(0, 2), {
          title: 'My Custom Comparison',
        });

        expect(markdown).toContain('My Custom Comparison');
      });
    });
  });

  describe('AC5: SVG Export', () => {
    describe('exportAsSvg', () => {
      it('should generate valid SVG string', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
      });

      it('should include overlay spider chart', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        // Should have polygon elements for the spider
        expect(svg).toContain('<polygon');
      });

      it('should include legend', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        expect(svg).toContain('Picard');
        expect(svg).toContain('Vimes');
      });

      it('should include OCEAN dimension labels', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        expect(svg).toContain('>O<');
        expect(svg).toContain('>C<');
        expect(svg).toContain('>E<');
        expect(svg).toContain('>A<');
        expect(svg).toContain('>N<');
      });

      it('should use distinct colors for each character', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        // Should contain at least 2 different fill colors
        const fillMatches = svg.match(/fill="[^"]+"/g) || [];
        const uniqueFills = new Set(fillMatches);

        expect(uniqueFills.size).toBeGreaterThan(1);
      });

      it('should respect size option', () => {
        const smallSvg = exportAsSvg(mockCharacters.slice(0, 2), { size: 200 });
        const largeSvg = exportAsSvg(mockCharacters.slice(0, 2), { size: 600 });

        expect(smallSvg).toContain('200');
        expect(largeSvg).toContain('600');
      });

      it('should generate standalone SVG (no external dependencies)', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        // Should not reference external stylesheets or scripts
        expect(svg).not.toContain('<link');
        expect(svg).not.toContain('<script');
        expect(svg).not.toContain('href=');
      });

      it('should include xmlns for standalone SVG', () => {
        const svg = exportAsSvg(mockCharacters.slice(0, 2));

        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      });
    });
  });

  describe('Export Integration', () => {
    it('should handle 2 characters', () => {
      const markdown = exportAsMarkdown(mockCharacters.slice(0, 2));
      const svg = exportAsSvg(mockCharacters.slice(0, 2));

      expect(markdown).toBeTruthy();
      expect(svg).toBeTruthy();
    });

    it('should handle 3 characters', () => {
      const markdown = exportAsMarkdown(mockCharacters);
      const svg = exportAsSvg(mockCharacters);

      expect(markdown).toContain('Hamlet');
      expect(svg).toContain('Hamlet');
    });

    it('should handle 4 characters', () => {
      const fourChars = [
        ...mockCharacters,
        { theme: 'jane-austen', role: 'reviewer', name: 'Darcy', ocean: { O: 3, C: 5, E: 1, A: 2, N: 3 } },
      ];
      const markdown = exportAsMarkdown(fourChars);
      const svg = exportAsSvg(fourChars);

      expect(markdown).toContain('Darcy');
      expect(svg).toContain('Darcy');
    });
  });
});
