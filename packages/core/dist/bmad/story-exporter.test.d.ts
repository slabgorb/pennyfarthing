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
export interface SessionDataType {
    storyId: string;
    title: string;
    status: 'backlog' | 'in_progress' | 'needs_review' | 'approved' | 'done' | string;
    userStory: string;
    acceptanceCriteria: AcceptanceCriterionType[];
    tasks?: TaskType[];
    devNotes?: string;
    devAgentRecord?: string;
    fileList?: string[];
}
export interface AcceptanceCriterionType {
    text: string;
    completed: boolean;
}
export interface TaskType {
    text: string;
    completed: boolean;
    subtasks?: TaskType[];
}
export interface ExportResultType {
    success: boolean;
    markdown?: string;
    errors?: ExportErrorType[];
}
export interface ExportErrorType {
    field: string;
    message: string;
}
export interface ExportOptionsType {
    includeEmptySections?: boolean;
}
//# sourceMappingURL=story-exporter.test.d.ts.map