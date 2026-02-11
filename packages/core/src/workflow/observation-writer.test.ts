/**
 * Tests for Story 95-3: Observation File Format and Writer
 *
 * RED state tests for tandem observation file creation and append.
 * These tests cover all acceptance criteria:
 *
 * AC1: File created at .session/{storyId}-tandem-{agent}.md
 * AC2: Header includes observer agent, persona, phase, start timestamp
 * AC3: Entry format — timestamp (HH:MM), trigger type, trigger detail, observation
 * AC4: Entries separated by --- horizontal rules
 * AC5: Entry-atomic appends — each write is a complete markdown entry
 * AC6: Valid markdown at all times, including after crash during write
 * AC7: Functions return result objects ({success, error?}) instead of throwing
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initObservationFile,
  appendObservation,
  parseObservationFile,
} from './observation-writer.js';

import type {
  ObservationWriterConfig,
  ObservationEntry,
} from './observation-writer.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_observation_writer__');
const SESSION_DIR = join(TEST_DIR, '.session');

// =============================================================================
// Test Fixtures
// =============================================================================

const DEFAULT_CONFIG: ObservationWriterConfig = {
  storyId: '95-3',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  sessionDir: SESSION_DIR,
};

const SAMPLE_ENTRY: ObservationEntry = {
  triggerType: 'file-watch',
  triggerDetail: 'src/components/Header.tsx modified',
  observation: 'The Header component now imports useTheme but doesn\'t destructure the return value consistently.',
};

const TOOL_WATCH_ENTRY: ObservationEntry = {
  triggerType: 'tool-watch',
  triggerDetail: 'Bash (npm test)',
  observation: 'Test suite passed with 2 warnings about deprecated API usage.',
};

const CONTEXT_WATCH_ENTRY: ObservationEntry = {
  triggerType: 'context-watch',
  triggerDetail: 'conversation summary at turn 15',
  observation: 'Developer is refactoring the auth module but hasn\'t updated the middleware tests yet.',
};

// =============================================================================
// Setup / Teardown
// =============================================================================

describe('95-3: Observation File Writer', () => {

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(SESSION_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // ===========================================================================
  // AC1: File created at .session/{storyId}-tandem-{agent}.md
  // ===========================================================================

  describe('AC1: File created at correct path', () => {

    it('should create observation file at .session/{storyId}-tandem-{agent}.md', () => {
      const result = initObservationFile(DEFAULT_CONFIG);

      assert.strictEqual(result.success, true, 'initObservationFile should succeed');
      const expectedPath = join(SESSION_DIR, '95-3-tandem-architect.md');
      assert.strictEqual(result.data?.path, expectedPath, 'Should return correct file path');
      assert.strictEqual(existsSync(expectedPath), true, 'File should exist on disk');
    });

    it('should use storyId and agent in filename', () => {
      const config: ObservationWriterConfig = {
        ...DEFAULT_CONFIG,
        storyId: '42-7',
        agent: 'tea',
      };

      const result = initObservationFile(config);

      assert.strictEqual(result.success, true);
      const expectedPath = join(SESSION_DIR, '42-7-tandem-tea.md');
      assert.strictEqual(result.data?.path, expectedPath);
      assert.strictEqual(existsSync(expectedPath), true);
    });

    it('should create session directory if it does not exist', () => {
      const nestedDir = join(TEST_DIR, 'nested', '.session');
      const config: ObservationWriterConfig = {
        ...DEFAULT_CONFIG,
        sessionDir: nestedDir,
      };

      const result = initObservationFile(config);

      assert.strictEqual(result.success, true, 'Should succeed even if directory missing');
      assert.strictEqual(existsSync(nestedDir), true, 'Directory should be created');
    });
  });

  // ===========================================================================
  // AC2: Header includes observer agent, persona, phase, start timestamp
  // ===========================================================================

  describe('AC2: File header includes metadata', () => {

    it('should include story ID in header title', () => {
      initObservationFile(DEFAULT_CONFIG);

      const content = readFileSync(
        join(SESSION_DIR, '95-3-tandem-architect.md'), 'utf-8'
      );
      assert.ok(
        content.includes('# Tandem Observations: 95-3'),
        'Header should contain story ID in title'
      );
    });

    it('should include observer agent and persona', () => {
      initObservationFile(DEFAULT_CONFIG);

      const content = readFileSync(
        join(SESSION_DIR, '95-3-tandem-architect.md'), 'utf-8'
      );
      assert.ok(
        content.includes('**Observer:** architect (Will Bailey)'),
        'Header should include agent and persona'
      );
    });

    it('should include phase', () => {
      initObservationFile(DEFAULT_CONFIG);

      const content = readFileSync(
        join(SESSION_DIR, '95-3-tandem-architect.md'), 'utf-8'
      );
      assert.ok(
        content.includes('**Phase:** implement'),
        'Header should include current phase'
      );
    });

    it('should include ISO start timestamp', () => {
      initObservationFile(DEFAULT_CONFIG);

      const content = readFileSync(
        join(SESSION_DIR, '95-3-tandem-architect.md'), 'utf-8'
      );
      // Match ISO 8601 pattern: YYYY-MM-DDTHH:MM:SS
      const isoPattern = /\*\*Started:\*\* \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      assert.ok(
        isoPattern.test(content),
        `Header should include ISO timestamp, got:\n${content}`
      );
    });

    it('should end header with --- separator', () => {
      initObservationFile(DEFAULT_CONFIG);

      const content = readFileSync(
        join(SESSION_DIR, '95-3-tandem-architect.md'), 'utf-8'
      );
      // After the header block, there should be a --- separator
      const lines = content.trim().split('\n');
      const lastLine = lines[lines.length - 1].trim();
      assert.strictEqual(lastLine, '---', 'Header should end with --- separator');
    });
  });

  // ===========================================================================
  // AC3: Entry format — HH:MM timestamp, trigger type, trigger detail, observation
  // ===========================================================================

  describe('AC3: Observation entry format', () => {

    it('should include HH:MM timestamp in entry heading', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      // Match ## [HH:MM] Observation
      const timePattern = /## \[\d{2}:\d{2}\] Observation/;
      assert.ok(
        timePattern.test(content),
        `Entry should have [HH:MM] timestamp heading, got:\n${content}`
      );
    });

    it('should include trigger type and detail', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes('**Trigger:** file-watch: src/components/Header.tsx modified'),
        'Entry should include trigger type and detail'
      );
    });

    it('should include observation text', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      assert.ok(
        content.includes(SAMPLE_ENTRY.observation),
        'Entry should include observation text'
      );
    });

    it('should handle all trigger types: file-watch, tool-watch, context-watch', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);
      appendObservation(filePath, TOOL_WATCH_ENTRY);
      appendObservation(filePath, CONTEXT_WATCH_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('file-watch:'), 'Should handle file-watch trigger');
      assert.ok(content.includes('tool-watch:'), 'Should handle tool-watch trigger');
      assert.ok(content.includes('context-watch:'), 'Should handle context-watch trigger');
    });
  });

  // ===========================================================================
  // AC4: Entries separated by --- horizontal rules
  // ===========================================================================

  describe('AC4: Entries separated by --- horizontal rules', () => {

    it('should separate first entry from header with ---', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      // The header ends with ---. The entry should also end with ---.
      // Count occurrences of ---
      const separators = content.match(/^---$/gm) || [];
      assert.ok(
        separators.length >= 2,
        `Should have at least 2 separators (header + entry), found ${separators.length}`
      );
    });

    it('should separate multiple entries with ---', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);
      appendObservation(filePath, TOOL_WATCH_ENTRY);
      appendObservation(filePath, CONTEXT_WATCH_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      // Header separator + 3 entry separators = at least 4
      const separators = content.match(/^---$/gm) || [];
      assert.ok(
        separators.length >= 4,
        `Should have at least 4 separators (1 header + 3 entries), found ${separators.length}`
      );
    });

    it('should end each entry with a trailing ---', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      const trimmed = content.trimEnd();
      assert.ok(
        trimmed.endsWith('---'),
        'File should end with --- after last entry'
      );
    });
  });

  // ===========================================================================
  // AC5: Entry-atomic appends — each write is a complete markdown entry
  // ===========================================================================

  describe('AC5: Entry-atomic appends', () => {

    it('should write complete entry in single append (not partial)', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      // A complete entry has: heading with timestamp, trigger line, observation text, trailing ---
      const entryPattern = /## \[\d{2}:\d{2}\] Observation\n\*\*Trigger:\*\*.*\n.*\n+---/;
      assert.ok(
        entryPattern.test(content),
        'Entry should be written as a complete block'
      );
    });

    it('should not leave partial entries on sequential appends', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      // Append multiple entries rapidly
      for (let i = 0; i < 5; i++) {
        appendObservation(filePath, {
          triggerType: 'file-watch',
          triggerDetail: `file-${i}.ts modified`,
          observation: `Observation number ${i}`,
        });
      }

      const content = readFileSync(filePath, 'utf-8');

      // Count entries by timestamp headings
      const entries = content.match(/## \[\d{2}:\d{2}\] Observation/g) || [];
      assert.strictEqual(entries.length, 5, 'Should have exactly 5 entries');

      // Count trailing separators (each entry ends with ---)
      const separators = content.match(/^---$/gm) || [];
      // 1 header separator + 5 entry separators = 6
      assert.ok(
        separators.length >= 6,
        `Should have at least 6 separators, found ${separators.length}`
      );
    });
  });

  // ===========================================================================
  // AC6: Valid markdown at all times
  // ===========================================================================

  describe('AC6: Valid markdown at all times', () => {

    it('should produce valid markdown with header only (no entries)', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const content = readFileSync(filePath, 'utf-8');

      // Should start with # heading
      assert.ok(content.startsWith('#'), 'Should start with markdown heading');
      // Should have bold metadata fields
      assert.ok(content.includes('**Observer:**'), 'Should have bold Observer field');
      assert.ok(content.includes('**Phase:**'), 'Should have bold Phase field');
      assert.ok(content.includes('**Started:**'), 'Should have bold Started field');
    });

    it('should produce valid markdown after one entry', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);

      const content = readFileSync(filePath, 'utf-8');
      // Verify structure: heading, metadata, ---, entry, ---
      assert.ok(content.includes('# Tandem Observations:'), 'Has top-level heading');
      assert.ok(content.includes('## ['), 'Has entry heading');
      // No unclosed markers or broken formatting
      const openBold = (content.match(/\*\*/g) || []).length;
      assert.strictEqual(openBold % 2, 0, 'All bold markers should be paired');
    });

    it('should produce valid markdown after many entries', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      for (let i = 0; i < 10; i++) {
        appendObservation(filePath, {
          triggerType: 'file-watch',
          triggerDetail: `file-${i}.ts modified`,
          observation: `Change ${i}: Updated the component with new props.`,
        });
      }

      const content = readFileSync(filePath, 'utf-8');
      const entries = content.match(/## \[\d{2}:\d{2}\] Observation/g) || [];
      assert.strictEqual(entries.length, 10, 'All 10 entries should be present');
      // File ends cleanly
      assert.ok(content.trimEnd().endsWith('---'), 'File should end with separator');
    });
  });

  // ===========================================================================
  // AC7: Result objects — {success, error?} instead of throwing
  // ===========================================================================

  describe('AC7: Result objects instead of throwing', () => {

    it('should return {success: true, data: {path}} from initObservationFile', () => {
      const result = initObservationFile(DEFAULT_CONFIG);

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
      assert.strictEqual(result.success, true);
      assert.ok(result.data, 'Success result should have data');
      assert.ok(typeof result.data.path === 'string', 'Data should have path string');
    });

    it('should return {success: true} from appendObservation', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const result = appendObservation(filePath, SAMPLE_ENTRY);

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(result.success, true);
    });

    it('should return error result for invalid sessionDir (not throw)', () => {
      const badConfig: ObservationWriterConfig = {
        ...DEFAULT_CONFIG,
        sessionDir: '/nonexistent/deeply/nested/path/that/cannot/exist',
      };

      // Must NOT throw — return error result instead
      const result = initObservationFile(badConfig);

      assert.strictEqual(typeof result.success, 'boolean', 'Must return result object');
      // Either succeeds (created dir) or fails gracefully
      if (!result.success) {
        assert.ok(result.error, 'Failed result should have error message');
      }
    });

    it('should return error result when appending to nonexistent file (not throw)', () => {
      const result = appendObservation('/nonexistent/file.md', SAMPLE_ENTRY);

      assert.strictEqual(result.success, false, 'Should fail for nonexistent file');
      assert.ok(result.error, 'Failed result should have error message');
    });

    it('should never throw from initObservationFile', () => {
      // Even with completely bogus config
      assert.doesNotThrow(
        () => initObservationFile({ storyId: '', agent: '', persona: '', phase: '', sessionDir: '' }),
        'initObservationFile must not throw'
      );
    });

    it('should never throw from appendObservation', () => {
      assert.doesNotThrow(
        () => appendObservation('', { triggerType: '', triggerDetail: '', observation: '' }),
        'appendObservation must not throw'
      );
    });
  });

  // ===========================================================================
  // parseObservationFile — used by bell mode (95-7)
  // ===========================================================================

  describe('parseObservationFile: Read observations back', () => {

    it('should parse header from observation file', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const result = parseObservationFile(filePath);

      assert.strictEqual(result.success, true, 'Parsing should succeed');
      assert.ok(result.data, 'Should return parsed data');
      assert.strictEqual(result.data.header.storyId, '95-3');
      assert.strictEqual(result.data.header.observer, 'architect (Will Bailey)');
      assert.strictEqual(result.data.header.phase, 'implement');
      assert.ok(result.data.header.started, 'Should have started timestamp');
    });

    it('should parse entries from observation file', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      appendObservation(filePath, SAMPLE_ENTRY);
      appendObservation(filePath, TOOL_WATCH_ENTRY);

      const result = parseObservationFile(filePath);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.entries.length, 2, 'Should find 2 entries');
      assert.strictEqual(result.data?.entries[0].triggerType, 'file-watch');
      assert.strictEqual(result.data?.entries[1].triggerType, 'tool-watch');
    });

    it('should return empty entries array for file with only header', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const result = parseObservationFile(filePath);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.entries.length, 0, 'No entries in header-only file');
    });

    it('should return error result for nonexistent file (not throw)', () => {
      const result = parseObservationFile('/nonexistent/file.md');

      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('Edge cases', () => {

    it('should handle observation text with markdown special characters', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const tricky: ObservationEntry = {
        triggerType: 'file-watch',
        triggerDetail: 'README.md modified',
        observation: 'The `code block` has **bold** and [links](http://example.com) and --- separators in text.',
      };

      const result = appendObservation(filePath, tricky);
      assert.strictEqual(result.success, true, 'Should handle markdown chars in observation');

      const content = readFileSync(filePath, 'utf-8');
      assert.ok(content.includes(tricky.observation), 'Observation text should be preserved verbatim');
    });

    it('should handle empty observation text', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const result = appendObservation(filePath, {
        triggerType: 'file-watch',
        triggerDetail: 'test.ts modified',
        observation: '',
      });

      assert.strictEqual(result.success, true, 'Empty observation should still succeed');
    });

    it('should handle multiline observation text', () => {
      initObservationFile(DEFAULT_CONFIG);
      const filePath = join(SESSION_DIR, '95-3-tandem-architect.md');

      const multiline: ObservationEntry = {
        triggerType: 'context-watch',
        triggerDetail: 'conversation turn 20',
        observation: 'First line of observation.\nSecond line with more detail.\nThird line wrapping up.',
      };

      const result = appendObservation(filePath, multiline);
      assert.strictEqual(result.success, true);

      const content = readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('First line of observation.'), 'Multiline should be preserved');
      assert.ok(content.includes('Third line wrapping up.'), 'All lines should be present');
    });

    it('should not corrupt file if initObservationFile called twice', () => {
      const result1 = initObservationFile(DEFAULT_CONFIG);
      assert.strictEqual(result1.success, true);

      // Append an entry
      appendObservation(result1.data!.path, SAMPLE_ENTRY);

      // Init again — should not destroy existing content or should fail gracefully
      const result2 = initObservationFile(DEFAULT_CONFIG);
      // Either: returns error (file exists) or overwrites cleanly
      assert.ok('success' in result2, 'Must return result object');
    });
  });
});
