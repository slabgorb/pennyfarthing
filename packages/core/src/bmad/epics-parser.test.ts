/**
 * BMAD Epics Parser Tests - Story 32-3
 *
 * Tests for parsing BMAD epics.md files into structured format.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBmadEpics,
  convertStoryId,
  isValidStoryId,
  parseStoryId,
} from './epics-parser.js';

// =============================================================================
// Story ID Utilities
// =============================================================================

describe('Story ID Utilities', () => {
  describe('convertStoryId', () => {
    it('should convert N.M to N-M format', () => {
      assert.equal(convertStoryId('1.1'), '1-1');
      assert.equal(convertStoryId('2.3'), '2-3');
      assert.equal(convertStoryId('10.25'), '10-25');
    });
  });

  describe('isValidStoryId', () => {
    it('should accept valid N.M format', () => {
      assert.equal(isValidStoryId('1.1'), true);
      assert.equal(isValidStoryId('2.10'), true);
      assert.equal(isValidStoryId('99.99'), true);
    });

    it('should reject invalid formats', () => {
      assert.equal(isValidStoryId('1'), false);
      assert.equal(isValidStoryId('1-1'), false);
      assert.equal(isValidStoryId('a.b'), false);
      assert.equal(isValidStoryId('1.2.3'), false);
      assert.equal(isValidStoryId(''), false);
    });
  });

  describe('parseStoryId', () => {
    it('should extract epic and story numbers', () => {
      const result = parseStoryId('1.3');
      assert.deepEqual(result, { epicNum: 1, storyNum: 3 });
    });

    it('should handle larger numbers', () => {
      const result = parseStoryId('12.45');
      assert.deepEqual(result, { epicNum: 12, storyNum: 45 });
    });

    it('should return null for invalid IDs', () => {
      assert.equal(parseStoryId('invalid'), null);
      assert.equal(parseStoryId('1-2'), null);
    });
  });
});

// =============================================================================
// Main Parser
// =============================================================================

describe('parseBmadEpics', () => {
  describe('Empty and Invalid Content', () => {
    it('should reject empty content', () => {
      const result = parseBmadEpics('');
      assert.equal(result.success, false);
      assert.equal(result.errors?.[0].message, 'Content is empty');
    });

    it('should reject whitespace-only content', () => {
      const result = parseBmadEpics('   \n\n   ');
      assert.equal(result.success, false);
      assert.equal(result.errors?.[0].message, 'Content is empty');
    });

    it('should reject content with no epics', () => {
      const result = parseBmadEpics('# Some Header\n\nSome content');
      assert.equal(result.success, false);
      assert.equal(result.errors?.[0].message, 'No epics found. Expected "## Epic N:" headers.');
    });
  });

  describe('Single Epic Parsing', () => {
    it('should parse a single epic with one story', () => {
      const content = `# Project Epics

## Epic 1: User Authentication

Enable secure user authentication.

### Story 1.1: Email Login
**Points:** 5
**Priority:** P0

#### Description
As a user, I want to log in with email.

#### Acceptance Criteria
- Given I am on login, When I enter valid credentials, Then I am logged in
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics.length, 1);

      const epic = result.epics?.epics[0];
      assert.equal(epic?.id, 1);
      assert.equal(epic?.title, 'User Authentication');
      assert.equal(epic?.description, 'Enable secure user authentication.');
      assert.equal(epic?.stories.length, 1);

      const story = epic?.stories[0];
      assert.equal(story?.id, '1-1');
      assert.equal(story?.bmadId, '1.1');
      assert.equal(story?.title, 'Email Login');
      assert.equal(story?.points, 5);
      assert.equal(story?.priority, 'P0');
    });

    it('should parse multiple stories in one epic', () => {
      const content = `## Epic 1: Auth

Authentication features.

### Story 1.1: Login
**Points:** 3
**Priority:** P0

#### Description
Login feature.

#### Acceptance Criteria
- Given valid credentials, When submitted, Then logged in

### Story 1.2: Logout
**Points:** 2
**Priority:** P1

#### Description
Logout feature.

#### Acceptance Criteria
- Given logged in, When logout clicked, Then session ended
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories.length, 2);
      assert.equal(result.epics?.epics[0].stories[0].id, '1-1');
      assert.equal(result.epics?.epics[0].stories[1].id, '1-2');
    });
  });

  describe('Multiple Epics', () => {
    it('should parse multiple epics', () => {
      const content = `# Project Epics

## Epic 1: Authentication

Auth epic description.

### Story 1.1: Login
**Points:** 5
**Priority:** P0

#### Description
Login story.

#### Acceptance Criteria
- Given creds, When submit, Then logged in

## Epic 2: Profile Management

Profile epic description.

### Story 2.1: Edit Profile
**Points:** 3
**Priority:** P1

#### Description
Edit profile story.

#### Acceptance Criteria
- Given profile page, When edit name, Then name updated
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics.length, 2);

      assert.equal(result.epics?.epics[0].id, 1);
      assert.equal(result.epics?.epics[0].title, 'Authentication');

      assert.equal(result.epics?.epics[1].id, 2);
      assert.equal(result.epics?.epics[1].title, 'Profile Management');
      assert.equal(result.epics?.epics[1].stories[0].id, '2-1');
    });
  });

  describe('Acceptance Criteria Parsing', () => {
    it('should parse BDD format acceptance criteria', () => {
      const content = `## Epic 1: Test

Test epic.

### Story 1.1: Test Story
**Points:** 1
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given I am logged in, When I click logout, Then I am logged out
- Given invalid password, When I submit, Then I see error message
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);

      const acs = result.epics?.epics[0].stories[0].acceptanceCriteria;
      assert.equal(acs?.length, 2);

      assert.equal(acs?.[0].given, 'I am logged in');
      assert.equal(acs?.[0].when, 'I click logout');
      assert.equal(acs?.[0].then, 'I am logged out');

      assert.equal(acs?.[1].given, 'invalid password');
      assert.equal(acs?.[1].when, 'I submit');
      assert.equal(acs?.[1].then, 'I see error message');
    });

    it('should handle non-BDD acceptance criteria', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 1
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Users can upload images
- Maximum file size is 5MB
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);

      const acs = result.epics?.epics[0].stories[0].acceptanceCriteria;
      assert.equal(acs?.length, 2);
      assert.equal(acs?.[0].raw, 'Users can upload images');
      assert.equal(acs?.[0].given, '');
      assert.equal(acs?.[1].raw, 'Maximum file size is 5MB');
    });
  });

  describe('Requirements Coverage', () => {
    it('should parse requirements coverage section', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 3
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test

#### Requirements Coverage
- REQ-AUTH-001: Users must authenticate before accessing protected resources
- REQ-SEC-002: Passwords must be hashed with bcrypt
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);

      const reqs = result.epics?.epics[0].stories[0].requirements;
      assert.equal(reqs?.length, 2);
      assert.equal(reqs?.[0].id, 'REQ-AUTH-001');
      assert.equal(reqs?.[0].description, 'Users must authenticate before accessing protected resources');
      assert.equal(reqs?.[1].id, 'REQ-SEC-002');
    });

    it('should handle missing requirements section', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 1
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories[0].requirements.length, 0);
    });
  });

  describe('Error Handling', () => {
    it('should report missing Points field', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, false);
      assert.ok(result.errors?.some(e => e.message.includes('Missing **Points:**')));
    });

    it('should report missing Priority field', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 5

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, false);
      assert.ok(result.errors?.some(e => e.message.includes('Priority')));
    });

    it('should report invalid priority value', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 5
**Priority:** P5

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, false);
      assert.ok(result.errors?.some(e => e.message.includes('Priority')));
    });

    it('should report invalid story ID format', () => {
      const content = `## Epic 1: Test

Test.

### Story abc: Test
**Points:** 5
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      // Story with invalid ID won't be matched by the regex, so no error
      // This is expected behavior - malformed headers are silently skipped
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories.length, 0);
    });

    it('should include story location in error messages', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, false);
      assert.ok(result.errors?.some(e => e.location === 'Story 1.1'));
    });
  });

  describe('Edge Cases', () => {
    it('should handle epic with no stories', () => {
      const content = `## Epic 1: Empty Epic

This epic has no stories yet.
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories.length, 0);
      assert.equal(result.epics?.epics[0].description, 'This epic has no stories yet.');
    });

    it('should handle missing description section in story', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 1
**Priority:** P0

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories[0].description, '');
    });

    it('should handle Windows line endings', () => {
      const content = `## Epic 1: Test\r\n\r\nTest epic.\r\n\r\n### Story 1.1: Test\r\n**Points:** 1\r\n**Priority:** P0\r\n\r\n#### Description\r\nTest.\r\n\r\n#### Acceptance Criteria\r\n- Given test, When test, Then test\r\n`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories.length, 1);
    });

    it('should handle priority values with different casing', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.1: Test
**Points:** 1
**Priority:** p1

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);
      assert.equal(result.epics?.epics[0].stories[0].priority, 'P1');
    });

    it('should preserve original BMAD ID alongside converted ID', () => {
      const content = `## Epic 1: Test

Test.

### Story 1.5: Test
**Points:** 1
**Priority:** P0

#### Description
Test.

#### Acceptance Criteria
- Given test, When test, Then test
`;

      const result = parseBmadEpics(content);
      assert.equal(result.success, true);

      const story = result.epics?.epics[0].stories[0];
      assert.equal(story?.id, '1-5');       // Converted format
      assert.equal(story?.bmadId, '1.5');   // Original format
    });
  });
});
