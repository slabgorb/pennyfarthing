import { Express } from 'express';
import { Server } from 'http';
export { broadcastStats } from './api/index.js';
export { getStoryInfo } from './story-parser.js';
export type { StoryInfo, WorkflowStep, CriteriaItem } from './story-parser.js';
export { getGitInfo } from './api/index.js';
export type { GitInfo } from './api/index.js';
export declare const app: Express;
export declare function createTerminalServer(): Server;
//# sourceMappingURL=server.d.ts.map