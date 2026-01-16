/**
 * BMAD Story Exporter - Story 32-5
 *
 * Exports Pennyfarthing session data to BMAD story markdown format.
 *
 * Input: SessionData (parsed from .session/{story-id}-session.md)
 * Output: BMAD story markdown string
 *
 * Status mapping:
 * - Pennyfarthing 'backlog' → BMAD 'ready-for-dev'
 * - Pennyfarthing 'in_progress' → BMAD 'in-progress'
 * - Pennyfarthing 'needs_review' | 'approved' → BMAD 'review'
 * - Pennyfarthing 'done' → BMAD 'done'
 */
export interface AcceptanceCriterion {
    text: string;
    completed: boolean;
}
export interface Task {
    text: string;
    completed: boolean;
    subtasks?: Task[];
}
export interface SessionData {
    storyId: string;
    title: string;
    status: 'backlog' | 'in_progress' | 'needs_review' | 'approved' | 'done' | string;
    userStory: string;
    acceptanceCriteria: AcceptanceCriterion[];
    tasks?: Task[];
    devNotes?: string;
    devAgentRecord?: string;
    fileList?: string[];
}
export interface ExportError {
    field: string;
    message: string;
}
export interface ExportResult {
    success: boolean;
    markdown?: string;
    errors?: ExportError[];
}
export interface ExportOptions {
    includeEmptySections?: boolean;
}
/**
 * Export Pennyfarthing session data to BMAD story markdown format.
 *
 * @param session - Session data to export
 * @param options - Optional export configuration
 * @returns ExportResult with success status and either markdown or errors
 */
export declare function exportToBmadStory(session: SessionData, options?: ExportOptions): ExportResult;
//# sourceMappingURL=story-exporter.d.ts.map