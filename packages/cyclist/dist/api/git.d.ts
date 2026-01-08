import { Router } from 'express';
export interface GitInfo {
    branch: string;
    clean: boolean;
    ahead: number | null;
    behind: number | null;
}
export declare function getGitInfo(projectDir: string): GitInfo | null;
export declare function createGitRouter(getProjectDir: () => string): Router;
//# sourceMappingURL=git.d.ts.map