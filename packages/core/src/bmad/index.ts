/**
 * BMAD Module - Stories 32-2, 32-3, 32-4, 32-5, 32-6
 *
 * Utilities for parsing, importing, and exporting BMAD artifacts.
 */

// Story parser (32-2)
export {
  parseBmadStory,
  type BmadStory,
  type BmadTask,
  type BmadAcceptanceCriteria,
  type ParseResult,
  type ParseError,
} from './story-parser.js';

// Epics parser (32-3)
export {
  parseBmadEpics,
  convertStoryId,
  isValidStoryId,
  parseStoryId,
  type BmadEpic,
  type BmadEpicStory,
  type BmadEpicsFile,
  type BmadRequirement,
  type EpicsParseResult,
  type EpicsParseError,
} from './epics-parser.js';

// Context reader (32-4)
export {
  parseBmadContext,
  type BmadProjectContext,
  type TechnologyStack,
  type ImplementationRule,
  type AiAgentGuidance,
  type ExternalDependency,
  type ContextParseResult,
  type ContextParseError,
} from './context-reader.js';

// Story exporter (32-5)
export {
  exportToBmadStory,
  type SessionData,
  type AcceptanceCriterion,
  type Task,
  type ExportResult,
  type ExportError,
  type ExportOptions,
} from './story-exporter.js';

// Status sync (32-6)
export {
  // Story ID conversion
  bmadIdToPenny,
  pennyIdToBmad,
  isValidBmadStoryId,
  isValidPennyStoryId,
  // Status mapping
  mapBmadToPennyStatus,
  mapPennyToBmadStatus,
  // Parse, Import, Export
  parseBmadSprintStatus,
  convertBmadStoryToPenny,
  importFromBmadStatus,
  convertPennyStoryToBmad,
  exportToSprintStatus,
  // Conflict detection
  detectConflicts,
  // Types - BMAD
  type BmadStatus,
  type BmadSprintInfo,
  type BmadStoryStatus,
  type BmadMetrics,
  type BmadSprintStatus,
  // Types - Pennyfarthing
  type PennyStatus,
  type PennyStoryStatus,
  type PennySprintSummary,
  // Types - Results
  type SyncError,
  type ParseResult as StatusParseResult,
  type ExportResult as StatusExportResult,
  type Conflict,
  type ConflictResult,
  type ImportResult,
} from './status-sync.js';
