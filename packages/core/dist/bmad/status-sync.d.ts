/**
 * BMAD Status Sync - Story 32-6
 *
 * Bidirectional sync between Pennyfarthing sprint YAML and BMAD sprint-status.yaml.
 *
 * Features:
 * - Parse BMAD sprint-status.yaml format
 * - Import BMAD status into Pennyfarthing format
 * - Export Pennyfarthing status to BMAD format
 * - Detect conflicts when both have changed
 *
 * Story ID Conversion:
 * - BMAD uses dot notation: "1.1", "32.6"
 * - Pennyfarthing uses dash notation: "1-1", "32-6"
 *
 * Status Mapping:
 * - BMAD 'ready-for-dev' ↔ Pennyfarthing 'backlog'
 * - BMAD 'in-progress' ↔ Pennyfarthing 'in_progress'
 * - BMAD 'review' ↔ Pennyfarthing 'needs_review'
 * - BMAD 'done' ↔ Pennyfarthing 'done'
 * - BMAD 'blocked' → Pennyfarthing 'backlog' (with blocked_reason)
 */
export type BmadStatus = 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'blocked';
export interface BmadSprintInfo {
    number: number;
    goal: string;
    start_date: string;
    end_date: string;
}
export interface BmadStoryStatus {
    id: string;
    title: string;
    epic?: string;
    status: BmadStatus;
    assignee?: string;
    points: number;
    priority: 'P0' | 'P1' | 'P2';
    started?: string;
    completed?: string;
    blockers?: string[];
}
export interface BmadMetrics {
    total_points: number;
    completed_points: number;
    in_progress_points?: number;
    velocity?: number;
    burndown?: Array<{
        date: string;
        remaining: number;
    }>;
}
export interface BmadSprintStatus {
    sprint: BmadSprintInfo;
    stories: BmadStoryStatus[];
    metrics: BmadMetrics;
}
export type PennyStatus = 'backlog' | 'in_progress' | 'needs_review' | 'approved' | 'done';
export interface PennyStoryStatus {
    id: string;
    title: string;
    status: PennyStatus;
    points: number;
    priority: string;
    assigned_to?: string;
    started?: string;
    completed?: string;
    blocked_reason?: string;
}
export interface PennySprintSummary {
    total_points: number;
    completed_points: number;
    remaining_points: number;
}
export interface SyncError {
    field: string;
    message: string;
    storyId?: string;
}
export interface ParseResult {
    success: boolean;
    data?: BmadSprintStatus;
    errors?: SyncError[];
}
export interface ExportResult {
    success: boolean;
    yaml?: string;
    errors?: SyncError[];
}
export interface Conflict {
    storyId: string;
    field: string;
    bmadValue: string | number | undefined;
    pennyValue: string | number | undefined;
    message: string;
}
export interface ConflictResult {
    hasConflicts: boolean;
    conflicts: Conflict[];
}
export interface ImportResult {
    success: boolean;
    updatedStories?: Array<{
        id: string;
        field: string;
        oldValue: unknown;
        newValue: unknown;
    }>;
    errors?: SyncError[];
}
/**
 * Convert BMAD story ID (dot notation) to Pennyfarthing (dash notation).
 * Example: "32.6" → "32-6"
 */
export declare function bmadIdToPenny(bmadId: string): string;
/**
 * Convert Pennyfarthing story ID (dash notation) to BMAD (dot notation).
 * Example: "32-6" → "32.6"
 */
export declare function pennyIdToBmad(pennyId: string): string;
/**
 * Validate BMAD story ID format (N.M where N and M are positive integers).
 */
export declare function isValidBmadStoryId(id: string): boolean;
/**
 * Validate Pennyfarthing story ID format (N-M where N and M are positive integers).
 */
export declare function isValidPennyStoryId(id: string): boolean;
/**
 * Map BMAD status to Pennyfarthing status.
 */
export declare function mapBmadToPennyStatus(bmadStatus: BmadStatus): PennyStatus;
/**
 * Map Pennyfarthing status to BMAD status.
 */
export declare function mapPennyToBmadStatus(pennyStatus: PennyStatus): BmadStatus;
/**
 * Parse BMAD sprint-status.yaml content.
 *
 * Validates the schema and returns structured data or errors.
 */
export declare function parseBmadSprintStatus(yamlContent: string): ParseResult;
/**
 * Convert a BMAD story to Pennyfarthing format.
 */
export declare function convertBmadStoryToPenny(bmadStory: BmadStoryStatus): PennyStoryStatus;
/**
 * Import BMAD sprint status and merge into Pennyfarthing story list.
 *
 * Updates existing stories, adds new ones from BMAD.
 * Preserves Pennyfarthing-only fields.
 */
export declare function importFromBmadStatus(bmadStatus: BmadSprintStatus, existingStories: PennyStoryStatus[]): ImportResult;
/**
 * Convert a Pennyfarthing story to BMAD format.
 */
export declare function convertPennyStoryToBmad(pennyStory: PennyStoryStatus): BmadStoryStatus;
/**
 * Export Pennyfarthing sprint to BMAD sprint-status.yaml format.
 */
export declare function exportToSprintStatus(sprintInfo: {
    number: number;
    goal: string;
    start_date: string;
    end_date: string;
}, stories: PennyStoryStatus[]): ExportResult;
/**
 * Detect conflicts between BMAD and Pennyfarthing story statuses.
 *
 * A conflict occurs when both have changes for the same story
 * (detected by comparing against a baseline or timestamp).
 */
export declare function detectConflicts(bmadStories: BmadStoryStatus[], pennyStories: PennyStoryStatus[]): ConflictResult;
//# sourceMappingURL=status-sync.d.ts.map