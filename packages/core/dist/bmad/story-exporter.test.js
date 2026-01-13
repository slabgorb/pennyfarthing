/**
 * Tests for Story 32-5: BMAD Story Exporter
 *
 * These tests define the contract for exporting Pennyfarthing sessions to BMAD story format.
 * Dev will implement exportToBmadStory() to pass these tests.
 *
 * Input: SessionData (parsed from .session/{story-id}-session.md)
 * Output: BMAD story markdown string
 *
 * Key mapping:
 * - Pennyfarthing status → BMAD status
 * - Dev Assessment → Dev Notes
 * - Session Log → Dev Agent Record
 * - AC checkboxes → preserved in Acceptance Criteria
 * - Task checkboxes → preserved in Tasks / Subtasks
 *
 * Run with: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
// Import the exporter function that Dev will implement
import { exportToBmadStory, } from './story-exporter.js';
// Import parser for round-trip validation
import { parseBmadStory } from './story-parser.js';
// =============================================================================
// TEST DATA: Session data structures
// =============================================================================
const MINIMAL_SESSION = {
    storyId: '32-5',
    title: 'Session to BMAD story exporter',
    status: 'done',
    userStory: 'As a developer, I want to export sessions to BMAD format, so that external tools can consume our work',
    acceptanceCriteria: [
        { text: 'Exports session to BMAD story format', completed: true },
        { text: 'Populates Dev Agent Record section', completed: true },
    ],
};
const COMPLETE_SESSION = {
    storyId: '34-2',
    title: 'Cyclist health check command',
    status: 'done',
    userStory: 'As a developer, I want a health check command, so that I can diagnose Cyclist setup issues',
    acceptanceCriteria: [
        { text: 'just cyclist-doctor runs scripts/cyclist-doctor.sh', completed: true },
        { text: 'Checks system prereqs (Node >= 18, pnpm, Python 3, Xcode tools, just)', completed: true },
        { text: 'Checks build state (dist/server.js, dist/main.js exist)', completed: true },
        { text: 'Each failure shows specific fix command', completed: true },
        { text: 'Supports --fix flag to auto-run fix commands', completed: true },
        { text: 'Exit 0 if all pass, exit 1 if any fail', completed: true },
    ],
    tasks: [
        {
            text: 'Create cyclist-doctor.sh script',
            completed: true,
            subtasks: [
                { text: 'Add system prereq checks', completed: true },
                { text: 'Add build state checks', completed: true },
                { text: 'Add node-pty checks', completed: true },
            ],
        },
        {
            text: 'Add justfile recipe',
            completed: true,
        },
        {
            text: 'Write integration tests',
            completed: true,
        },
    ],
    devNotes: `2026-01-13: Started implementation. Using bash script for portability.
2026-01-13: Hit issue with set -e and arithmetic. Fixed with || true.
2026-01-13: All 49 tests passing.`,
    devAgentRecord: `Session: 34-2-dev
Commands executed:
- npm test -- Tests passing: 49/49
- just cyclist-doctor -- All 14 checks pass
Files created:
- packages/cyclist/scripts/cyclist-doctor.sh (429 lines)`,
    fileList: [
        'packages/cyclist/scripts/cyclist-doctor.sh',
        'packages/cyclist/tests/34-2-cyclist-health-check.test.ts',
        'justfile',
    ],
};
const SESSION_IN_REVIEW = {
    storyId: '33-3',
    title: 'Cyclist permission UI',
    status: 'needs_review',
    userStory: 'As a user, I want to see and manage permissions visually, so that I can control what Claude Code can do',
    acceptanceCriteria: [
        { text: 'Modal shows current permissions', completed: true },
        { text: 'Can grant new permissions', completed: false },
        { text: 'Can revoke permissions', completed: false },
    ],
};
const SESSION_IN_PROGRESS = {
    storyId: '31-8',
    title: 'Eliminate redundant test runs',
    status: 'in_progress',
    userStory: 'As a developer, I want to skip redundant test runs, so that the TDD flow is faster',
    acceptanceCriteria: [
        { text: 'Cache test results with content hash', completed: false },
        { text: 'Skip tests if cache is fresh', completed: false },
    ],
};
const SESSION_BACKLOG = {
    storyId: '33-5',
    title: 'Permission presets by workflow',
    status: 'backlog',
    userStory: 'As a user, I want workflow-specific permission presets, so that setup is faster',
    acceptanceCriteria: [
        { text: 'Workflows declare required permissions', completed: false },
        { text: 'Auto-prompt for missing permissions', completed: false },
    ],
};
// =============================================================================
// AC1: Exports session to BMAD story format
// =============================================================================
describe('BMAD Story Exporter (32-5)', () => {
    describe('AC1: Exports session to BMAD story format', () => {
        it('should export minimal session to valid BMAD markdown', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true, 'Export should succeed');
            assert.ok(result.markdown, 'Should return markdown string');
            assert.ok(result.markdown.length > 0, 'Markdown should not be empty');
        });
        it('should include story title as H1 header', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('# Story: Session to BMAD story exporter'), 'Should include title as H1');
        });
        it('should include Status section', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Status'), 'Should include Status section');
        });
        it('should include Story section with user story', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Story'), 'Should include Story section');
            assert.ok(result.markdown?.includes('As a developer, I want to export sessions'), 'Should include user story text');
        });
        it('should include Acceptance Criteria section', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Acceptance Criteria'), 'Should include AC section');
        });
        it('should produce markdown that parses successfully', () => {
            const exportResult = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(exportResult.success, true);
            // Round-trip: parse the exported markdown
            const parseResult = parseBmadStory(exportResult.markdown);
            assert.strictEqual(parseResult.success, true, 'Exported markdown should be parseable');
        });
        it('should preserve story title in round-trip', () => {
            const exportResult = exportToBmadStory(COMPLETE_SESSION);
            const parseResult = parseBmadStory(exportResult.markdown);
            assert.strictEqual(parseResult.success, true);
            assert.strictEqual(parseResult.story?.title, 'Cyclist health check command', 'Title should survive round-trip');
        });
        it('should preserve user story in round-trip', () => {
            const exportResult = exportToBmadStory(MINIMAL_SESSION);
            const parseResult = parseBmadStory(exportResult.markdown);
            assert.strictEqual(parseResult.success, true);
            assert.ok(parseResult.story?.userStory.includes('export sessions to BMAD format'), 'User story should survive round-trip');
        });
        it('should handle session without optional fields', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            // Should still be valid BMAD format
            const parseResult = parseBmadStory(result.markdown);
            assert.strictEqual(parseResult.success, true);
        });
        it('should handle complete session with all fields', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            // Should include all optional sections
            assert.ok(result.markdown?.includes('## Tasks'), 'Should include Tasks section');
            assert.ok(result.markdown?.includes('## Dev Notes'), 'Should include Dev Notes');
            assert.ok(result.markdown?.includes('## Dev Agent Record'), 'Should include Dev Agent Record');
            assert.ok(result.markdown?.includes('## File List'), 'Should include File List');
        });
        it('should return error for missing required fields', () => {
            const invalidSession = {
                storyId: '99-1',
                // Missing: title, status, userStory, acceptanceCriteria
            };
            const result = exportToBmadStory(invalidSession);
            assert.strictEqual(result.success, false, 'Should fail for invalid session');
            assert.ok(result.errors && result.errors.length > 0, 'Should report errors');
        });
        it('should return error for empty acceptance criteria', () => {
            const sessionNoAC = {
                storyId: '99-2',
                title: 'No ACs',
                status: 'done',
                userStory: 'As a user, I want something',
                acceptanceCriteria: [],
            };
            const result = exportToBmadStory(sessionNoAC);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors?.some(e => e.message.toLowerCase().includes('acceptance criteria')), 'Should report AC error');
        });
    });
    // ===========================================================================
    // AC2: Populates Dev Agent Record section
    // ===========================================================================
    describe('AC2: Populates Dev Agent Record section', () => {
        it('should include Dev Agent Record section when devAgentRecord provided', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Dev Agent Record'), 'Should include Dev Agent Record section');
        });
        it('should include devAgentRecord content', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('Session: 34-2-dev'), 'Should include session ID from agent record');
            assert.ok(result.markdown?.includes('npm test'), 'Should include commands from agent record');
        });
        it('should omit Dev Agent Record section when not provided', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            // Should not include the section header if no content
            const lines = result.markdown?.split('\n') || [];
            const devAgentHeaders = lines.filter(l => l.trim() === '## Dev Agent Record');
            assert.strictEqual(devAgentHeaders.length, 0, 'Should not include empty Dev Agent Record section');
        });
        it('should include Dev Notes section when devNotes provided', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Dev Notes'), 'Should include Dev Notes section');
            assert.ok(result.markdown?.includes('Started implementation'), 'Should include dev notes content');
        });
        it('should preserve timestamps in dev notes', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('2026-01-13:'), 'Should preserve timestamp format');
        });
        it('should preserve multiline dev agent records', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('Commands executed:'), 'Should preserve formatting');
            assert.ok(result.markdown?.includes('Files created:'), 'Should preserve all lines');
        });
    });
    // ===========================================================================
    // AC3: Updates File List with changed files
    // ===========================================================================
    describe('AC3: Updates File List with changed files', () => {
        it('should include File List section when fileList provided', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## File List'), 'Should include File List section');
        });
        it('should list all files from fileList', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('packages/cyclist/scripts/cyclist-doctor.sh'), 'Should include first file');
            assert.ok(result.markdown?.includes('packages/cyclist/tests/34-2-cyclist-health-check.test.ts'), 'Should include test file');
            assert.ok(result.markdown?.includes('justfile'), 'Should include justfile');
        });
        it('should format files as bullet list', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            // Each file should be on a line starting with "- "
            assert.ok(result.markdown?.includes('- packages/cyclist/scripts/cyclist-doctor.sh'), 'Files should be bullet points');
        });
        it('should omit File List section when not provided', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            const lines = result.markdown?.split('\n') || [];
            const fileListHeaders = lines.filter(l => l.trim() === '## File List');
            assert.strictEqual(fileListHeaders.length, 0, 'Should not include empty File List section');
        });
        it('should omit File List section when empty array', () => {
            const sessionEmptyFiles = {
                ...MINIMAL_SESSION,
                fileList: [],
            };
            const result = exportToBmadStory(sessionEmptyFiles);
            assert.strictEqual(result.success, true);
            const lines = result.markdown?.split('\n') || [];
            const fileListHeaders = lines.filter(l => l.trim() === '## File List');
            assert.strictEqual(fileListHeaders.length, 0, 'Should not include File List for empty array');
        });
        it('should preserve file paths with descriptions', () => {
            const sessionWithDescriptions = {
                ...MINIMAL_SESSION,
                fileList: [
                    'src/api/upload.ts - Created: Photo upload endpoint',
                    'src/utils/validation.ts - Modified: Added size check',
                ],
            };
            const result = exportToBmadStory(sessionWithDescriptions);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('src/api/upload.ts - Created: Photo upload endpoint'), 'Should preserve file with description');
        });
        it('should handle files with special characters in path', () => {
            const sessionSpecialPaths = {
                ...MINIMAL_SESSION,
                fileList: [
                    'src/components/UserProfile.tsx',
                    'tests/__snapshots__/App.test.tsx.snap',
                ],
            };
            const result = exportToBmadStory(sessionSpecialPaths);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('tests/__snapshots__/App.test.tsx.snap'), 'Should handle paths with special chars');
        });
    });
    // ===========================================================================
    // AC4: Marks completed tasks with [x]
    // ===========================================================================
    describe('AC4: Marks completed tasks with [x]', () => {
        it('should include Tasks section when tasks provided', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Tasks'), 'Should include Tasks section');
        });
        it('should mark completed tasks with [x]', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('[x] Create cyclist-doctor.sh script'), 'Should mark completed task with [x]');
        });
        it('should mark incomplete tasks with [ ]', () => {
            const sessionWithIncomplete = {
                ...MINIMAL_SESSION,
                tasks: [
                    { text: 'Completed task', completed: true },
                    { text: 'Incomplete task', completed: false },
                ],
            };
            const result = exportToBmadStory(sessionWithIncomplete);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('[x] Completed task'), 'Should mark completed with [x]');
            assert.ok(result.markdown?.includes('[ ] Incomplete task'), 'Should mark incomplete with [ ]');
        });
        it('should include nested subtasks with proper indentation', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            // Subtasks should be indented with 2 spaces
            assert.ok(result.markdown?.includes('  - [x] Add system prereq checks'), 'Should include indented subtasks');
        });
        it('should preserve subtask completion state', () => {
            const sessionMixedSubtasks = {
                ...MINIMAL_SESSION,
                tasks: [
                    {
                        text: 'Parent task',
                        completed: false,
                        subtasks: [
                            { text: 'Done subtask', completed: true },
                            { text: 'Pending subtask', completed: false },
                        ],
                    },
                ],
            };
            const result = exportToBmadStory(sessionMixedSubtasks);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('  - [x] Done subtask'), 'Completed subtask should have [x]');
            assert.ok(result.markdown?.includes('  - [ ] Pending subtask'), 'Incomplete subtask should have [ ]');
        });
        it('should omit Tasks section when not provided', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            const lines = result.markdown?.split('\n') || [];
            const taskHeaders = lines.filter(l => l.trim().startsWith('## Tasks'));
            assert.strictEqual(taskHeaders.length, 0, 'Should not include empty Tasks section');
        });
        it('should omit Tasks section when empty array', () => {
            const sessionEmptyTasks = {
                ...MINIMAL_SESSION,
                tasks: [],
            };
            const result = exportToBmadStory(sessionEmptyTasks);
            assert.strictEqual(result.success, true);
            const lines = result.markdown?.split('\n') || [];
            const taskHeaders = lines.filter(l => l.trim().startsWith('## Tasks'));
            assert.strictEqual(taskHeaders.length, 0, 'Should not include Tasks for empty array');
        });
        it('should preserve task text with special characters', () => {
            const sessionSpecialTasks = {
                ...MINIMAL_SESSION,
                tasks: [
                    { text: 'Add `--fix` flag support', completed: true },
                    { text: 'Handle "quoted" strings', completed: false },
                ],
            };
            const result = exportToBmadStory(sessionSpecialTasks);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('[x] Add `--fix` flag support'), 'Should preserve backticks');
            assert.ok(result.markdown?.includes('[ ] Handle "quoted" strings'), 'Should preserve quotes');
        });
        it('should round-trip task completion state through parser', () => {
            const exportResult = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(exportResult.success, true);
            const parseResult = parseBmadStory(exportResult.markdown);
            assert.strictEqual(parseResult.success, true);
            // First task should be completed
            assert.strictEqual(parseResult.story?.tasks[0]?.completed, true, 'First task should be completed after round-trip');
            // First task should have subtasks
            assert.ok(parseResult.story?.tasks[0]?.subtasks?.length === 3, 'Should preserve subtask count');
        });
    });
    // ===========================================================================
    // AC5: Sets appropriate status (review/done)
    // ===========================================================================
    describe('AC5: Sets appropriate status (review/done)', () => {
        it('should map done status to BMAD done', () => {
            const result = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('## Status\ndone') ||
                result.markdown?.includes('## Status\r\ndone'), 'Should output done status');
            // Verify via parser
            const parseResult = parseBmadStory(result.markdown);
            assert.strictEqual(parseResult.story?.status, 'done');
        });
        it('should map needs_review status to BMAD review', () => {
            const result = exportToBmadStory(SESSION_IN_REVIEW);
            assert.strictEqual(result.success, true);
            const parseResult = parseBmadStory(result.markdown);
            assert.strictEqual(parseResult.story?.status, 'review', 'needs_review should map to review');
        });
        it('should map in_progress status to BMAD in-progress', () => {
            const result = exportToBmadStory(SESSION_IN_PROGRESS);
            assert.strictEqual(result.success, true);
            const parseResult = parseBmadStory(result.markdown);
            assert.strictEqual(parseResult.story?.status, 'in-progress', 'in_progress should map to in-progress');
        });
        it('should map backlog status to BMAD ready-for-dev', () => {
            const result = exportToBmadStory(SESSION_BACKLOG);
            assert.strictEqual(result.success, true);
            const parseResult = parseBmadStory(result.markdown);
            assert.strictEqual(parseResult.story?.status, 'ready-for-dev', 'backlog should map to ready-for-dev');
        });
        it('should handle approved status as review', () => {
            const sessionApproved = {
                ...MINIMAL_SESSION,
                status: 'approved',
            };
            const result = exportToBmadStory(sessionApproved);
            assert.strictEqual(result.success, true);
            const parseResult = parseBmadStory(result.markdown);
            // approved maps to review (awaiting merge)
            assert.strictEqual(parseResult.story?.status, 'review', 'approved should map to review');
        });
        it('should reject invalid status values', () => {
            const sessionBadStatus = {
                ...MINIMAL_SESSION,
                status: 'invalid_status',
            };
            const result = exportToBmadStory(sessionBadStatus);
            assert.strictEqual(result.success, false, 'Should fail for invalid status');
            assert.ok(result.errors?.some(e => e.field === 'status'), 'Should report status error');
        });
        it('should handle status case-insensitively', () => {
            const sessionUppercase = {
                ...MINIMAL_SESSION,
                status: 'DONE',
            };
            const result = exportToBmadStory(sessionUppercase);
            // Should normalize and succeed
            assert.strictEqual(result.success, true);
            const parseResult = parseBmadStory(result.markdown);
            assert.strictEqual(parseResult.story?.status, 'done');
        });
    });
    // ===========================================================================
    // Edge cases and error handling
    // ===========================================================================
    describe('Edge cases and error handling', () => {
        it('should handle special characters in title', () => {
            const sessionSpecialTitle = {
                ...MINIMAL_SESSION,
                title: 'Feature: OAuth 2.0 (with PKCE)',
            };
            const result = exportToBmadStory(sessionSpecialTitle);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('# Story: Feature: OAuth 2.0 (with PKCE)'), 'Should preserve special characters in title');
        });
        it('should handle multiline user story', () => {
            const sessionMultiline = {
                ...MINIMAL_SESSION,
                userStory: `As a product manager,
I want to track feature requests,
so that I can prioritize development effectively`,
            };
            const result = exportToBmadStory(sessionMultiline);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('product manager'), 'Should include multiline user story');
        });
        it('should handle empty optional string fields', () => {
            const sessionEmptyStrings = {
                ...MINIMAL_SESSION,
                devNotes: '',
                devAgentRecord: '',
            };
            const result = exportToBmadStory(sessionEmptyStrings);
            assert.strictEqual(result.success, true);
            // Empty strings should be treated same as undefined - omit sections
            const lines = result.markdown?.split('\n') || [];
            const devNotesHeaders = lines.filter(l => l.trim() === '## Dev Notes');
            assert.strictEqual(devNotesHeaders.length, 0, 'Should not include empty Dev Notes section');
        });
        it('should handle acceptance criteria with BDD format', () => {
            const sessionBDD = {
                ...MINIMAL_SESSION,
                acceptanceCriteria: [
                    {
                        text: 'Given valid credentials, When I login, Then I see the dashboard',
                        completed: true,
                    },
                ],
            };
            const result = exportToBmadStory(sessionBDD);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('Given valid credentials'), 'Should preserve BDD format');
        });
        it('should handle acceptance criteria with inline code', () => {
            const sessionCode = {
                ...MINIMAL_SESSION,
                acceptanceCriteria: [
                    { text: 'Function `getUser()` returns user object', completed: true },
                ],
            };
            const result = exportToBmadStory(sessionCode);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('`getUser()`'), 'Should preserve inline code');
        });
        it('should produce consistent output for same input', () => {
            const result1 = exportToBmadStory(COMPLETE_SESSION);
            const result2 = exportToBmadStory(COMPLETE_SESSION);
            assert.strictEqual(result1.success, true);
            assert.strictEqual(result2.success, true);
            assert.strictEqual(result1.markdown, result2.markdown, 'Same input should produce identical output');
        });
        it('should handle very long file lists', () => {
            const manyFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);
            const sessionManyFiles = {
                ...MINIMAL_SESSION,
                fileList: manyFiles,
            };
            const result = exportToBmadStory(sessionManyFiles);
            assert.strictEqual(result.success, true);
            assert.ok(result.markdown?.includes('src/file49.ts'), 'Should include all files');
        });
        it('should handle deeply nested subtasks', () => {
            const sessionDeepNesting = {
                ...MINIMAL_SESSION,
                tasks: [
                    {
                        text: 'Top level',
                        completed: false,
                        subtasks: [
                            {
                                text: 'Level 1',
                                completed: true,
                                subtasks: [
                                    { text: 'Level 2', completed: false },
                                ],
                            },
                        ],
                    },
                ],
            };
            const result = exportToBmadStory(sessionDeepNesting);
            assert.strictEqual(result.success, true);
            // Should at least include top level and first level subtasks
            assert.ok(result.markdown?.includes('[ ] Top level'), 'Should include top level');
            assert.ok(result.markdown?.includes('[x] Level 1'), 'Should include first level subtask');
        });
    });
    // ===========================================================================
    // Export options
    // ===========================================================================
    describe('Export options', () => {
        it('should accept optional export options', () => {
            const options = {
                includeEmptySections: true,
            };
            const result = exportToBmadStory(MINIMAL_SESSION, options);
            assert.strictEqual(result.success, true);
        });
        it('should include empty sections when includeEmptySections is true', () => {
            const options = {
                includeEmptySections: true,
            };
            const result = exportToBmadStory(MINIMAL_SESSION, options);
            assert.strictEqual(result.success, true);
            // Should include optional sections even when empty
            assert.ok(result.markdown?.includes('## Dev Notes'), 'Should include empty Dev Notes with option');
        });
        it('should default to excluding empty sections', () => {
            const result = exportToBmadStory(MINIMAL_SESSION);
            assert.strictEqual(result.success, true);
            // Default behavior: no empty sections
            const lines = result.markdown?.split('\n') || [];
            const devNotesHeaders = lines.filter(l => l.trim() === '## Dev Notes');
            assert.strictEqual(devNotesHeaders.length, 0, 'Default should exclude empty sections');
        });
    });
});
//# sourceMappingURL=story-exporter.test.js.map