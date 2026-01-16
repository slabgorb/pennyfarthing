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
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
// =============================================================================
// Story ID Conversion
// =============================================================================
/**
 * Convert BMAD story ID (dot notation) to Pennyfarthing (dash notation).
 * Example: "32.6" → "32-6"
 */
export function bmadIdToPenny(bmadId) {
    return bmadId.replace(/\./g, '-');
}
/**
 * Convert Pennyfarthing story ID (dash notation) to BMAD (dot notation).
 * Example: "32-6" → "32.6"
 */
export function pennyIdToBmad(pennyId) {
    return pennyId.replace(/-/g, '.');
}
/**
 * Validate BMAD story ID format (N.M where N and M are positive integers).
 */
export function isValidBmadStoryId(id) {
    return /^\d+\.\d+$/.test(id);
}
/**
 * Validate Pennyfarthing story ID format (N-M where N and M are positive integers).
 */
export function isValidPennyStoryId(id) {
    return /^\d+-\d+$/.test(id);
}
// =============================================================================
// Status Mapping
// =============================================================================
const BMAD_TO_PENNY = {
    'ready-for-dev': 'backlog',
    'in-progress': 'in_progress',
    'review': 'needs_review',
    'done': 'done',
    'blocked': 'backlog', // Map blocked to backlog with reason preserved
};
const PENNY_TO_BMAD = {
    'backlog': 'ready-for-dev',
    'in_progress': 'in-progress',
    'needs_review': 'review',
    'approved': 'review', // approved also maps to review
    'done': 'done',
};
/**
 * Map BMAD status to Pennyfarthing status.
 */
export function mapBmadToPennyStatus(bmadStatus) {
    return BMAD_TO_PENNY[bmadStatus] ?? 'backlog';
}
/**
 * Map Pennyfarthing status to BMAD status.
 */
export function mapPennyToBmadStatus(pennyStatus) {
    return PENNY_TO_BMAD[pennyStatus] ?? 'ready-for-dev';
}
// =============================================================================
// AC1: Parse BMAD Sprint Status
// =============================================================================
/**
 * Parse BMAD sprint-status.yaml content.
 *
 * Validates the schema and returns structured data or errors.
 */
export function parseBmadSprintStatus(yamlContent) {
    const errors = [];
    // Parse YAML
    let parsed;
    try {
        parsed = parseYaml(yamlContent);
    }
    catch (e) {
        return {
            success: false,
            errors: [{ field: 'yaml', message: `Invalid YAML: ${e.message}` }],
        };
    }
    if (!parsed || typeof parsed !== 'object') {
        return {
            success: false,
            errors: [{ field: 'root', message: 'YAML must be an object' }],
        };
    }
    const doc = parsed;
    // Validate sprint section
    if (!doc.sprint || typeof doc.sprint !== 'object') {
        errors.push({ field: 'sprint', message: 'Sprint section is required' });
    }
    else {
        const sprint = doc.sprint;
        if (typeof sprint.number !== 'number') {
            errors.push({ field: 'sprint.number', message: 'Sprint number is required and must be a number' });
        }
        if (typeof sprint.goal !== 'string') {
            errors.push({ field: 'sprint.goal', message: 'Sprint goal is required and must be a string' });
        }
        if (typeof sprint.start_date !== 'string') {
            errors.push({ field: 'sprint.start_date', message: 'Sprint start_date is required' });
        }
        if (typeof sprint.end_date !== 'string') {
            errors.push({ field: 'sprint.end_date', message: 'Sprint end_date is required' });
        }
    }
    // Validate stories section
    if (!doc.stories || !Array.isArray(doc.stories)) {
        errors.push({ field: 'stories', message: 'Stories section is required and must be an array' });
    }
    else {
        for (let i = 0; i < doc.stories.length; i++) {
            const story = doc.stories[i];
            const storyId = String(story.id ?? `[${i}]`);
            if (!story.id || typeof story.id !== 'string') {
                errors.push({ field: `stories[${i}].id`, message: 'Story ID is required', storyId });
            }
            else if (!isValidBmadStoryId(story.id)) {
                errors.push({ field: `stories[${i}].id`, message: `Invalid BMAD story ID format: ${story.id}`, storyId });
            }
            if (!story.title || typeof story.title !== 'string') {
                errors.push({ field: `stories[${i}].title`, message: 'Story title is required', storyId });
            }
            if (!story.status || typeof story.status !== 'string') {
                errors.push({ field: `stories[${i}].status`, message: 'Story status is required', storyId });
            }
            else if (!['ready-for-dev', 'in-progress', 'review', 'done', 'blocked'].includes(story.status)) {
                errors.push({ field: `stories[${i}].status`, message: `Invalid status: ${story.status}`, storyId });
            }
            if (typeof story.points !== 'number') {
                errors.push({ field: `stories[${i}].points`, message: 'Story points is required and must be a number', storyId });
            }
            if (!story.priority || typeof story.priority !== 'string') {
                errors.push({ field: `stories[${i}].priority`, message: 'Story priority is required', storyId });
            }
        }
    }
    // Validate metrics section
    if (!doc.metrics || typeof doc.metrics !== 'object') {
        errors.push({ field: 'metrics', message: 'Metrics section is required' });
    }
    else {
        const metrics = doc.metrics;
        if (typeof metrics.total_points !== 'number') {
            errors.push({ field: 'metrics.total_points', message: 'Total points is required and must be a number' });
        }
        if (typeof metrics.completed_points !== 'number') {
            errors.push({ field: 'metrics.completed_points', message: 'Completed points is required and must be a number' });
        }
    }
    if (errors.length > 0) {
        return { success: false, errors };
    }
    // Build typed result
    const sprintSection = doc.sprint;
    const metricsSection = doc.metrics;
    const result = {
        sprint: {
            number: sprintSection.number,
            goal: sprintSection.goal,
            start_date: sprintSection.start_date,
            end_date: sprintSection.end_date,
        },
        stories: doc.stories.map((s) => ({
            id: s.id,
            title: s.title,
            epic: s.epic,
            status: s.status,
            assignee: s.assignee,
            points: s.points,
            priority: s.priority,
            started: s.started,
            completed: s.completed,
            blockers: s.blockers,
        })),
        metrics: {
            total_points: metricsSection.total_points,
            completed_points: metricsSection.completed_points,
            in_progress_points: metricsSection.in_progress_points,
            velocity: metricsSection.velocity,
            burndown: metricsSection.burndown,
        },
    };
    return { success: true, data: result };
}
// =============================================================================
// AC2: Import BMAD Status to Pennyfarthing Format
// =============================================================================
/**
 * Convert a BMAD story to Pennyfarthing format.
 */
export function convertBmadStoryToPenny(bmadStory) {
    const result = {
        id: bmadIdToPenny(bmadStory.id),
        title: bmadStory.title,
        status: mapBmadToPennyStatus(bmadStory.status),
        points: bmadStory.points,
        priority: bmadStory.priority,
    };
    if (bmadStory.assignee) {
        result.assigned_to = bmadStory.assignee;
    }
    if (bmadStory.started) {
        result.started = bmadStory.started;
    }
    if (bmadStory.completed) {
        result.completed = bmadStory.completed;
    }
    // Preserve blocked reason when status is blocked
    if (bmadStory.status === 'blocked' && bmadStory.blockers && bmadStory.blockers.length > 0) {
        result.blocked_reason = bmadStory.blockers.join('; ');
    }
    return result;
}
/**
 * Import BMAD sprint status and merge into Pennyfarthing story list.
 *
 * Updates existing stories, adds new ones from BMAD.
 * Preserves Pennyfarthing-only fields.
 */
export function importFromBmadStatus(bmadStatus, existingStories) {
    const updates = [];
    const storyMap = new Map(existingStories.map((s) => [s.id, s]));
    for (const bmadStory of bmadStatus.stories) {
        const pennyId = bmadIdToPenny(bmadStory.id);
        const existing = storyMap.get(pennyId);
        const converted = convertBmadStoryToPenny(bmadStory);
        if (existing) {
            // Update existing story, track changes
            if (existing.status !== converted.status) {
                updates.push({
                    id: pennyId,
                    field: 'status',
                    oldValue: existing.status,
                    newValue: converted.status,
                });
                existing.status = converted.status;
            }
            if (existing.assigned_to !== converted.assigned_to) {
                updates.push({
                    id: pennyId,
                    field: 'assigned_to',
                    oldValue: existing.assigned_to,
                    newValue: converted.assigned_to,
                });
                existing.assigned_to = converted.assigned_to;
            }
            if (existing.started !== converted.started) {
                updates.push({
                    id: pennyId,
                    field: 'started',
                    oldValue: existing.started,
                    newValue: converted.started,
                });
                existing.started = converted.started;
            }
            if (existing.completed !== converted.completed) {
                updates.push({
                    id: pennyId,
                    field: 'completed',
                    oldValue: existing.completed,
                    newValue: converted.completed,
                });
                existing.completed = converted.completed;
            }
            if (converted.blocked_reason) {
                updates.push({
                    id: pennyId,
                    field: 'blocked_reason',
                    oldValue: existing.blocked_reason,
                    newValue: converted.blocked_reason,
                });
                existing.blocked_reason = converted.blocked_reason;
            }
        }
        else {
            // Add new story
            storyMap.set(pennyId, converted);
            updates.push({
                id: pennyId,
                field: '_new',
                oldValue: undefined,
                newValue: converted,
            });
        }
    }
    return {
        success: true,
        updatedStories: updates,
    };
}
// =============================================================================
// AC3: Export Pennyfarthing Status to BMAD Format
// =============================================================================
/**
 * Convert a Pennyfarthing story to BMAD format.
 */
export function convertPennyStoryToBmad(pennyStory) {
    const result = {
        id: pennyIdToBmad(pennyStory.id),
        title: pennyStory.title,
        status: mapPennyToBmadStatus(pennyStory.status),
        points: pennyStory.points,
        priority: pennyStory.priority,
    };
    if (pennyStory.assigned_to) {
        result.assignee = pennyStory.assigned_to;
    }
    if (pennyStory.started) {
        result.started = pennyStory.started;
    }
    if (pennyStory.completed) {
        result.completed = pennyStory.completed;
    }
    // Convert blocked_reason to blockers array
    if (pennyStory.blocked_reason) {
        result.status = 'blocked';
        result.blockers = [pennyStory.blocked_reason];
    }
    return result;
}
/**
 * Calculate metrics from story list.
 */
function calculateMetrics(stories) {
    let totalPoints = 0;
    let completedPoints = 0;
    let inProgressPoints = 0;
    for (const story of stories) {
        totalPoints += story.points;
        if (story.status === 'done') {
            completedPoints += story.points;
        }
        else if (story.status === 'in-progress') {
            inProgressPoints += story.points;
        }
    }
    return {
        total_points: totalPoints,
        completed_points: completedPoints,
        in_progress_points: inProgressPoints,
    };
}
/**
 * Export Pennyfarthing sprint to BMAD sprint-status.yaml format.
 */
export function exportToSprintStatus(sprintInfo, stories) {
    const errors = [];
    // Validate sprint info
    if (typeof sprintInfo.number !== 'number') {
        errors.push({ field: 'sprint.number', message: 'Sprint number is required' });
    }
    if (!sprintInfo.goal) {
        errors.push({ field: 'sprint.goal', message: 'Sprint goal is required' });
    }
    if (!sprintInfo.start_date) {
        errors.push({ field: 'sprint.start_date', message: 'Sprint start_date is required' });
    }
    if (!sprintInfo.end_date) {
        errors.push({ field: 'sprint.end_date', message: 'Sprint end_date is required' });
    }
    if (errors.length > 0) {
        return { success: false, errors };
    }
    // Convert stories
    const bmadStories = stories.map(convertPennyStoryToBmad);
    // Build output
    const output = {
        sprint: sprintInfo,
        stories: bmadStories,
        metrics: calculateMetrics(bmadStories),
    };
    return {
        success: true,
        yaml: stringifyYaml(output),
    };
}
// =============================================================================
// AC5: Conflict Detection
// =============================================================================
/**
 * Detect conflicts between BMAD and Pennyfarthing story statuses.
 *
 * A conflict occurs when both have changes for the same story
 * (detected by comparing against a baseline or timestamp).
 */
export function detectConflicts(bmadStories, pennyStories) {
    const conflicts = [];
    // Build lookup maps
    const bmadMap = new Map(bmadStories.map((s) => [bmadIdToPenny(s.id), s]));
    const pennyMap = new Map(pennyStories.map((s) => [s.id, s]));
    // Check each story that exists in both
    for (const [id, pennyStory] of pennyMap) {
        const bmadStory = bmadMap.get(id);
        if (!bmadStory)
            continue;
        // Check for status conflict
        const expectedPennyStatus = mapBmadToPennyStatus(bmadStory.status);
        const expectedBmadStatus = mapPennyToBmadStatus(pennyStory.status);
        // Status conflict: neither matches the other's expected mapping
        if (pennyStory.status !== expectedPennyStatus &&
            bmadStory.status !== expectedBmadStatus) {
            conflicts.push({
                storyId: id,
                field: 'status',
                bmadValue: bmadStory.status,
                pennyValue: pennyStory.status,
                message: `Status conflict: BMAD has '${bmadStory.status}', Pennyfarthing has '${pennyStory.status}'`,
            });
        }
        // Assignee conflict
        const bmadAssignee = bmadStory.assignee ?? undefined;
        const pennyAssignee = pennyStory.assigned_to ?? undefined;
        if (bmadAssignee && pennyAssignee && bmadAssignee !== pennyAssignee) {
            conflicts.push({
                storyId: id,
                field: 'assignee',
                bmadValue: bmadAssignee,
                pennyValue: pennyAssignee,
                message: `Assignee conflict: BMAD has '${bmadAssignee}', Pennyfarthing has '${pennyAssignee}'`,
            });
        }
        // Completed date conflict
        const bmadCompleted = bmadStory.completed ?? undefined;
        const pennyCompleted = pennyStory.completed ?? undefined;
        if (bmadCompleted && pennyCompleted && bmadCompleted !== pennyCompleted) {
            conflicts.push({
                storyId: id,
                field: 'completed',
                bmadValue: bmadCompleted,
                pennyValue: pennyCompleted,
                message: `Completion date conflict: BMAD has '${bmadCompleted}', Pennyfarthing has '${pennyCompleted}'`,
            });
        }
    }
    return {
        hasConflicts: conflicts.length > 0,
        conflicts,
    };
}
//# sourceMappingURL=status-sync.js.map