/**
 * BMAD Module - Stories 32-2, 32-3, 32-4
 *
 * Utilities for parsing and working with BMAD artifacts.
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
