/**
 * Skill Documentation Generator - Story 9-4
 *
 * Generates docs/SKILLS.md from pennyfarthing-dist/skills/skill-registry.yaml.
 * Organizes skills by category with table of contents and all metadata.
 */
export interface GeneratorOptions {
    /** Path to skill-registry.yaml (defaults to pennyfarthing-dist/skills/skill-registry.yaml) */
    registryPath?: string;
    /** Path to write output (optional - if provided with writeFile=true, writes to disk) */
    outputPath?: string;
    /** Whether to write the file to disk */
    writeFile?: boolean;
    /** Strict mode - error if required fields missing */
    strict?: boolean;
}
export interface GeneratorResult {
    /** Whether generation succeeded */
    success: boolean;
    /** Generated markdown content */
    content: string;
    /** Number of skills processed */
    skillCount: number;
    /** Path where file was written (if writeFile=true) */
    writtenTo?: string;
}
/**
 * Generate skill documentation from the skill registry.
 *
 * @param options - Generator options
 * @returns Promise resolving to generator result
 * @throws Error if registry not found or invalid
 */
export declare function generateSkillDocs(options?: GeneratorOptions): Promise<GeneratorResult>;
//# sourceMappingURL=generate-skill-docs.d.ts.map