export interface Choice<T = string> {
    name: string;
    value: T;
    short?: string;
}
/**
 * Prompt for a single selection from a list
 */
export declare function select<T = string>(message: string, choices: Choice<T>[], options?: {
    default?: T;
}): Promise<T>;
/**
 * Prompt for confirmation
 */
export declare function confirm(message: string, options?: {
    default?: boolean;
}): Promise<boolean>;
/**
 * Prompt for text input
 */
export declare function input(message: string, options?: {
    default?: string;
    validate?: (input: string) => boolean | string;
}): Promise<string>;
/**
 * Common prompts for installation scenarios
 */
export declare const prompts: {
    existingSetup(): Promise<"merge" | "overwrite" | "abort">;
    alreadyInstalled(version: string): Promise<"update" | "reinstall" | "abort">;
    modifiedFiles(files: string[]): Promise<"overwrite" | "skip" | "backup">;
    projectName(suggested?: string): Promise<string>;
};
//# sourceMappingURL=prompts.d.ts.map