/**
 * BMAD Story File Parser - Story 32-2
 *
 * Parses BMAD story markdown files and converts to Pennyfarthing session format.
 *
 * STUB IMPLEMENTATION - Dev will implement to pass tests
 */

// =============================================================================
// Types
// =============================================================================

export interface BmadTask {
  text: string;
  completed: boolean;
  subtasks?: BmadTask[];
}

export interface BmadAcceptanceCriteria {
  given: string;
  when: string;
  then: string;
  raw: string;
}

export interface BmadStory {
  title: string;
  status: 'ready-for-dev' | 'in-progress' | 'review' | 'done';
  userStory: string;
  acceptanceCriteria: BmadAcceptanceCriteria[];
  tasks: BmadTask[];
  devNotes: string | null;
  devAgentRecord: string | null;
  fileList: string[];
}

export interface ParseError {
  section: string;
  message: string;
  line?: number;
}

export interface ParseResult {
  success: boolean;
  story?: BmadStory;
  errors?: ParseError[];
}

// =============================================================================
// Main Parser Function - STUB
// =============================================================================

/**
 * Parse a BMAD story markdown file and convert to BmadStory structure.
 *
 * @param content - Raw markdown content of BMAD story file
 * @returns ParseResult with success status and either story or errors
 */
export function parseBmadStory(content: string): ParseResult {
  // STUB: Dev will implement this
  // For now, return failure to establish RED state
  return {
    success: false,
    errors: [
      {
        section: 'Parser',
        message: 'Not implemented - Dev must implement parseBmadStory()',
      },
    ],
  };
}
