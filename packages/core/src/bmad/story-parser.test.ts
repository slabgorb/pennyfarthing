/**
 * Tests for Story 32-2: BMAD Story File Parser
 *
 * These tests define the contract for parsing BMAD story markdown files.
 * Dev will implement parseBmadStory() to pass these tests.
 *
 * BMAD story format:
 * - Required: # Story: [title], ## Status, ## Story, ## Acceptance Criteria
 * - Optional: ## Tasks / Subtasks, ## Dev Notes, ## Dev Agent Record, ## File List
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import the parser function that Dev will implement
// This import will fail until the module is implemented
import {
  parseBmadStory,
  type BmadStory,
  type BmadTask,
  type BmadAcceptanceCriteria,
  type ParseResult as _ParseResult,
  type ParseError as _ParseError,
} from './story-parser.js';

// =============================================================================
// TEST DATA: Valid BMAD story examples
// =============================================================================

const MINIMAL_VALID_STORY = `# Story: Minimal Test Story

## Status
ready-for-dev

## Story
As a user, I want to test, so that I can verify

## Acceptance Criteria
- Given a test, When I run it, Then it passes
`;

const COMPLETE_STORY = `# Story: User Profile Photo Upload

## Status
in-progress

## Story
As a registered user, I want to upload a profile photo, so that other users can identify me visually

## Acceptance Criteria
- Given I am on my profile page, When I click "Upload Photo", Then I see a file picker dialog
- Given I select a valid image (JPG/PNG under 5MB), When I confirm upload, Then my photo appears on my profile
- Given I select an invalid file, When I try to upload, Then I see an appropriate error message
- Given I have an existing photo, When I upload a new one, Then the old photo is replaced

## Tasks / Subtasks
- [x] Create photo upload API endpoint
  - [x] Add file validation (type, size)
  - [x] Implement S3 storage integration
  - [x] Generate thumbnail versions
- [ ] Build frontend upload component
  - [ ] File picker with drag-and-drop
  - [ ] Preview before upload
  - [x] Progress indicator
- [ ] Write integration tests

## Dev Notes
2024-01-15: Started implementation. Using pre-signed S3 URLs for direct upload.
2024-01-16: Hit CORS issue with S3, resolved by updating bucket policy.

## Dev Agent Record
Session: abc123
Commands:
- npm run test:upload -- passed
- aws s3 cp test.jpg s3://bucket/test/ -- verified upload

## File List
- src/api/upload.ts - Created: Photo upload endpoint with S3 integration
- src/components/PhotoUpload.tsx - Created: React component for file selection
- src/utils/imageValidation.ts - Created: File type and size validation
- tests/upload.test.ts - Created: Integration tests for upload flow
`;

const STORY_WITH_NON_BDD_CRITERIA = `# Story: Simple Feature

## Status
ready-for-dev

## Story
As a developer, I want a simple feature, so that I can test non-BDD criteria

## Acceptance Criteria
- Users can log in with email and password
- Password must be at least 8 characters
- Failed login attempts are logged
`;

const STORY_WITH_MIXED_CRITERIA = `# Story: Mixed Criteria Feature

## Status
ready-for-dev

## Story
As a developer, I want mixed criteria, so that I can test both formats

## Acceptance Criteria
- Given valid credentials, When I login, Then I see the dashboard
- Users receive email notifications
- Given invalid password, When I login, Then I see an error
`;

// =============================================================================
// AC1: Parses BMAD story markdown format - extracts all sections
// =============================================================================

describe('BMAD Story Parser (32-2)', () => {

  describe('AC1: Valid story parsing', () => {

    it('should parse a minimal valid story', () => {
      const result = parseBmadStory(MINIMAL_VALID_STORY);

      assert.strictEqual(result.success, true, 'Should successfully parse minimal story');
      assert.ok(result.story, 'Should return story object');
      assert.strictEqual(result.story?.title, 'Minimal Test Story');
      assert.strictEqual(result.story?.status, 'ready-for-dev');
    });

    it('should parse a complete story with all sections', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true, 'Should successfully parse complete story');
      assert.ok(result.story, 'Should return story object');
      assert.strictEqual(result.story?.title, 'User Profile Photo Upload');
      assert.strictEqual(result.story?.status, 'in-progress');
    });

    it('should extract title from H1 header', () => {
      const result = parseBmadStory(MINIMAL_VALID_STORY);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.story?.title, 'Minimal Test Story');
    });

    it('should handle title with special characters', () => {
      const story = `# Story: Feature: User Auth (OAuth 2.0)

## Status
ready-for-dev

## Story
As a user, I want OAuth, so that I can login

## Acceptance Criteria
- Given OAuth, When I login, Then I'm authenticated
`;
      const result = parseBmadStory(story);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.story?.title, 'Feature: User Auth (OAuth 2.0)');
    });

    it('should preserve whitespace in content sections', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      // Dev notes should preserve the timestamps and formatting
      assert.ok(result.story?.devNotes?.includes('2024-01-15:'));
      assert.ok(result.story?.devNotes?.includes('2024-01-16:'));
    });
  });

  // ===========================================================================
  // AC2: Extracts status, ACs, tasks, dev notes - all section content parsed
  // ===========================================================================

  describe('AC2: Section extraction', () => {

    describe('Status section', () => {

      it('should extract ready-for-dev status', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'ready-for-dev');
      });

      it('should extract in-progress status', () => {
        const result = parseBmadStory(COMPLETE_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'in-progress');
      });

      it('should extract review status', () => {
        const story = MINIMAL_VALID_STORY.replace('ready-for-dev', 'review');
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'review');
      });

      it('should extract done status', () => {
        const story = MINIMAL_VALID_STORY.replace('ready-for-dev', 'done');
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'done');
      });

      it('should reject invalid status values', () => {
        const story = MINIMAL_VALID_STORY.replace('ready-for-dev', 'invalid-status');
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false, 'Should reject invalid status');
        assert.ok(result.errors?.some(e => e.section === 'Status'), 'Should report status error');
      });

      it('should trim whitespace from status', () => {
        const story = MINIMAL_VALID_STORY.replace('ready-for-dev', '  in-progress  \n');
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'in-progress');
      });
    });

    describe('Story section (user story)', () => {

      it('should extract user story text', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(
          result.story?.userStory,
          'As a user, I want to test, so that I can verify'
        );
      });

      it('should handle multi-line user stories', () => {
        const story = `# Story: Multi-line Story

## Status
ready-for-dev

## Story
As a product manager,
I want to track feature requests,
so that I can prioritize development effectively

## Acceptance Criteria
- Given a feature, When I track it, Then I see progress
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.ok(result.story?.userStory.includes('product manager'));
        assert.ok(result.story?.userStory.includes('prioritize development'));
      });
    });

    describe('Acceptance Criteria section', () => {

      it('should parse BDD-style criteria (Given/When/Then)', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.acceptanceCriteria.length, 1);

        const ac = result.story?.acceptanceCriteria[0];
        assert.strictEqual(ac?.given, 'a test');
        assert.strictEqual(ac?.when, 'I run it');
        assert.strictEqual(ac?.then, 'it passes');
      });

      it('should parse multiple BDD criteria', () => {
        const result = parseBmadStory(COMPLETE_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.acceptanceCriteria.length, 4);

        // First criterion
        const ac1 = result.story?.acceptanceCriteria[0];
        assert.strictEqual(ac1?.given, 'I am on my profile page');
        assert.strictEqual(ac1?.when, 'I click "Upload Photo"');
        assert.strictEqual(ac1?.then, 'I see a file picker dialog');
      });

      it('should handle non-BDD criteria with raw text', () => {
        const result = parseBmadStory(STORY_WITH_NON_BDD_CRITERIA);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.acceptanceCriteria.length, 3);

        // Non-BDD should have empty given/when/then but populated raw
        const ac1 = result.story?.acceptanceCriteria[0];
        assert.strictEqual(ac1?.raw, 'Users can log in with email and password');
        assert.strictEqual(ac1?.given, '');
        assert.strictEqual(ac1?.when, '');
        assert.strictEqual(ac1?.then, '');
      });

      it('should handle mixed BDD and non-BDD criteria', () => {
        const result = parseBmadStory(STORY_WITH_MIXED_CRITERIA);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.acceptanceCriteria.length, 3);

        // First is BDD
        assert.strictEqual(result.story?.acceptanceCriteria[0]?.given, 'valid credentials');

        // Second is non-BDD
        assert.strictEqual(result.story?.acceptanceCriteria[1]?.raw, 'Users receive email notifications');
        assert.strictEqual(result.story?.acceptanceCriteria[1]?.given, '');

        // Third is BDD
        assert.strictEqual(result.story?.acceptanceCriteria[2]?.given, 'invalid password');
      });

      it('should preserve raw text for all criteria', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        const ac = result.story?.acceptanceCriteria[0];
        assert.strictEqual(ac?.raw, 'Given a test, When I run it, Then it passes');
      });
    });

    describe('Dev Notes section', () => {

      it('should extract dev notes when present', () => {
        const result = parseBmadStory(COMPLETE_STORY);

        assert.strictEqual(result.success, true);
        assert.ok(result.story?.devNotes);
        assert.ok(result.story?.devNotes?.includes('Started implementation'));
        assert.ok(result.story?.devNotes?.includes('CORS issue'));
      });

      it('should return null when dev notes missing', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.devNotes, null);
      });
    });

    describe('Dev Agent Record section', () => {

      it('should extract dev agent record when present', () => {
        const result = parseBmadStory(COMPLETE_STORY);

        assert.strictEqual(result.success, true);
        assert.ok(result.story?.devAgentRecord);
        assert.ok(result.story?.devAgentRecord?.includes('Session: abc123'));
        assert.ok(result.story?.devAgentRecord?.includes('npm run test:upload'));
      });

      it('should return null when dev agent record missing', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.devAgentRecord, null);
      });
    });

    describe('File List section', () => {

      it('should extract file list when present', () => {
        const result = parseBmadStory(COMPLETE_STORY);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.fileList.length, 4);
        assert.ok(result.story?.fileList.includes('src/api/upload.ts - Created: Photo upload endpoint with S3 integration'));
      });

      it('should return empty array when file list missing', () => {
        const result = parseBmadStory(MINIMAL_VALID_STORY);

        assert.strictEqual(result.success, true);
        assert.deepStrictEqual(result.story?.fileList, []);
      });

      it('should handle file list with various formats', () => {
        const story = `# Story: File List Test

## Status
ready-for-dev

## Story
As a user, I want files, so that I can track them

## Acceptance Criteria
- Given files, When I list them, Then I see them

## File List
- src/simple.ts
- src/with-description.ts - Modified: Updated logic
- path/to/nested/file.tsx - Created: New component
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.fileList.length, 3);
      });
    });
  });

  // ===========================================================================
  // AC3: Converts to Pennyfarthing session structure - BmadStory interface
  // ===========================================================================

  describe('AC3: BmadStory interface population', () => {

    it('should return success: true for valid story', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      assert.ok(result.story);
      assert.strictEqual(result.errors, undefined);
    });

    it('should return success: false with errors for invalid story', () => {
      const story = `# Story: Missing Sections

## Status
invalid-status
`;
      const result = parseBmadStory(story);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.story, undefined);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it('should populate all BmadStory fields for complete story', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const story = result.story as BmadStory;

      // All required fields
      assert.strictEqual(typeof story.title, 'string');
      assert.ok(['ready-for-dev', 'in-progress', 'review', 'done'].includes(story.status));
      assert.strictEqual(typeof story.userStory, 'string');
      assert.ok(Array.isArray(story.acceptanceCriteria));

      // All optional fields
      assert.ok(Array.isArray(story.tasks));
      assert.ok(story.devNotes === null || typeof story.devNotes === 'string');
      assert.ok(story.devAgentRecord === null || typeof story.devAgentRecord === 'string');
      assert.ok(Array.isArray(story.fileList));
    });

    it('should have correct types for acceptance criteria', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const ac = result.story?.acceptanceCriteria[0] as BmadAcceptanceCriteria;

      assert.strictEqual(typeof ac.given, 'string');
      assert.strictEqual(typeof ac.when, 'string');
      assert.strictEqual(typeof ac.then, 'string');
      assert.strictEqual(typeof ac.raw, 'string');
    });

    it('should have correct types for tasks', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const task = result.story?.tasks[0] as BmadTask;

      assert.strictEqual(typeof task.text, 'string');
      assert.strictEqual(typeof task.completed, 'boolean');
      // subtasks is optional
      assert.ok(task.subtasks === undefined || Array.isArray(task.subtasks));
    });
  });

  // ===========================================================================
  // AC4: Preserves task checkbox state - [ ] incomplete, [x] complete
  // ===========================================================================

  describe('AC4: Task checkbox parsing', () => {

    it('should parse completed tasks ([x])', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const firstTask = result.story?.tasks[0];
      assert.strictEqual(firstTask?.text, 'Create photo upload API endpoint');
      assert.strictEqual(firstTask?.completed, true);
    });

    it('should parse incomplete tasks ([ ])', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const secondTask = result.story?.tasks[1];
      assert.strictEqual(secondTask?.text, 'Build frontend upload component');
      assert.strictEqual(secondTask?.completed, false);
    });

    it('should parse nested subtasks', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const firstTask = result.story?.tasks[0];

      assert.ok(firstTask?.subtasks);
      assert.strictEqual(firstTask?.subtasks?.length, 3);
      assert.strictEqual(firstTask?.subtasks?.[0].text, 'Add file validation (type, size)');
      assert.strictEqual(firstTask?.subtasks?.[0].completed, true);
    });

    it('should handle mixed completed/incomplete subtasks', () => {
      const result = parseBmadStory(COMPLETE_STORY);

      assert.strictEqual(result.success, true);
      const secondTask = result.story?.tasks[1];

      assert.ok(secondTask?.subtasks);
      // "File picker with drag-and-drop" - incomplete
      assert.strictEqual(secondTask?.subtasks?.[0].completed, false);
      // "Preview before upload" - incomplete
      assert.strictEqual(secondTask?.subtasks?.[1].completed, false);
      // "Progress indicator" - complete
      assert.strictEqual(secondTask?.subtasks?.[2].completed, true);
    });

    it('should return empty tasks array when no tasks section', () => {
      const result = parseBmadStory(MINIMAL_VALID_STORY);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.story?.tasks, []);
    });

    it('should handle tasks without subtasks', () => {
      const story = `# Story: Simple Tasks

## Status
ready-for-dev

## Story
As a user, I want tasks, so that I can track work

## Acceptance Criteria
- Given tasks, When I check them, Then I see status

## Tasks / Subtasks
- [x] First task done
- [ ] Second task pending
- [x] Third task done
`;
      const result = parseBmadStory(story);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.story?.tasks.length, 3);
      assert.strictEqual(result.story?.tasks[0].completed, true);
      assert.strictEqual(result.story?.tasks[1].completed, false);
      assert.strictEqual(result.story?.tasks[2].completed, true);
      // No subtasks
      assert.strictEqual(result.story?.tasks[0].subtasks, undefined);
    });

    it('should handle deeply nested subtasks (2-space indent)', () => {
      const story = `# Story: Deep Nesting

## Status
ready-for-dev

## Story
As a user, I want nested tasks, so that I can organize work

## Acceptance Criteria
- Given nesting, When I parse it, Then hierarchy preserved

## Tasks / Subtasks
- [ ] Top level task
  - [ ] First level subtask
  - [x] Another first level
`;
      const result = parseBmadStory(story);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.story?.tasks.length, 1);
      assert.strictEqual(result.story?.tasks[0].subtasks?.length, 2);
      assert.strictEqual(result.story?.tasks[0].subtasks?.[0].text, 'First level subtask');
      assert.strictEqual(result.story?.tasks[0].subtasks?.[1].completed, true);
    });
  });

  // ===========================================================================
  // AC5: Unit tests - error accumulation and edge cases
  // ===========================================================================

  describe('AC5: Error handling and edge cases', () => {

    describe('Required section validation', () => {

      it('should reject story missing title', () => {
        const story = `## Status
ready-for-dev

## Story
As a user, I want something

## Acceptance Criteria
- Given test, When I run, Then pass
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        assert.ok(result.errors?.some(e => e.section === 'Title'));
      });

      it('should reject story missing status section', () => {
        const story = `# Story: No Status

## Story
As a user, I want something

## Acceptance Criteria
- Given test, When I run, Then pass
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        assert.ok(result.errors?.some(e => e.section === 'Status'));
      });

      it('should reject story missing story section', () => {
        const story = `# Story: No User Story

## Status
ready-for-dev

## Acceptance Criteria
- Given test, When I run, Then pass
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        assert.ok(result.errors?.some(e => e.section === 'Story'));
      });

      it('should reject story missing acceptance criteria', () => {
        const story = `# Story: No ACs

## Status
ready-for-dev

## Story
As a user, I want something
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        assert.ok(result.errors?.some(e => e.section === 'Acceptance Criteria'));
      });
    });

    describe('Error accumulation', () => {

      it('should report multiple errors at once', () => {
        const story = `# Story: Multiple Errors

## Status
invalid-status
`;
        // Missing: valid status, Story section, Acceptance Criteria
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        assert.ok(result.errors && result.errors.length >= 2, 'Should report multiple errors');
      });

      it('should include section name in error', () => {
        const story = `# Story: Bad Status

## Status
not-a-valid-status

## Story
As a user, I want something

## Acceptance Criteria
- Given test, When I run, Then pass
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        const statusError = result.errors?.find(e => e.section === 'Status');
        assert.ok(statusError, 'Should have error for Status section');
      });

      it('should include human-readable error message', () => {
        const story = `# Story: Bad Story

## Status
invalid
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        const error = result.errors?.[0];
        assert.ok(error?.message, 'Error should have message');
        assert.ok(error?.message.length > 0, 'Message should not be empty');
      });
    });

    describe('Edge cases', () => {

      it('should handle empty content', () => {
        const result = parseBmadStory('');

        assert.strictEqual(result.success, false);
        assert.ok(result.errors && result.errors.length > 0);
      });

      it('should handle content with only whitespace', () => {
        const result = parseBmadStory('   \n\n   \t  ');

        assert.strictEqual(result.success, false);
      });

      it('should handle extra blank lines between sections', () => {
        const story = `# Story: Extra Whitespace


## Status

ready-for-dev


## Story

As a user, I want to test


## Acceptance Criteria

- Given test, When I run, Then pass

`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'ready-for-dev');
      });

      it('should handle section headers with extra spaces', () => {
        const story = `# Story:   Spaced Title

## Status
ready-for-dev

##   Story
As a user, I want to test

## Acceptance Criteria
- Given test, When I run, Then pass
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.title, 'Spaced Title');
      });

      it('should handle acceptance criteria with inline code', () => {
        const story = `# Story: Code in ACs

## Status
ready-for-dev

## Story
As a developer, I want to test code references

## Acceptance Criteria
- Given a \`user_id\` parameter, When I call \`getUser()\`, Then I get the user object
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.ok(result.story?.acceptanceCriteria[0].raw.includes('`user_id`'));
      });

      it('should handle Windows line endings (CRLF)', () => {
        const story = '# Story: Windows\r\n\r\n## Status\r\nready-for-dev\r\n\r\n## Story\r\nAs a user, I want Windows support\r\n\r\n## Acceptance Criteria\r\n- Given CRLF, When I parse, Then it works\r\n';
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.title, 'Windows');
      });

      it('should handle Tasks section with alternative header name', () => {
        const story = `# Story: Alt Tasks Header

## Status
ready-for-dev

## Story
As a user, I want flexibility

## Acceptance Criteria
- Given alt header, When I parse, Then tasks found

## Tasks
- [ ] Simple task without "/ Subtasks" suffix
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.tasks.length, 1);
      });

      it('should handle empty acceptance criteria section', () => {
        const story = `# Story: Empty ACs

## Status
ready-for-dev

## Story
As a user, I want to test

## Acceptance Criteria
`;
        const result = parseBmadStory(story);

        assert.strictEqual(result.success, false);
        assert.ok(result.errors?.some(e =>
          e.section === 'Acceptance Criteria' &&
          e.message.toLowerCase().includes('empty')
        ));
      });

      it('should handle uppercase status values', () => {
        const story = MINIMAL_VALID_STORY.replace('ready-for-dev', 'READY-FOR-DEV');
        const result = parseBmadStory(story);

        // Should normalize to lowercase
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.story?.status, 'ready-for-dev');
      });
    });
  });
});

// =============================================================================
// Export types for Dev to implement
// =============================================================================

export interface BmadStoryType {
  title: string;
  status: 'ready-for-dev' | 'in-progress' | 'review' | 'done';
  userStory: string;
  acceptanceCriteria: BmadAcceptanceCriteriaType[];
  tasks: BmadTaskType[];
  devNotes: string | null;
  devAgentRecord: string | null;
  fileList: string[];
}

export interface BmadTaskType {
  text: string;
  completed: boolean;
  subtasks?: BmadTaskType[];
}

export interface BmadAcceptanceCriteriaType {
  given: string;
  when: string;
  then: string;
  raw: string;
}

export interface ParseResultType {
  success: boolean;
  story?: BmadStoryType;
  errors?: ParseErrorType[];
}

export interface ParseErrorType {
  section: string;
  message: string;
  line?: number;
}
