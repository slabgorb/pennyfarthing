/**
 * BMAD Epics File Parser - Story 32-3
 *
 * Parses BMAD epics.md files and converts to Pennyfarthing sprint YAML structure.
 */

import { type BmadAcceptanceCriteria } from './story-parser.js';

// =============================================================================
// Types
// =============================================================================

export interface BmadRequirement {
  id: string;
  description: string;
}

export interface BmadEpicStory {
  id: string;                              // Pennyfarthing format: N-M
  bmadId: string;                          // Original BMAD format: N.M
  title: string;
  points: number;
  priority: 'P0' | 'P1' | 'P2';
  description: string;
  acceptanceCriteria: BmadAcceptanceCriteria[];
  requirements: BmadRequirement[];
}

export interface BmadEpic {
  id: number;                              // Epic number (N)
  title: string;
  description: string;
  stories: BmadEpicStory[];
}

export interface BmadEpicsFile {
  epics: BmadEpic[];
}

export interface EpicsParseError {
  location: string;                        // e.g., "Epic 1, Story 1.2"
  message: string;
}

export interface EpicsParseResult {
  success: boolean;
  epics?: BmadEpicsFile;
  errors?: EpicsParseError[];
}

// =============================================================================
// Valid values
// =============================================================================

const VALID_PRIORITIES = ['P0', 'P1', 'P2'] as const;
type Priority = typeof VALID_PRIORITIES[number];

// =============================================================================
// Story ID conversion
// =============================================================================

/**
 * Convert BMAD story ID (N.M) to Pennyfarthing format (N-M).
 */
export function convertStoryId(bmadId: string): string {
  return bmadId.replace('.', '-');
}

/**
 * Validate BMAD story ID format (N.M where N and M are numbers).
 */
export function isValidStoryId(id: string): boolean {
  return /^\d+\.\d+$/.test(id);
}

/**
 * Extract epic and story numbers from BMAD ID.
 */
export function parseStoryId(bmadId: string): { epicNum: number; storyNum: number } | null {
  const match = bmadId.match(/^(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    epicNum: parseInt(match[1], 10),
    storyNum: parseInt(match[2], 10),
  };
}

// =============================================================================
// Section extraction
// =============================================================================

interface RawEpicSection {
  epicNum: number;
  title: string;
  content: string;
}

interface RawStorySection {
  bmadId: string;
  title: string;
  content: string;
}

/**
 * Extract epic sections from markdown content (## Epic N: headers).
 */
function extractEpicSections(content: string): RawEpicSection[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const sections: RawEpicSection[] = [];

  // Match ## Epic N: [Title] headers
  const epicRegex = /^##\s*Epic\s+(\d+):\s*(.+)$/gm;
  let match;
  const matches: { index: number; epicNum: number; title: string }[] = [];

  while ((match = epicRegex.exec(normalized)) !== null) {
    matches.push({
      index: match.index,
      epicNum: parseInt(match[1], 10),
      title: match[2].trim(),
    });
  }

  // Extract content between headers
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : normalized.length;

    // Get content after the header line
    const fullSection = normalized.substring(start, end);
    const firstNewline = fullSection.indexOf('\n');
    const sectionContent = firstNewline >= 0 ? fullSection.substring(firstNewline + 1).trim() : '';

    sections.push({
      epicNum: matches[i].epicNum,
      title: matches[i].title,
      content: sectionContent,
    });
  }

  return sections;
}

/**
 * Extract story sections from epic content (### Story N.M: headers).
 */
function extractStorySections(epicContent: string): RawStorySection[] {
  const sections: RawStorySection[] = [];

  // Match ### Story N.M: [Title] headers
  const storyRegex = /^###\s*Story\s+(\d+\.\d+):\s*(.+)$/gm;
  let match;
  const matches: { index: number; bmadId: string; title: string }[] = [];

  while ((match = storyRegex.exec(epicContent)) !== null) {
    matches.push({
      index: match.index,
      bmadId: match[1],
      title: match[2].trim(),
    });
  }

  // Extract content between headers
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : epicContent.length;

    const fullSection = epicContent.substring(start, end);
    const firstNewline = fullSection.indexOf('\n');
    const sectionContent = firstNewline >= 0 ? fullSection.substring(firstNewline + 1).trim() : '';

    sections.push({
      bmadId: matches[i].bmadId,
      title: matches[i].title,
      content: sectionContent,
    });
  }

  return sections;
}

/**
 * Get content before the first story header (epic description).
 */
function extractEpicDescription(epicContent: string): string {
  // Find the first ### Story header
  const storyMatch = epicContent.match(/^###\s*Story\s+\d+\.\d+:/m);
  if (!storyMatch || storyMatch.index === undefined) {
    // No stories, entire content is description
    return epicContent.trim();
  }

  return epicContent.substring(0, storyMatch.index).trim();
}

// =============================================================================
// Field parsing
// =============================================================================

/**
 * Extract Points field value.
 */
function parsePoints(content: string): number | null {
  const match = content.match(/\*\*Points:\*\*\s*(\d+)/i);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Extract Priority field value.
 */
function parsePriority(content: string): Priority | null {
  const match = content.match(/\*\*Priority:\*\*\s*(P[012])/i);
  if (!match) return null;
  const priority = match[1].toUpperCase();
  if (VALID_PRIORITIES.includes(priority as Priority)) {
    return priority as Priority;
  }
  return null;
}

/**
 * Extract Description section content.
 */
function parseDescription(content: string): string {
  // Look for #### Description header
  const match = content.match(/####\s*Description\s*\n([\s\S]*?)(?=####|$)/i);
  if (!match) return '';
  return match[1].trim();
}

/**
 * Parse acceptance criteria from #### Acceptance Criteria section.
 */
function parseAcceptanceCriteria(content: string): BmadAcceptanceCriteria[] {
  const criteria: BmadAcceptanceCriteria[] = [];

  // Find the Acceptance Criteria section
  const sectionMatch = content.match(/####\s*Acceptance Criteria\s*\n([\s\S]*?)(?=####|$)/i);
  if (!sectionMatch) return criteria;

  const acContent = sectionMatch[1];
  const lines = acContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;

    const raw = trimmed.substring(2).trim();

    // Try to extract Given/When/Then
    const bddMatch = raw.match(/^Given\s+(.+?),\s*When\s+(.+?),\s*Then\s+(.+)$/i);

    if (bddMatch) {
      criteria.push({
        given: bddMatch[1].trim(),
        when: bddMatch[2].trim(),
        then: bddMatch[3].trim(),
        raw,
      });
    } else {
      // Non-BDD format
      criteria.push({
        given: '',
        when: '',
        then: '',
        raw,
      });
    }
  }

  return criteria;
}

/**
 * Parse requirements coverage from #### Requirements Coverage section.
 */
function parseRequirementsCoverage(content: string): BmadRequirement[] {
  const requirements: BmadRequirement[] = [];

  // Find the Requirements Coverage section
  const sectionMatch = content.match(/####\s*Requirements Coverage\s*\n([\s\S]*?)(?=####|$)/i);
  if (!sectionMatch) return requirements;

  const reqContent = sectionMatch[1];
  const lines = reqContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;

    const reqLine = trimmed.substring(2).trim();

    // Match REQ-XXX: Description format
    const reqMatch = reqLine.match(/^(REQ-[\w-]+):\s*(.+)$/i);
    if (reqMatch) {
      requirements.push({
        id: reqMatch[1].toUpperCase(),
        description: reqMatch[2].trim(),
      });
    }
  }

  return requirements;
}

// =============================================================================
// Story parsing
// =============================================================================

/**
 * Parse a single story section.
 */
function parseStory(section: RawStorySection, errors: EpicsParseError[]): BmadEpicStory | null {
  const location = `Story ${section.bmadId}`;

  // Validate story ID format
  if (!isValidStoryId(section.bmadId)) {
    errors.push({
      location,
      message: `Invalid story ID format "${section.bmadId}". Expected N.M format.`,
    });
    return null;
  }

  // Parse points (required)
  const points = parsePoints(section.content);
  if (points === null) {
    errors.push({
      location,
      message: 'Missing **Points:** field.',
    });
  }

  // Parse priority (required)
  const priority = parsePriority(section.content);
  if (priority === null) {
    errors.push({
      location,
      message: 'Missing or invalid **Priority:** field. Must be P0, P1, or P2.',
    });
  }

  // If we have critical errors, don't continue
  if (points === null || priority === null) {
    return null;
  }

  // Parse optional fields
  const description = parseDescription(section.content);
  const acceptanceCriteria = parseAcceptanceCriteria(section.content);
  const requirements = parseRequirementsCoverage(section.content);

  return {
    id: convertStoryId(section.bmadId),
    bmadId: section.bmadId,
    title: section.title,
    points,
    priority,
    description,
    acceptanceCriteria,
    requirements,
  };
}

// =============================================================================
// Epic parsing
// =============================================================================

/**
 * Parse a single epic section.
 */
function parseEpic(section: RawEpicSection, errors: EpicsParseError[]): BmadEpic {
  const description = extractEpicDescription(section.content);
  const storySections = extractStorySections(section.content);

  const stories: BmadEpicStory[] = [];

  for (const storySection of storySections) {
    const story = parseStory(storySection, errors);
    if (story) {
      stories.push(story);
    }
  }

  return {
    id: section.epicNum,
    title: section.title,
    description,
    stories,
  };
}

// =============================================================================
// Main Parser Function
// =============================================================================

/**
 * Parse a BMAD epics.md file and convert to structured format.
 *
 * @param content - Raw markdown content of BMAD epics file
 * @returns EpicsParseResult with success status and either epics or errors
 */
export function parseBmadEpics(content: string): EpicsParseResult {
  const errors: EpicsParseError[] = [];

  // Handle empty content
  if (!content || !content.trim()) {
    return {
      success: false,
      errors: [{ location: 'File', message: 'Content is empty' }],
    };
  }

  // Extract epic sections
  const epicSections = extractEpicSections(content);

  if (epicSections.length === 0) {
    return {
      success: false,
      errors: [{ location: 'File', message: 'No epics found. Expected "## Epic N:" headers.' }],
    };
  }

  // Parse each epic
  const epics: BmadEpic[] = [];
  for (const epicSection of epicSections) {
    const epic = parseEpic(epicSection, errors);
    epics.push(epic);
  }

  // Check for errors
  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    epics: { epics },
  };
}
