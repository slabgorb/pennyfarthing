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
//# sourceMappingURL=story-parser.test.d.ts.map