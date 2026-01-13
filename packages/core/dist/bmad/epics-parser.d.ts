/**
 * BMAD Epics File Parser - Story 32-3
 *
 * Parses BMAD epics.md files and converts to Pennyfarthing sprint YAML structure.
 */
import { type BmadAcceptanceCriteria } from './story-parser.js';
export interface BmadRequirement {
    id: string;
    description: string;
}
export interface BmadEpicStory {
    id: string;
    bmadId: string;
    title: string;
    points: number;
    priority: 'P0' | 'P1' | 'P2';
    description: string;
    acceptanceCriteria: BmadAcceptanceCriteria[];
    requirements: BmadRequirement[];
}
export interface BmadEpic {
    id: number;
    title: string;
    description: string;
    stories: BmadEpicStory[];
}
export interface BmadEpicsFile {
    epics: BmadEpic[];
}
export interface EpicsParseError {
    location: string;
    message: string;
}
export interface EpicsParseResult {
    success: boolean;
    epics?: BmadEpicsFile;
    errors?: EpicsParseError[];
}
/**
 * Convert BMAD story ID (N.M) to Pennyfarthing format (N-M).
 */
export declare function convertStoryId(bmadId: string): string;
/**
 * Validate BMAD story ID format (N.M where N and M are numbers).
 */
export declare function isValidStoryId(id: string): boolean;
/**
 * Extract epic and story numbers from BMAD ID.
 */
export declare function parseStoryId(bmadId: string): {
    epicNum: number;
    storyNum: number;
} | null;
/**
 * Parse a BMAD epics.md file and convert to structured format.
 *
 * @param content - Raw markdown content of BMAD epics file
 * @returns EpicsParseResult with success status and either epics or errors
 */
export declare function parseBmadEpics(content: string): EpicsParseResult;
//# sourceMappingURL=epics-parser.d.ts.map