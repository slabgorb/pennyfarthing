/**
 * BMAD Story File Parser - Story 32-2
 *
 * Parses BMAD story markdown files and converts to Pennyfarthing session format.
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
// Valid status values
// =============================================================================

const VALID_STATUSES = ['ready-for-dev', 'in-progress', 'review', 'done'] as const;
type BmadStatus = typeof VALID_STATUSES[number];

// =============================================================================
// Section extraction
// =============================================================================

interface Section {
  name: string;
  content: string;
}

/**
 * Extract sections from markdown content by splitting on ## headers.
 */
function extractSections(content: string): Section[] {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');

  const sections: Section[] = [];
  // Split on ## headers, keeping the header
  const parts = normalized.split(/^##\s*/m);

  for (const part of parts) {
    if (!part.trim()) continue;

    // First line is the header name, rest is content
    const lines = part.split('\n');
    const headerLine = lines[0].trim();
    const sectionContent = lines.slice(1).join('\n').trim();

    // Skip if this is just the title (starts with # Story:)
    if (headerLine.startsWith('# ')) continue;

    sections.push({
      name: headerLine,
      content: sectionContent,
    });
  }

  return sections;
}

/**
 * Find a section by name (case-insensitive, handles variations like "Tasks" vs "Tasks / Subtasks").
 */
function findSection(sections: Section[], ...names: string[]): Section | undefined {
  return sections.find(s => {
    const sectionName = s.name.toLowerCase();
    return names.some(name => sectionName.startsWith(name.toLowerCase()));
  });
}

// =============================================================================
// Title parsing
// =============================================================================

/**
 * Extract the story title from the H1 header.
 */
function extractTitle(content: string): string | null {
  // Normalize line endings first
  const normalized = content.replace(/\r\n/g, '\n');

  // Match # Story: [title]
  const match = normalized.match(/^#\s*Story:\s*(.+)$/m);
  if (!match) return null;
  return match[1].trim();
}

// =============================================================================
// Status parsing
// =============================================================================

/**
 * Parse and validate the status section.
 */
function parseStatus(content: string): { status: BmadStatus | null; error: ParseError | null } {
  const normalized = content.toLowerCase().trim();

  if (VALID_STATUSES.includes(normalized as BmadStatus)) {
    return { status: normalized as BmadStatus, error: null };
  }

  return {
    status: null,
    error: {
      section: 'Status',
      message: `Invalid status "${content.trim()}". Must be one of: ${VALID_STATUSES.join(', ')}`,
    },
  };
}

// =============================================================================
// Acceptance Criteria parsing
// =============================================================================

/**
 * Parse a single acceptance criterion, extracting Given/When/Then if present.
 */
function parseAcceptanceCriterion(line: string): BmadAcceptanceCriteria {
  // Remove leading "- " if present
  const raw = line.replace(/^-\s*/, '').trim();

  // Try to extract Given/When/Then
  const bddMatch = raw.match(/^Given\s+(.+?),\s*When\s+(.+?),\s*Then\s+(.+)$/i);

  if (bddMatch) {
    return {
      given: bddMatch[1].trim(),
      when: bddMatch[2].trim(),
      then: bddMatch[3].trim(),
      raw,
    };
  }

  // Non-BDD format - return with empty given/when/then
  return {
    given: '',
    when: '',
    then: '',
    raw,
  };
}

/**
 * Parse all acceptance criteria from the section content.
 */
function parseAcceptanceCriteria(content: string): BmadAcceptanceCriteria[] {
  const criteria: BmadAcceptanceCriteria[] = [];

  // Split by lines that start with "- "
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      criteria.push(parseAcceptanceCriterion(trimmed));
    }
  }

  return criteria;
}

// =============================================================================
// Task parsing
// =============================================================================

/**
 * Parse a single task line, extracting text and completed state.
 */
function parseTaskLine(line: string): { text: string; completed: boolean } | null {
  // Match checkbox: - [x] or - [ ]
  const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
  if (!match) return null;

  return {
    completed: match[1].toLowerCase() === 'x',
    text: match[2].trim(),
  };
}

/**
 * Parse tasks with nested subtasks.
 * Subtasks are indented with 2 spaces.
 */
function parseTasks(content: string): BmadTask[] {
  const tasks: BmadTask[] = [];
  const lines = content.split('\n');

  let currentTask: BmadTask | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Check indentation level
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    const trimmedLine = line.trim();

    const parsed = parseTaskLine(trimmedLine);
    if (!parsed) continue;

    if (indent === 0) {
      // Top-level task
      if (currentTask) {
        tasks.push(currentTask);
      }
      currentTask = {
        text: parsed.text,
        completed: parsed.completed,
      };
    } else if (indent >= 2 && currentTask) {
      // Subtask (2+ space indent)
      if (!currentTask.subtasks) {
        currentTask.subtasks = [];
      }
      currentTask.subtasks.push({
        text: parsed.text,
        completed: parsed.completed,
      });
    }
  }

  // Don't forget the last task
  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

// =============================================================================
// File List parsing
// =============================================================================

/**
 * Parse the file list section.
 */
function parseFileList(content: string): string[] {
  const files: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      files.push(trimmed.substring(2).trim());
    }
  }

  return files;
}

// =============================================================================
// Main Parser Function
// =============================================================================

/**
 * Parse a BMAD story markdown file and convert to BmadStory structure.
 *
 * @param content - Raw markdown content of BMAD story file
 * @returns ParseResult with success status and either story or errors
 */
export function parseBmadStory(content: string): ParseResult {
  const errors: ParseError[] = [];

  // Handle empty content
  if (!content || !content.trim()) {
    return {
      success: false,
      errors: [{ section: 'Title', message: 'Content is empty' }],
    };
  }

  // Extract title from H1
  const title = extractTitle(content);
  if (!title) {
    errors.push({
      section: 'Title',
      message: 'Missing story title. Expected "# Story: [title]" header.',
    });
  }

  // Extract sections
  const sections = extractSections(content);

  // Parse Status (required)
  const statusSection = findSection(sections, 'Status');
  let status: BmadStatus | null = null;
  if (!statusSection) {
    errors.push({
      section: 'Status',
      message: 'Missing Status section.',
    });
  } else {
    const statusResult = parseStatus(statusSection.content);
    if (statusResult.error) {
      errors.push(statusResult.error);
    } else {
      status = statusResult.status;
    }
  }

  // Parse Story (required)
  const storySection = findSection(sections, 'Story');
  let userStory = '';
  if (!storySection) {
    errors.push({
      section: 'Story',
      message: 'Missing Story section (user story).',
    });
  } else {
    userStory = storySection.content.trim();
  }

  // Parse Acceptance Criteria (required)
  const acSection = findSection(sections, 'Acceptance Criteria');
  let acceptanceCriteria: BmadAcceptanceCriteria[] = [];
  if (!acSection) {
    errors.push({
      section: 'Acceptance Criteria',
      message: 'Missing Acceptance Criteria section.',
    });
  } else {
    acceptanceCriteria = parseAcceptanceCriteria(acSection.content);
    if (acceptanceCriteria.length === 0) {
      errors.push({
        section: 'Acceptance Criteria',
        message: 'Acceptance Criteria section is empty. At least one criterion required.',
      });
    }
  }

  // Parse Tasks (optional)
  const tasksSection = findSection(sections, 'Tasks');
  const tasks = tasksSection ? parseTasks(tasksSection.content) : [];

  // Parse Dev Notes (optional)
  const devNotesSection = findSection(sections, 'Dev Notes');
  const devNotes = devNotesSection ? devNotesSection.content.trim() || null : null;

  // Parse Dev Agent Record (optional)
  const devAgentSection = findSection(sections, 'Dev Agent Record');
  const devAgentRecord = devAgentSection ? devAgentSection.content.trim() || null : null;

  // Parse File List (optional)
  const fileListSection = findSection(sections, 'File List');
  const fileList = fileListSection ? parseFileList(fileListSection.content) : [];

  // Return result
  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    story: {
      title: title!,
      status: status!,
      userStory,
      acceptanceCriteria,
      tasks,
      devNotes,
      devAgentRecord,
      fileList,
    },
  };
}
