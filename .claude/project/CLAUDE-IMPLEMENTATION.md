# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in Pennyfarthing. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core
- **TypeScript** 5.3.3+ (strict mode, ES2022 target, NodeNext module resolution)
- **Node.js** >=18.0.0 (ES modules only, no CommonJS)
- **pnpm** 9.0.0 (monorepo workspaces)

### Packages
| Package | Purpose | Test Framework |
|---------|---------|----------------|
| @pennyfarthing/core | CLI and agent definitions | Node.js native test runner |
| @pennyfarthing/shared | Shared utilities | Node.js native test runner |
| @pennyfarthing/cyclist | Visual terminal (Electron) | Vitest 4.x |
| @pennyfarthing/vscode-extension | VS Code integration | - |

### Key Dependencies
- **Commander** 12.x - CLI framework
- **Express** 4.x - Cyclist web server
- **Electron** 35.x - Cyclist desktop app
- **yaml** 2.x - YAML parsing for sprint/config files

---

## Critical Implementation Rules

### Language-Specific Rules

#### TypeScript Configuration
- **Strict mode enabled** - All strict checks active (noImplicitAny, strictNullChecks, etc.)
- **Target ES2022** - Use modern JS features (top-level await, private fields, etc.)
- **NodeNext resolution** - Required for ESM compatibility

#### ESM Import Requirements (ADR-0010)
- **ALWAYS use `.js` extension** in relative imports, even for `.ts` files
  ```typescript
  // Correct
  import { logger } from './utils/logger.js';

  // Wrong - will fail at runtime
  import { logger } from './utils/logger';
  ```
- **No CommonJS** - Never use `require()` or `module.exports`

#### Error Handling (ADR-0008)
- **Return result objects**, never throw exceptions for expected failures
  ```typescript
  // Correct
  function doThing(): { success: boolean; data?: T; error?: string } {
    if (failed) return { success: false, error: 'Reason' };
    return { success: true, data: result };
  }

  // Wrong
  function doThing(): T {
    if (failed) throw new Error('Reason');
    return result;
  }
  ```

#### Naming Conventions
- **Files**: kebab-case (`workflow-status.ts`, `session-file.ts`)
- **Classes/Types**: PascalCase (`WorkflowStatus`, `SessionFile`)
- **Functions/Variables**: camelCase (`getWorkflowStatus`, `sessionData`)

---

### Framework-Specific Rules

#### Monorepo Structure (ADR-0005)
- **Single source of truth**: All definitions live in `pennyfarthing-dist/`
- **Never modify symlinked directories**: `.claude/` and `.pennyfarthing/` contain symlinks
- **Modify the source**: Edit files in `pennyfarthing-dist/`, symlinks propagate changes

#### Subagent Delegation Model (ADR-0007)
- **Opus for reasoning** - Complex decisions, code review, architecture
- **Haiku for mechanical work** - Tests, git operations, status checks, file parsing

#### State Detection Pattern (ADR-0006)
- **Read state from session files** - Never hardcode workflow state
- **Session location**: `.session/{story-id}-session.md`
- **Detect, don't assume** - Check `**Phase:**` field to determine current state

#### Session File Coordination (ADR-0009)
- **Write assessment BEFORE handoff** - Assessment must be in session file before spawning handoff subagent
- **Order matters**: Write -> Then spawn subagent (not reverse)

#### Build Output
- **`dist/` is tracked** - Committed to git, not gitignored
- **Commit together** - Always commit `dist/` changes alongside `src/` changes

---

### Testing Rules

#### Test Framework Selection
- **Cyclist package**: Use Vitest (`vitest run`, `vitest watch`)
- **Core/Shared packages**: Use Node.js native test runner (`node --test`)
- **Test file naming**: `*.test.ts` (Cyclist uses `B-*.test.ts` prefix for some tests)

#### Test Organization
- **Co-locate tests**: Tests live in `tests/` directory within each package
- **Mock patterns**: Use Vitest mocking for Cyclist, native mocks for core/shared

#### Running Tests
```bash
pnpm test           # Run all tests across monorepo
pnpm --filter @pennyfarthing/cyclist test  # Run Cyclist tests only
```

---

### Code Quality & Style Rules

#### ESLint Configuration
- **Flat config format**: Uses `eslint.config.mjs` (ESLint 9.x)
- **TypeScript-ESLint**: Recommended rules enabled
- **Unused vars**: Warning level with `_` prefix ignore pattern
- **No explicit any**: Warning level (cleanup in progress)

#### Linting
```bash
pnpm lint           # Lint all packages
```

#### Formatting
- No Prettier configured - follow ESLint rules
- Consistent indentation (2 spaces for TS/JS)

---

### Development Workflow Rules

#### Git Conventions
- **Branch naming**: `feature/`, `fix/`, `chore/` prefixes
- **Commit messages**: Conventional commits format (`feat:`, `fix:`, `chore:`, `docs:`)
- **PR workflow**: Feature branches merge to `develop`, releases to `main`

#### Build Commands
```bash
pnpm build          # Build all packages (shared -> core -> cyclist)
pnpm dev            # Watch mode for all packages
pnpm clean          # Remove dist/ directories
```

#### Sprint Tracking
- **Sprint file**: `sprint/current-sprint.yaml`
- **Session files**: `.session/{story-id}-session.md`
- **Never edit directly**: Use `/sprint` and `/work` commands

---

### Critical Don't-Miss Rules

#### Anti-Patterns to Avoid
- **Don't modify symlinked dirs** - Edit `pennyfarthing-dist/` source instead
- **Don't throw for expected failures** - Return `{success: false, error: '...'}`
- **Don't omit `.js` extension** - ESM requires explicit extensions
- **Don't use Opus for mechanical tasks** - Use Haiku subagents
- **Don't hardcode workflow state** - Detect from session files
- **Don't commit src/ without dist/** - They must stay in sync

#### Edge Cases
- **Cyclist has different test framework** than core/shared (Vitest vs native)
- **Some workflows are stepped** (BikeLane) vs phased (agent-driven)
- **Personas are theme-based** - Check `.pennyfarthing/config.local.yaml` for active theme

#### Security Considerations
- **No secrets in sprint YAML** - Use environment variables
- **Session files may contain story context** - Don't commit sensitive data

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Check ADRs in `docs/adr/` for detailed rationale

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules

---

Last Updated: 2026-01-23
