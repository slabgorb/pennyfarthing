export interface WorkflowPhase {
    name: string;
    agent: string;
    label: string;
    status: 'done' | 'current' | 'pending';
}
export type WorkflowStep = WorkflowPhase;
export interface CriteriaItem {
    text: string;
    completed: boolean;
}
export interface StoryInfo {
    id: string | null;
    title: string | null;
    phase: string | null;
    status: string | null;
    points: number | null;
    sprint: {
        number: number;
        completed: number;
        total: number;
    } | null;
    nextAgent: string | null;
    workflow: WorkflowStep[] | null;
    pr: string | null;
    branch: string | null;
    criteria: CriteriaItem[] | null;
}
export declare function parseSessionFile(content: string, projectDir?: string): Partial<StoryInfo>;
export declare function parseAcceptanceCriteria(content: string): CriteriaItem[] | null;
export declare function parseWorkflowProgress(content: string, projectDir?: string): WorkflowPhase[] | null;
export declare function parseSprintYaml(content: string): StoryInfo['sprint'] | null;
export declare function getWorkflowPhases(workflowName: string, projectDir: string): Omit<WorkflowPhase, 'status'>[] | null;
export declare function getStoryInfo(projectDir: string): StoryInfo;
//# sourceMappingURL=story-parser.d.ts.map