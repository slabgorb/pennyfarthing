# Architecture Patterns

## Code Patterns

### 1. Error Handling: Result Objects

Functions return structured result objects instead of throwing exceptions:

```typescript
export interface CreateEpicResult {
  success: boolean;
  jiraKey?: string;
  url?: string;
  error?: string;
}

export async function createJiraEpic(params: CreateEpicParams): Promise<CreateEpicResult> {
  try {
    // ... implementation
    return { success: true, jiraKey: 'PROJ-123', url: '...' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
```

**Benefits:**
- Explicit error handling required by callers
- Type-safe error information
- No unexpected exceptions

### 2. Import Organization

```typescript
// 1. Node.js built-ins
import { fileURLToPath } from 'url';
import { join } from 'path';

// 2. Third-party packages (alphabetical)
import express, { Express } from 'express';
import yaml from 'yaml';

// 3. Project imports (with .js extension for ESM)
import { publicDir } from './paths.js';
import type { StoryMetadata } from './types.js';
```

**Rules:**
- `.js` extensions required for all relative imports (ESM)
- `import type` for type-only imports
- Alphabetical ordering within sections

### 3. Naming Conventions

| Type | Convention | Examples |
|------|------------|----------|
| **Functions** | camelCase with action prefix | `parseStatus()`, `ensureEpicExists()` |
| **Constants** | SCREAMING_SNAKE_CASE | `VALID_STATUSES`, `DEFAULT_PORT` |
| **Interfaces** | PascalCase with suffix | `CreateEpicParams`, `RoutingResult` |
| **Private** | Underscore prefix | `_mockResponse`, `_internalState` |

**Function Prefixes:**
- `parse*` - Parse/transform data
- `extract*` - Pull data from structures
- `ensure*` - Guarantee state/existence
- `is*` / `check*` - Boolean checks
- `find*` - Search operations
- `create*` / `build*` - Construction

### 4. File Structure

```typescript
// 1. JSDoc header
/**
 * BMAD Story File Parser - Story 32-2
 * Parses BMAD-format story files for import
 */

// 2. Imports
import { readFileSync } from 'fs';
import type { ParseResult } from './types.js';

// =============================================================================
// Types
// =============================================================================

interface BmadTask {
  text: string;
  completed: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractSections(content: string): Map<string, string> {
  // ...
}

// =============================================================================
// Main Export
// =============================================================================

export function parseBmadStory(content: string): ParseResult {
  // ...
}
```

### 5. Module Patterns

**Singleton with Configuration:**
```typescript
// logger.ts
interface LoggerOptions {
  quiet?: boolean;
  verbose?: boolean;
}

let options: LoggerOptions = {};

export function configure(opts: LoggerOptions): void {
  options = { ...options, ...opts };
}

export function log(message: string): void {
  if (options.quiet) return;
  console.log(message);
}
```

**Factory with Mock Support:**
```typescript
export async function createEpic(
  params: CreateEpicParams,
  _mockResponse?: CreateEpicResult  // For testing
): Promise<CreateEpicResult> {
  if (_mockResponse) return _mockResponse;
  // ... real implementation
}
```

## Architecture Patterns

### 1. Single Source of Truth

All agent/command/skill definitions live in `pennyfarthing-dist/`:

```
pennyfarthing-dist/           # Canonical definitions
    ↓ (symlinks)
.claude/commands/             # Claude Code discovery
.claude/skills/
.pennyfarthing/agents/        # Pennyfarthing discovery
.pennyfarthing/guides/
```

**Never modify** the symlinked directories; modify `pennyfarthing-dist/` instead.

### 2. State Detection (Not Explicit Commands)

Agents detect workflow state from session files, not explicit commands:

```typescript
// workflow-status-check detects state from:
// 1. .session/{story-id}-session.md exists?
// 2. Phase field in session file
// 3. Git branch state
// 4. Sprint YAML status

// Returns: NEW_WORK | IN_PROGRESS | FINISH | ERROR
```

### 3. Subagent Delegation

**Opus** handles reasoning and decisions.
**Haiku** subagents handle mechanical tasks:

```yaml
# Agent invokes subagent via Task tool
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: |
    Read and follow: .pennyfarthing/agents/testing-runner.md

    REPOS: all
    CONTEXT: Verify build after changes
```

### 4. Session File Coordination

All agents coordinate via `.session/{STORY_ID}-session.md`:

```markdown
## Story 35-12: Feature Title
**Phase:** green
**Status:** in_progress
**Workflow:** tdd

## Workflow Tracking
**Phase Started:** 2026-01-19T10:30:00Z

## TEA Assessment
[Written by TEA before handoff]

## Dev Assessment
[Written by Dev before handoff]
```

**Critical:** Agents must write their assessment BEFORE spawning handoff subagent.

### 5. Handoff Protocol

```
1. Agent completes work
2. Agent writes assessment to session file
3. Agent spawns handoff subagent
4. Subagent updates Workflow Tracking section
5. Subagent emits CYCLIST:HANDOFF marker
6. Next agent reads state and continues
```

## Data Flow Patterns

### 1. Configuration Cascade

```
1. pennyfarthing-dist/defaults     # Distributed defaults
2. .pennyfarthing/config.local.yaml # User theme override
3. Environment variables            # Runtime overrides
4. CLI arguments                    # Invocation overrides
```

### 2. Sprint Data Flow

```
sprint/current-sprint.yaml    # Source of truth
    ↓
SM reads sprint state
    ↓
Story selected → .session/{id}-session.md created
    ↓
Agents modify session file through workflow
    ↓
SM finish → Sprint YAML updated, session archived
```

### 3. Cyclist Data Flow

```
Claude Code → OTLP spans → otlp-receiver.ts
                              ↓
                    enriched-span-exporter.ts
                              ↓
                    WebSocket → Frontend UI
```

## Anti-Patterns to Avoid

| Anti-Pattern | Correct Pattern |
|--------------|-----------------|
| Throwing exceptions for business errors | Return result objects |
| Modifying symlinked directories | Modify pennyfarthing-dist/ |
| Hardcoding paths | Use configuration |
| Blocking on subagent results | Use background execution when possible |
| Writing assessment after handoff | Write assessment BEFORE spawning handoff |
| Reading entire files for small checks | Use targeted grep/extraction |

## Testing Patterns

### Mock Parameters

```typescript
// Functions accept optional mock parameters
export async function fetchData(
  url: string,
  _mockResponse?: Response
): Promise<Data> {
  if (_mockResponse) return parseResponse(_mockResponse);
  // ... real fetch
}
```

### Test File Naming

```
packages/cyclist/tests/
├── B-server.test.ts       # B- prefix convention
├── B-websocket.test.ts
└── B-story-parser.test.ts
```

### Test Environment

- **Cyclist:** Vitest with happy-dom (lightweight DOM)
- **Core/Shared:** Node.js native test runner
