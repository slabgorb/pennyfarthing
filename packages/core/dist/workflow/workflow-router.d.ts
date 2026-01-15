/**
 * Workflow Router
 *
 * Routes stories to appropriate workflows based on explicit tags,
 * trigger rules, and defaults.
 *
 * Priority algorithm:
 * 1. Explicit workflow: tag on story
 * 2. Trigger tag match (story tags intersect workflow trigger tags)
 * 3. Type match (story type in workflow trigger types)
 * 4. Points match (story points within workflow trigger range)
 * 5. Default workflow fallback
 */
import type { WorkflowDefinition } from './workflow-loader.js';
/**
 * Story metadata used for routing decisions
 */
export interface StoryMetadata {
    /** Story identifier (e.g., "31-3") */
    id: string;
    /** Story type: feature, bug, chore, docs, etc. */
    type?: string;
    /** Story tags including workflow:xyz for explicit routing */
    tags?: string[];
    /** Story points for points-based routing */
    points?: number;
}
/**
 * Result of routing a story to a workflow
 */
export interface RoutingResult {
    /** The matched workflow */
    workflow: WorkflowDefinition;
    /** Human-readable reason for the match (for debugging) */
    reason: string;
}
/**
 * Route a story to the appropriate workflow
 *
 * @param story - Story metadata for routing decisions
 * @param workflows - Available workflow definitions
 * @returns Routing result with matched workflow and reason, or null if no match
 *
 * @example
 * ```typescript
 * const story = { id: '31-3', type: 'feature', points: 3 };
 * const result = routeStoryToWorkflow(story, workflows);
 * if (result) {
 *   console.log(`Using workflow: ${result.workflow.name}`);
 *   console.log(`Reason: ${result.reason}`);
 * }
 * ```
 */
export declare function routeStoryToWorkflow(story: StoryMetadata, workflows: WorkflowDefinition[]): RoutingResult | null;
//# sourceMappingURL=workflow-router.d.ts.map