/**
 * MSSCI-12552: BikeLane panel shows 'No active story' with active session
 *
 * Bug: parseSessionFile fails to extract story ID and title from the new
 * session file format that uses bold field markers (**Story:** and **Title:**)
 * instead of the legacy header format (# Story ID: Title).
 *
 * Root cause: parseSessionFile only matches these patterns:
 *   - /^#\s*Story\s+([\w-]+):\s*(.+)$/m  -> "# Story 15-3: Title"
 *   - /^#\s*Story\s+([\w-]+)\s+Session$/m -> "# Story 15-3 Session"
 *
 * But the new format uses:
 *   - # {STORY_ID} Session  (header without "Story" prefix)
 *   - **Story:** {STORY_ID}
 *   - **Title:** {title}
 *
 * Written in RED phase - tests should fail until Dev fixes parseSessionFile.
 */

import { describe, it, expect } from 'vitest';
import { parseSessionFile, getStoryInfo, StoryInfo } from '@pennyfarthing/core/dist/server/story-parser.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// =============================================================================
// Test Fixtures: New session file format used by sm-setup
// =============================================================================

/**
 * New session file format - matches what sm-setup creates
 */
function createNewFormatSession(storyId: string, title: string, phase: string = 'red') {
  return `# ${storyId} Session

**Story:** ${storyId}
**Title:** ${title}
**Points:** 2
**Workflow:** tdd
**Phase:** ${phase}
**Jira:** ${storyId}
**Epic:** 64 (Cyclist UX Polish)
**Repos:** pennyfarthing
**Feature Branch:** feat/test-branch
**Assignee:** testuser

## Status

In ${phase.toUpperCase()} phase.

## Story Context

Test story context.
`;
}

/**
 * Old session file format - legacy format that still works
 */
function createOldFormatSession(storyId: string, title: string, phase: string = 'dev') {
  return `# Story ${storyId}: ${title}

## Story Details

| Field | Value |
|-------|-------|
| **ID** | ${storyId} |
| **Title** | ${title} |
| **Points** | 3 |
| **Phase** | ${phase} |

## Branch

\`feat/${storyId}-test-branch\`
`;
}

/**
 * MSSCI-format Jira ID session - common in enterprise
 */
function createJiraFormatSession(jiraKey: string, title: string, phase: string = 'red') {
  return `# ${jiraKey} Session

**Story:** ${jiraKey}
**Title:** ${title}
**Points:** 3
**Workflow:** tdd
**Phase:** ${phase}
**Jira:** ${jiraKey}
**Repos:** pennyfarthing
**Feature Branch:** feat/test-branch
`;
}

// =============================================================================
// AC1: parseSessionFile extracts story ID from new format
// =============================================================================

describe('MSSCI-12552: parseSessionFile handles new session format', () => {
  describe('AC1: Extract story ID from new format', () => {
    it('should extract story ID from **Story:** field', () => {
      const content = createNewFormatSession('MSSCI-12552', 'Test Bug Fix');
      const result = parseSessionFile(content);

      expect(result.id).toBe('MSSCI-12552');
    });

    it('should extract story ID from header when format is "# {ID} Session"', () => {
      const content = createNewFormatSession('TEST-123', 'Test Story');
      const result = parseSessionFile(content);

      // Should extract from either header or **Story:** field
      expect(result.id).toBe('TEST-123');
    });

    it('should handle story IDs with hyphens (MSSCI-XXXXX format)', () => {
      const content = createJiraFormatSession('MSSCI-99999', 'Enterprise Story');
      const result = parseSessionFile(content);

      expect(result.id).toBe('MSSCI-99999');
    });

    it('should handle story IDs with numbers only', () => {
      const content = createNewFormatSession('12345', 'Numeric ID Story');
      const result = parseSessionFile(content);

      expect(result.id).toBe('12345');
    });

    it('should handle story IDs with mixed format (35-7)', () => {
      const content = createNewFormatSession('35-7', 'Mixed Format ID');
      const result = parseSessionFile(content);

      expect(result.id).toBe('35-7');
    });
  });

  describe('AC2: Extract story title from new format', () => {
    it('should extract title from **Title:** field', () => {
      const content = createNewFormatSession('MSSCI-12552', 'Bug: BikeLane panel shows No active story');
      const result = parseSessionFile(content);

      expect(result.title).toBe('Bug: BikeLane panel shows No active story');
    });

    it('should handle titles with special characters', () => {
      const content = createNewFormatSession('TEST-001', "Story with 'quotes' and \"double quotes\"");
      const result = parseSessionFile(content);

      expect(result.title).toBe("Story with 'quotes' and \"double quotes\"");
    });

    it('should handle titles with colons', () => {
      const content = createNewFormatSession('TEST-002', 'Bug: Something: More Details');
      const result = parseSessionFile(content);

      expect(result.title).toBe('Bug: Something: More Details');
    });

    it('should handle multi-word titles', () => {
      const content = createNewFormatSession('TEST-003', 'Add feature for user authentication flow');
      const result = parseSessionFile(content);

      expect(result.title).toBe('Add feature for user authentication flow');
    });
  });

  describe('AC3: Extract phase from new format', () => {
    it('should extract phase from **Phase:** field', () => {
      const content = createNewFormatSession('TEST-001', 'Test', 'red');
      const result = parseSessionFile(content);

      expect(result.phase).toBe('red');
    });

    it('should normalize phase to lowercase', () => {
      const content = `# TEST-001 Session

**Story:** TEST-001
**Title:** Test
**Phase:** RED
`;
      const result = parseSessionFile(content);

      expect(result.phase).toBe('red');
    });

    it('should handle all workflow phases', () => {
      const phases = ['setup', 'red', 'green', 'review', 'approved'];

      for (const phase of phases) {
        const content = createNewFormatSession('TEST-001', 'Test', phase);
        const result = parseSessionFile(content);
        expect(result.phase).toBe(phase);
      }
    });
  });

  describe('AC4: Backward compatibility with old format', () => {
    it('should still parse old format: # Story ID: Title', () => {
      const content = createOldFormatSession('15-3', 'Old Format Story');
      const result = parseSessionFile(content);

      expect(result.id).toBe('15-3');
      expect(result.title).toBe('Old Format Story');
    });

    it('should still parse old format with table-based phase', () => {
      const content = createOldFormatSession('TEST-001', 'Table Phase Story', 'review');
      const result = parseSessionFile(content);

      expect(result.phase).toBe('review');
    });
  });

  describe('AC5: Extract other fields from new format', () => {
    it('should extract points from **Points:** field', () => {
      const content = createNewFormatSession('TEST-001', 'Test');
      const result = parseSessionFile(content);

      expect(result.points).toBe(2);
    });

    it('should extract branch from **Feature Branch:** field', () => {
      const content = createNewFormatSession('TEST-001', 'Test');
      const result = parseSessionFile(content);

      expect(result.branch).toBe('feat/test-branch');
    });

    it('should return null for workflow when no projectDir provided', () => {
      // Workflow phases are loaded from YAML files and require projectDir
      // Without projectDir, parseWorkflowProgress returns null for new format sessions
      const content = createNewFormatSession('TEST-001', 'Test');
      const result = parseSessionFile(content);

      // This is expected - workflow phases require projectDir to load from YAML
      expect(result.workflow).toBeNull();
    });
  });
});

// =============================================================================
// Integration: getStoryInfo with new session format
// =============================================================================

describe('MSSCI-12552: getStoryInfo handles new session format', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bikelane-test-${Date.now()}`);
    mkdirSync(join(testDir, '.session'), { recursive: true });
    mkdirSync(join(testDir, 'sprint'), { recursive: true });

    // Create sprint YAML
    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      `sprint:
  number: 12
  name: "TO Sprint 2604"
epics:
  - id: 64
    title: Cyclist UX Polish
    stories:
      - id: MSSCI-12552
        title: Bug fix
        points: 2
        status: in_progress
`
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return story info for new format session file', () => {
    writeFileSync(
      join(testDir, '.session', 'MSSCI-12552-session.md'),
      createNewFormatSession('MSSCI-12552', 'BikeLane bug fix')
    );

    const result = getStoryInfo(testDir);

    expect(result.id).toBe('MSSCI-12552');
    expect(result.title).toBe('BikeLane bug fix');
    expect(result.phase).toBe('red');
  });

  it('should return story info for MSSCI-format Jira IDs', () => {
    writeFileSync(
      join(testDir, '.session', 'MSSCI-99999-session.md'),
      createJiraFormatSession('MSSCI-99999', 'Enterprise Feature')
    );

    const result = getStoryInfo(testDir);

    expect(result.id).toBe('MSSCI-99999');
    expect(result.title).toBe('Enterprise Feature');
  });

  it('should pick most recently modified session file', () => {
    // Create older session
    writeFileSync(
      join(testDir, '.session', 'OLD-001-session.md'),
      createNewFormatSession('OLD-001', 'Old Story')
    );

    // Wait a bit to ensure different mtime
    const now = Date.now();
    while (Date.now() - now < 100) {
      // spin
    }

    // Create newer session
    writeFileSync(
      join(testDir, '.session', 'NEW-002-session.md'),
      createNewFormatSession('NEW-002', 'New Story')
    );

    const result = getStoryInfo(testDir);

    expect(result.id).toBe('NEW-002');
    expect(result.title).toBe('New Story');
  });

  it('should return null fields when no session file exists', () => {
    const result = getStoryInfo(testDir);

    expect(result.id).toBeNull();
    expect(result.title).toBeNull();
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('MSSCI-12552: Edge cases', () => {
  it('should handle session with only **Story:** field (no title)', () => {
    const content = `# TEST-001 Session

**Story:** TEST-001
**Phase:** red
`;
    const result = parseSessionFile(content);

    expect(result.id).toBe('TEST-001');
    // Title may be null or extracted from elsewhere
  });

  it('should handle whitespace variations in field names', () => {
    const content = `# TEST-001 Session

**Story:**   TEST-001
**Title:**   Lots of spaces
**Phase:**   red
`;
    const result = parseSessionFile(content);

    expect(result.id).toBe('TEST-001');
    expect(result.title).toBe('Lots of spaces');
  });

  it('should handle empty session file gracefully', () => {
    const content = '';
    const result = parseSessionFile(content);

    expect(result.id).toBeUndefined();
    expect(result.title).toBeUndefined();
  });

  it('should handle malformed session file gracefully', () => {
    const content = `Random text
No proper fields
Just garbage
`;
    const result = parseSessionFile(content);

    expect(result.id).toBeUndefined();
    expect(result.title).toBeUndefined();
  });

  it('should handle session file with Windows line endings', () => {
    const content = `# TEST-001 Session\r\n\r\n**Story:** TEST-001\r\n**Title:** Windows Format\r\n**Phase:** red\r\n`;
    const result = parseSessionFile(content);

    expect(result.id).toBe('TEST-001');
    expect(result.title).toBe('Windows Format');
  });
});
