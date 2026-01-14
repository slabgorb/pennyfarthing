/**
 * BMAD Status Sync Tests - Story 32-6
 *
 * Tests for bidirectional sync between Pennyfarthing and BMAD sprint status.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
// Story ID conversion
bmadIdToPenny, pennyIdToBmad, isValidBmadStoryId, isValidPennyStoryId, 
// Status mapping
mapBmadToPennyStatus, mapPennyToBmadStatus, 
// AC1: Parse
parseBmadSprintStatus, 
// AC2: Import
convertBmadStoryToPenny, importFromBmadStatus, 
// AC3: Export
convertPennyStoryToBmad, exportToSprintStatus, 
// AC5: Conflicts
detectConflicts, } from './status-sync.js';
// =============================================================================
// Test Fixtures
// =============================================================================
const VALID_BMAD_YAML = `
sprint:
  number: 10
  goal: "Complete user authentication"
  start_date: 2024-01-15
  end_date: 2024-01-26

stories:
  - id: "1.1"
    title: "Email/Password Login"
    epic: "User Authentication"
    status: done
    assignee: "Alice Chen"
    points: 5
    priority: P0
    started: 2024-01-15
    completed: 2024-01-17

  - id: "1.2"
    title: "OAuth Integration"
    status: in-progress
    assignee: "Bob Smith"
    points: 8
    priority: P1
    started: 2024-01-18

  - id: "2.1"
    title: "Edit Profile"
    status: ready-for-dev
    points: 3
    priority: P1

metrics:
  total_points: 16
  completed_points: 5
  in_progress_points: 8
`;
const BLOCKED_STORY_YAML = `
sprint:
  number: 10
  goal: "Test blocked status"
  start_date: 2024-01-15
  end_date: 2024-01-26

stories:
  - id: "1.3"
    title: "Password Reset Flow"
    status: blocked
    points: 3
    priority: P1
    blockers:
      - "Waiting for email service"
      - "Need API keys"

metrics:
  total_points: 3
  completed_points: 0
`;
const MINIMAL_BMAD_YAML = `
sprint:
  number: 1
  goal: "Minimal sprint"
  start_date: 2024-01-01
  end_date: 2024-01-14

stories:
  - id: "1.1"
    title: "Simple story"
    status: ready-for-dev
    points: 1
    priority: P2

metrics:
  total_points: 1
  completed_points: 0
`;
// =============================================================================
// Story ID Conversion Tests
// =============================================================================
describe('Story ID Conversion', () => {
    describe('bmadIdToPenny', () => {
        it('converts single dot to dash', () => {
            assert.strictEqual(bmadIdToPenny('1.1'), '1-1');
        });
        it('converts multiple dots to dashes', () => {
            assert.strictEqual(bmadIdToPenny('32.6'), '32-6');
        });
        it('handles larger numbers', () => {
            assert.strictEqual(bmadIdToPenny('100.99'), '100-99');
        });
    });
    describe('pennyIdToBmad', () => {
        it('converts single dash to dot', () => {
            assert.strictEqual(pennyIdToBmad('1-1'), '1.1');
        });
        it('converts multiple dashes to dots', () => {
            assert.strictEqual(pennyIdToBmad('32-6'), '32.6');
        });
        it('handles larger numbers', () => {
            assert.strictEqual(pennyIdToBmad('100-99'), '100.99');
        });
    });
    describe('isValidBmadStoryId', () => {
        it('returns true for valid dot notation', () => {
            assert.strictEqual(isValidBmadStoryId('1.1'), true);
            assert.strictEqual(isValidBmadStoryId('32.6'), true);
            assert.strictEqual(isValidBmadStoryId('100.99'), true);
        });
        it('returns false for dash notation', () => {
            assert.strictEqual(isValidBmadStoryId('1-1'), false);
        });
        it('returns false for invalid formats', () => {
            assert.strictEqual(isValidBmadStoryId('1'), false);
            assert.strictEqual(isValidBmadStoryId('1.'), false);
            assert.strictEqual(isValidBmadStoryId('.1'), false);
            assert.strictEqual(isValidBmadStoryId('a.b'), false);
        });
    });
    describe('isValidPennyStoryId', () => {
        it('returns true for valid dash notation', () => {
            assert.strictEqual(isValidPennyStoryId('1-1'), true);
            assert.strictEqual(isValidPennyStoryId('32-6'), true);
            assert.strictEqual(isValidPennyStoryId('100-99'), true);
        });
        it('returns false for dot notation', () => {
            assert.strictEqual(isValidPennyStoryId('1.1'), false);
        });
        it('returns false for invalid formats', () => {
            assert.strictEqual(isValidPennyStoryId('1'), false);
            assert.strictEqual(isValidPennyStoryId('1-'), false);
            assert.strictEqual(isValidPennyStoryId('-1'), false);
        });
    });
});
// =============================================================================
// AC4: Status Mapping Tests
// =============================================================================
describe('AC4: Status Mapping', () => {
    describe('mapBmadToPennyStatus', () => {
        it('maps ready-for-dev to backlog', () => {
            assert.strictEqual(mapBmadToPennyStatus('ready-for-dev'), 'backlog');
        });
        it('maps in-progress to in_progress', () => {
            assert.strictEqual(mapBmadToPennyStatus('in-progress'), 'in_progress');
        });
        it('maps review to needs_review', () => {
            assert.strictEqual(mapBmadToPennyStatus('review'), 'needs_review');
        });
        it('maps done to done', () => {
            assert.strictEqual(mapBmadToPennyStatus('done'), 'done');
        });
        it('maps blocked to backlog', () => {
            assert.strictEqual(mapBmadToPennyStatus('blocked'), 'backlog');
        });
    });
    describe('mapPennyToBmadStatus', () => {
        it('maps backlog to ready-for-dev', () => {
            assert.strictEqual(mapPennyToBmadStatus('backlog'), 'ready-for-dev');
        });
        it('maps in_progress to in-progress', () => {
            assert.strictEqual(mapPennyToBmadStatus('in_progress'), 'in-progress');
        });
        it('maps needs_review to review', () => {
            assert.strictEqual(mapPennyToBmadStatus('needs_review'), 'review');
        });
        it('maps approved to review', () => {
            assert.strictEqual(mapPennyToBmadStatus('approved'), 'review');
        });
        it('maps done to done', () => {
            assert.strictEqual(mapPennyToBmadStatus('done'), 'done');
        });
    });
    describe('round-trip mapping', () => {
        it('backlog round-trips correctly', () => {
            const penny = 'backlog';
            const bmad = mapPennyToBmadStatus(penny);
            const back = mapBmadToPennyStatus(bmad);
            assert.strictEqual(back, penny);
        });
        it('in_progress round-trips correctly', () => {
            const penny = 'in_progress';
            const bmad = mapPennyToBmadStatus(penny);
            const back = mapBmadToPennyStatus(bmad);
            assert.strictEqual(back, penny);
        });
        it('done round-trips correctly', () => {
            const penny = 'done';
            const bmad = mapPennyToBmadStatus(penny);
            const back = mapBmadToPennyStatus(bmad);
            assert.strictEqual(back, penny);
        });
    });
});
// =============================================================================
// AC1: Parse BMAD Sprint Status Tests
// =============================================================================
describe('AC1: parseBmadSprintStatus', () => {
    it('parses valid BMAD sprint status YAML', () => {
        const result = parseBmadSprintStatus(VALID_BMAD_YAML);
        assert.strictEqual(result.success, true);
        assert.ok(result.data);
        assert.strictEqual(result.data.sprint.number, 10);
        assert.strictEqual(result.data.sprint.goal, 'Complete user authentication');
        assert.strictEqual(result.data.stories.length, 3);
    });
    it('parses story fields correctly', () => {
        const result = parseBmadSprintStatus(VALID_BMAD_YAML);
        assert.ok(result.data);
        const story = result.data.stories[0];
        assert.strictEqual(story.id, '1.1');
        assert.strictEqual(story.title, 'Email/Password Login');
        assert.strictEqual(story.epic, 'User Authentication');
        assert.strictEqual(story.status, 'done');
        assert.strictEqual(story.assignee, 'Alice Chen');
        assert.strictEqual(story.points, 5);
        assert.strictEqual(story.priority, 'P0');
        assert.strictEqual(story.started, '2024-01-15');
        assert.strictEqual(story.completed, '2024-01-17');
    });
    it('parses metrics correctly', () => {
        const result = parseBmadSprintStatus(VALID_BMAD_YAML);
        assert.ok(result.data);
        assert.strictEqual(result.data.metrics.total_points, 16);
        assert.strictEqual(result.data.metrics.completed_points, 5);
        assert.strictEqual(result.data.metrics.in_progress_points, 8);
    });
    it('handles minimal valid YAML', () => {
        const result = parseBmadSprintStatus(MINIMAL_BMAD_YAML);
        assert.strictEqual(result.success, true);
        assert.ok(result.data);
        assert.strictEqual(result.data.stories.length, 1);
    });
    it('handles blocked stories with blockers array', () => {
        const result = parseBmadSprintStatus(BLOCKED_STORY_YAML);
        assert.strictEqual(result.success, true);
        assert.ok(result.data);
        const story = result.data.stories[0];
        assert.strictEqual(story.status, 'blocked');
        assert.ok(story.blockers);
        assert.strictEqual(story.blockers.length, 2);
        assert.strictEqual(story.blockers[0], 'Waiting for email service');
    });
    it('returns errors for invalid YAML', () => {
        const result = parseBmadSprintStatus('not: valid: yaml: {{');
        assert.strictEqual(result.success, false);
        assert.ok(result.errors);
        assert.ok(result.errors.some((e) => e.field === 'yaml'));
    });
    it('returns errors for missing sprint section', () => {
        const yaml = `
stories:
  - id: "1.1"
    title: "Story"
    status: done
    points: 1
    priority: P1
metrics:
  total_points: 1
  completed_points: 1
`;
        const result = parseBmadSprintStatus(yaml);
        assert.strictEqual(result.success, false);
        assert.ok(result.errors);
        assert.ok(result.errors.some((e) => e.field === 'sprint'));
    });
    it('returns errors for invalid story ID format', () => {
        const yaml = `
sprint:
  number: 1
  goal: "Test"
  start_date: 2024-01-01
  end_date: 2024-01-14
stories:
  - id: "invalid"
    title: "Story"
    status: done
    points: 1
    priority: P1
metrics:
  total_points: 1
  completed_points: 1
`;
        const result = parseBmadSprintStatus(yaml);
        assert.strictEqual(result.success, false);
        assert.ok(result.errors);
        assert.ok(result.errors.some((e) => e.message.includes('Invalid BMAD story ID')));
    });
    it('returns errors for invalid status', () => {
        const yaml = `
sprint:
  number: 1
  goal: "Test"
  start_date: 2024-01-01
  end_date: 2024-01-14
stories:
  - id: "1.1"
    title: "Story"
    status: invalid-status
    points: 1
    priority: P1
metrics:
  total_points: 1
  completed_points: 1
`;
        const result = parseBmadSprintStatus(yaml);
        assert.strictEqual(result.success, false);
        assert.ok(result.errors);
        assert.ok(result.errors.some((e) => e.message.includes('Invalid status')));
    });
});
// =============================================================================
// AC2: Import BMAD to Pennyfarthing Tests
// =============================================================================
describe('AC2: Import BMAD to Pennyfarthing', () => {
    describe('convertBmadStoryToPenny', () => {
        it('converts story ID from dot to dash notation', () => {
            const bmad = {
                id: '32.6',
                title: 'Test Story',
                status: 'ready-for-dev',
                points: 2,
                priority: 'P1',
            };
            const penny = convertBmadStoryToPenny(bmad);
            assert.strictEqual(penny.id, '32-6');
        });
        it('maps status correctly', () => {
            const bmad = {
                id: '1.1',
                title: 'Test',
                status: 'in-progress',
                points: 3,
                priority: 'P0',
            };
            const penny = convertBmadStoryToPenny(bmad);
            assert.strictEqual(penny.status, 'in_progress');
        });
        it('preserves optional fields', () => {
            const bmad = {
                id: '1.1',
                title: 'Test',
                status: 'done',
                points: 5,
                priority: 'P0',
                assignee: 'Alice',
                started: '2024-01-15',
                completed: '2024-01-17',
            };
            const penny = convertBmadStoryToPenny(bmad);
            assert.strictEqual(penny.assigned_to, 'Alice');
            assert.strictEqual(penny.started, '2024-01-15');
            assert.strictEqual(penny.completed, '2024-01-17');
        });
        it('converts blocked status with blockers to blocked_reason', () => {
            const bmad = {
                id: '1.3',
                title: 'Blocked Story',
                status: 'blocked',
                points: 3,
                priority: 'P1',
                blockers: ['Reason 1', 'Reason 2'],
            };
            const penny = convertBmadStoryToPenny(bmad);
            assert.strictEqual(penny.status, 'backlog');
            assert.strictEqual(penny.blocked_reason, 'Reason 1; Reason 2');
        });
    });
    describe('importFromBmadStatus', () => {
        it('updates existing stories', () => {
            const bmadStatus = {
                sprint: { number: 10, goal: 'Test', start_date: '2024-01-01', end_date: '2024-01-14' },
                stories: [
                    { id: '1.1', title: 'Updated Story', status: 'done', points: 3, priority: 'P1' },
                ],
                metrics: { total_points: 3, completed_points: 3 },
            };
            const existing = [
                { id: '1-1', title: 'Original Story', status: 'in_progress', points: 3, priority: 'P1' },
            ];
            const result = importFromBmadStatus(bmadStatus, existing);
            assert.strictEqual(result.success, true);
            assert.ok(result.updatedStories);
            assert.ok(result.updatedStories.some((u) => u.id === '1-1' && u.field === 'status'));
        });
        it('adds new stories from BMAD', () => {
            const bmadStatus = {
                sprint: { number: 10, goal: 'Test', start_date: '2024-01-01', end_date: '2024-01-14' },
                stories: [
                    { id: '2.1', title: 'New Story', status: 'ready-for-dev', points: 2, priority: 'P2' },
                ],
                metrics: { total_points: 2, completed_points: 0 },
            };
            const existing = [];
            const result = importFromBmadStatus(bmadStatus, existing);
            assert.strictEqual(result.success, true);
            assert.ok(result.updatedStories);
            assert.ok(result.updatedStories.some((u) => u.id === '2-1' && u.field === '_new'));
        });
        it('tracks all field changes', () => {
            const bmadStatus = {
                sprint: { number: 10, goal: 'Test', start_date: '2024-01-01', end_date: '2024-01-14' },
                stories: [
                    {
                        id: '1.1',
                        title: 'Story',
                        status: 'done',
                        points: 3,
                        priority: 'P1',
                        assignee: 'New Person',
                        completed: '2024-01-20',
                    },
                ],
                metrics: { total_points: 3, completed_points: 3 },
            };
            const existing = [
                {
                    id: '1-1',
                    title: 'Story',
                    status: 'in_progress',
                    points: 3,
                    priority: 'P1',
                    assigned_to: 'Old Person',
                },
            ];
            const result = importFromBmadStatus(bmadStatus, existing);
            assert.strictEqual(result.success, true);
            assert.ok(result.updatedStories);
            const statusUpdate = result.updatedStories.find((u) => u.field === 'status');
            assert.ok(statusUpdate);
            assert.strictEqual(statusUpdate.oldValue, 'in_progress');
            assert.strictEqual(statusUpdate.newValue, 'done');
            const assigneeUpdate = result.updatedStories.find((u) => u.field === 'assigned_to');
            assert.ok(assigneeUpdate);
            assert.strictEqual(assigneeUpdate.oldValue, 'Old Person');
            assert.strictEqual(assigneeUpdate.newValue, 'New Person');
        });
    });
});
// =============================================================================
// AC3: Export Pennyfarthing to BMAD Tests
// =============================================================================
describe('AC3: Export Pennyfarthing to BMAD', () => {
    describe('convertPennyStoryToBmad', () => {
        it('converts story ID from dash to dot notation', () => {
            const penny = {
                id: '32-6',
                title: 'Test Story',
                status: 'backlog',
                points: 2,
                priority: 'P1',
            };
            const bmad = convertPennyStoryToBmad(penny);
            assert.strictEqual(bmad.id, '32.6');
        });
        it('maps status correctly', () => {
            const penny = {
                id: '1-1',
                title: 'Test',
                status: 'in_progress',
                points: 3,
                priority: 'P0',
            };
            const bmad = convertPennyStoryToBmad(penny);
            assert.strictEqual(bmad.status, 'in-progress');
        });
        it('maps approved to review', () => {
            const penny = {
                id: '1-1',
                title: 'Test',
                status: 'approved',
                points: 3,
                priority: 'P0',
            };
            const bmad = convertPennyStoryToBmad(penny);
            assert.strictEqual(bmad.status, 'review');
        });
        it('converts blocked_reason to blockers array and blocked status', () => {
            const penny = {
                id: '1-3',
                title: 'Blocked Story',
                status: 'backlog',
                points: 3,
                priority: 'P1',
                blocked_reason: 'Waiting for dependency',
            };
            const bmad = convertPennyStoryToBmad(penny);
            assert.strictEqual(bmad.status, 'blocked');
            assert.ok(bmad.blockers);
            assert.strictEqual(bmad.blockers[0], 'Waiting for dependency');
        });
        it('preserves optional fields', () => {
            const penny = {
                id: '1-1',
                title: 'Test',
                status: 'done',
                points: 5,
                priority: 'P0',
                assigned_to: 'Alice',
                started: '2024-01-15',
                completed: '2024-01-17',
            };
            const bmad = convertPennyStoryToBmad(penny);
            assert.strictEqual(bmad.assignee, 'Alice');
            assert.strictEqual(bmad.started, '2024-01-15');
            assert.strictEqual(bmad.completed, '2024-01-17');
        });
    });
    describe('exportToSprintStatus', () => {
        it('exports valid YAML', () => {
            const sprintInfo = {
                number: 10,
                goal: 'Test sprint',
                start_date: '2024-01-15',
                end_date: '2024-01-26',
            };
            const stories = [
                { id: '1-1', title: 'Story 1', status: 'done', points: 5, priority: 'P0' },
                { id: '1-2', title: 'Story 2', status: 'in_progress', points: 3, priority: 'P1' },
            ];
            const result = exportToSprintStatus(sprintInfo, stories);
            assert.strictEqual(result.success, true);
            assert.ok(result.yaml);
            assert.ok(result.yaml.includes('number: 10'));
            assert.ok(result.yaml.includes('goal: Test sprint'));
        });
        it('calculates metrics correctly', () => {
            const sprintInfo = {
                number: 10,
                goal: 'Test',
                start_date: '2024-01-15',
                end_date: '2024-01-26',
            };
            const stories = [
                { id: '1-1', title: 'Done', status: 'done', points: 5, priority: 'P0' },
                { id: '1-2', title: 'In Progress', status: 'in_progress', points: 3, priority: 'P1' },
                { id: '1-3', title: 'Backlog', status: 'backlog', points: 2, priority: 'P2' },
            ];
            const result = exportToSprintStatus(sprintInfo, stories);
            assert.strictEqual(result.success, true);
            assert.ok(result.yaml);
            assert.ok(result.yaml.includes('total_points: 10'));
            assert.ok(result.yaml.includes('completed_points: 5'));
            assert.ok(result.yaml.includes('in_progress_points: 3'));
        });
        it('converts story IDs to dot notation', () => {
            const sprintInfo = {
                number: 10,
                goal: 'Test',
                start_date: '2024-01-15',
                end_date: '2024-01-26',
            };
            const stories = [
                { id: '32-6', title: 'Story', status: 'backlog', points: 2, priority: 'P1' },
            ];
            const result = exportToSprintStatus(sprintInfo, stories);
            assert.strictEqual(result.success, true);
            assert.ok(result.yaml);
            assert.ok(result.yaml.includes('id: "32.6"') || result.yaml.includes("id: '32.6'") || result.yaml.includes('id: 32.6'));
        });
        it('returns errors for missing sprint info', () => {
            const sprintInfo = {
                number: 10,
                goal: '',
                start_date: '',
                end_date: '',
            };
            const result = exportToSprintStatus(sprintInfo, []);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors);
            assert.ok(result.errors.length >= 2);
        });
    });
});
// =============================================================================
// AC5: Conflict Detection Tests
// =============================================================================
describe('AC5: Conflict Detection', () => {
    it('detects no conflicts when statuses match mapping', () => {
        const bmadStories = [
            { id: '1.1', title: 'Story', status: 'in-progress', points: 3, priority: 'P1' },
        ];
        const pennyStories = [
            { id: '1-1', title: 'Story', status: 'in_progress', points: 3, priority: 'P1' },
        ];
        const result = detectConflicts(bmadStories, pennyStories);
        assert.strictEqual(result.hasConflicts, false);
        assert.strictEqual(result.conflicts.length, 0);
    });
    it('detects status conflicts', () => {
        const bmadStories = [
            { id: '1.1', title: 'Story', status: 'done', points: 3, priority: 'P1' },
        ];
        const pennyStories = [
            { id: '1-1', title: 'Story', status: 'in_progress', points: 3, priority: 'P1' },
        ];
        const result = detectConflicts(bmadStories, pennyStories);
        assert.strictEqual(result.hasConflicts, true);
        assert.strictEqual(result.conflicts.length, 1);
        assert.strictEqual(result.conflicts[0].field, 'status');
        assert.strictEqual(result.conflicts[0].bmadValue, 'done');
        assert.strictEqual(result.conflicts[0].pennyValue, 'in_progress');
    });
    it('detects assignee conflicts', () => {
        const bmadStories = [
            { id: '1.1', title: 'Story', status: 'in-progress', points: 3, priority: 'P1', assignee: 'Alice' },
        ];
        const pennyStories = [
            { id: '1-1', title: 'Story', status: 'in_progress', points: 3, priority: 'P1', assigned_to: 'Bob' },
        ];
        const result = detectConflicts(bmadStories, pennyStories);
        assert.strictEqual(result.hasConflicts, true);
        assert.ok(result.conflicts.some((c) => c.field === 'assignee'));
    });
    it('detects completion date conflicts', () => {
        const bmadStories = [
            { id: '1.1', title: 'Story', status: 'done', points: 3, priority: 'P1', completed: '2024-01-20' },
        ];
        const pennyStories = [
            { id: '1-1', title: 'Story', status: 'done', points: 3, priority: 'P1', completed: '2024-01-21' },
        ];
        const result = detectConflicts(bmadStories, pennyStories);
        assert.strictEqual(result.hasConflicts, true);
        assert.ok(result.conflicts.some((c) => c.field === 'completed'));
    });
    it('ignores stories only in one system', () => {
        const bmadStories = [
            { id: '1.1', title: 'BMAD Only', status: 'ready-for-dev', points: 3, priority: 'P1' },
        ];
        const pennyStories = [
            { id: '2-1', title: 'Penny Only', status: 'backlog', points: 2, priority: 'P2' },
        ];
        const result = detectConflicts(bmadStories, pennyStories);
        assert.strictEqual(result.hasConflicts, false);
    });
    it('detects multiple conflicts across stories', () => {
        const bmadStories = [
            { id: '1.1', title: 'Story 1', status: 'done', points: 3, priority: 'P1' },
            { id: '1.2', title: 'Story 2', status: 'review', points: 2, priority: 'P1', assignee: 'Alice' },
        ];
        const pennyStories = [
            { id: '1-1', title: 'Story 1', status: 'in_progress', points: 3, priority: 'P1' },
            { id: '1-2', title: 'Story 2', status: 'in_progress', points: 2, priority: 'P1', assigned_to: 'Bob' },
        ];
        const result = detectConflicts(bmadStories, pennyStories);
        assert.strictEqual(result.hasConflicts, true);
        assert.ok(result.conflicts.length >= 2);
    });
});
// =============================================================================
// Round-Trip Tests
// =============================================================================
describe('Round-trip: Export → Parse', () => {
    it('exported YAML can be parsed back', () => {
        const sprintInfo = {
            number: 10,
            goal: 'Test sprint',
            start_date: '2024-01-15',
            end_date: '2024-01-26',
        };
        const stories = [
            { id: '1-1', title: 'Story One', status: 'done', points: 5, priority: 'P0', assigned_to: 'Alice', completed: '2024-01-17' },
            { id: '1-2', title: 'Story Two', status: 'in_progress', points: 3, priority: 'P1', assigned_to: 'Bob', started: '2024-01-18' },
        ];
        const exportResult = exportToSprintStatus(sprintInfo, stories);
        assert.strictEqual(exportResult.success, true);
        assert.ok(exportResult.yaml);
        const parseResult = parseBmadSprintStatus(exportResult.yaml);
        assert.strictEqual(parseResult.success, true);
        assert.ok(parseResult.data);
        // Verify data integrity
        assert.strictEqual(parseResult.data.sprint.number, 10);
        assert.strictEqual(parseResult.data.stories.length, 2);
        assert.strictEqual(parseResult.data.stories[0].id, '1.1');
        assert.strictEqual(parseResult.data.stories[0].status, 'done');
        assert.strictEqual(parseResult.data.metrics.total_points, 8);
        assert.strictEqual(parseResult.data.metrics.completed_points, 5);
    });
});
//# sourceMappingURL=status-sync.test.js.map