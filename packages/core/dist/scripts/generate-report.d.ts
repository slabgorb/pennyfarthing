/**
 * OCEAN Face Report Generator
 *
 * Story 11-7: Build slice/report generator
 *
 * Generates filtered face reports and character comparisons with markdown output.
 * Supports filtering by role, theme, and OCEAN dimensions.
 */
export interface OceanScores {
    O: number;
    C: number;
    E: number;
    A: number;
    N: number;
}
export interface CharacterInfo {
    theme: string;
    agent: string;
    character: string;
    ocean: OceanScores;
}
export interface OceanFilter {
    dimension: keyof OceanScores;
    operator: '>=' | '<=' | '=' | '>' | '<';
    value: number;
}
export interface ReportOptions {
    role?: string;
    theme?: string;
    ocean?: string;
}
export interface ReportResult {
    characters: CharacterInfo[];
    markdown: string;
    filter: ReportOptions;
}
export interface ComparisonResult {
    characters: CharacterInfo[];
    markdown: string;
}
/**
 * Parse an OCEAN filter expression like "O>=4" or "A<=2"
 */
export declare function parseOceanFilter(expr: string): OceanFilter;
/**
 * Filter characters by OCEAN dimension expression
 */
export declare function filterByOcean(expression: string): CharacterInfo[];
/**
 * Filter characters by agent role
 */
export declare function filterByRole(role: string): CharacterInfo[];
/**
 * Filter characters by theme (returns all 10 agents for that theme)
 */
export declare function filterByTheme(theme: string): CharacterInfo[];
/**
 * Compare 2-4 characters side-by-side
 */
export declare function compareCharacters(specs: string[]): ComparisonResult;
/**
 * Generate a filtered report with markdown output
 */
export declare function generateReport(options: ReportOptions): ReportResult;
//# sourceMappingURL=generate-report.d.ts.map