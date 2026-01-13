/**
 * Tests for Story 32-4: BMAD Project Context Reader
 *
 * These tests define the contract for parsing BMAD project-context.md files.
 * Dev will implement parseBmadContext() to pass these tests.
 *
 * BMAD project-context format:
 * - Required: ## Overview, ## Technology Stack, ## Critical Implementation Rules
 * - Optional: ## Project Structure, ## Coding Standards, ## AI Agent Guidance,
 *             ## External Dependencies, ## Environment Setup
 *
 * Run with: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
// Import the parser function that Dev will implement
// This import will fail until the module is implemented
import { parseBmadContext, } from './context-reader.js';
// =============================================================================
// TEST DATA: Valid BMAD project-context examples
// =============================================================================
const MINIMAL_VALID_CONTEXT = `# Project Context

## Overview
A simple test project for validating the context parser.

## Technology Stack

### Frontend
- **Framework:** React
- **Language:** TypeScript

### Backend
- **Language:** Node.js
- **Framework:** Express

## Critical Implementation Rules

1. **Test First:** Always write tests before implementation.
`;
const COMPLETE_CONTEXT = `# Project Context

## Overview
TaskFlow is a collaborative task management application designed for small teams.
It enables real-time task tracking, team collaboration, and progress visualization.
The application serves 5,000+ daily active users and processes 50,000+ task updates per day.

## Technology Stack

### Frontend
- **Framework:** React 18 with hooks
- **Language:** TypeScript 5.0+
- **State Management:** Zustand for global state, React Query for server state
- **Styling:** Tailwind CSS with custom design tokens
- **Build Tool:** Vite 5

### Backend
- **Language:** Go 1.21+
- **Framework:** Gin with custom middleware
- **Database:** PostgreSQL 15 with pgx driver
- **Cache:** Redis 7 for sessions and real-time updates
- **API Style:** REST with OpenAPI 3.0 documentation

### Infrastructure
- **Cloud Provider:** AWS (us-east-1 primary, us-west-2 DR)
- **Container Runtime:** Docker with multi-stage builds
- **Orchestration:** ECS Fargate
- **CI/CD:** GitHub Actions with environment-based deployments

## Project Structure

\`\`\`
taskflow/
├── api/                    # Go backend
│   ├── cmd/server/         # Application entrypoint
│   └── internal/           # Internal packages
├── web/                    # React frontend
└── docs/                   # Documentation
\`\`\`

## Critical Implementation Rules

1. **No Raw SQL:** Always use parameterized queries via repository layer. SQL injection is a critical vulnerability.

2. **Auth Required by Default:** All API endpoints require authentication unless explicitly marked public. Use the \`@public\` decorator for exceptions.

3. **Soft Deletes Only:** Never hard-delete user data. Use \`deleted_at\` timestamp for all deletions. Required for audit compliance.

4. **Rate Limiting:** All public endpoints must have rate limiting. Default: 100 req/min per IP.

5. **Error Codes:** All API errors must use standard error codes from \`pkg/errors/codes.go\`. Never expose internal error messages to clients.

## Coding Standards

### Naming Conventions
- Go: Follow effective Go (MixedCaps for exports, mixedCaps for internal)
- React: PascalCase for components, camelCase for hooks (useXxx)
- Database: snake_case for all columns and tables
- API: camelCase for JSON fields

### Error Handling
- Go: Wrap errors with context using \`fmt.Errorf("operation: %w", err)\`
- React: Use error boundaries for component failures
- API: Return structured error responses with code, message, and details

### Testing Requirements
- Unit test coverage: minimum 80% for services layer
- Integration tests required for all API endpoints
- E2E tests for critical user journeys (login, task CRUD)

## AI Agent Guidance

### Do
- Read existing code patterns before implementing new features
- Follow the existing project structure - don't create new top-level directories
- Use existing utilities from \`pkg/\` before creating new ones
- Write tests alongside implementation, not after
- Check \`docs/adr/\` for architectural decision records before major changes

### Don't
- Don't add new dependencies without checking for existing alternatives
- Don't modify database schema without creating a migration
- Don't bypass the repository layer for database access
- Don't use \`any\` type in TypeScript - always define proper types

### Context Loading
For additional context, check:
- \`docs/adr/\` - Architectural decisions
- \`docs/api/\` - API specifications
- \`.github/CONTRIBUTING.md\` - Contribution guidelines

## External Dependencies

| Dependency | Purpose | Documentation |
|------------|---------|---------------|
| Zustand | Frontend state management | https://zustand-demo.pmnd.rs/ |
| React Query | Server state & caching | https://tanstack.com/query |
| Gin | HTTP router & middleware | https://gin-gonic.com/docs/ |
| pgx | PostgreSQL driver | https://github.com/jackc/pgx |
| Zap | Structured logging | https://pkg.go.dev/go.uber.org/zap |

## Environment Setup

1. Install dependencies:
   \`\`\`bash
   cd api && go mod download
   cd web && npm install
   \`\`\`

2. Set up local database:
   \`\`\`bash
   docker-compose up -d postgres redis
   make migrate
   \`\`\`
`;
const CONTEXT_WITHOUT_INFRASTRUCTURE = `# Project Context

## Overview
A frontend-only project with no backend.

## Technology Stack

### Frontend
- **Framework:** Vue 3
- **Language:** TypeScript
- **Build Tool:** Vite

## Critical Implementation Rules

1. **Component Isolation:** Each component should be self-contained.
`;
const CONTEXT_WITH_MULTILINE_RULES = `# Project Context

## Overview
Project with multi-line rule descriptions.

## Technology Stack

### Backend
- **Language:** Python
- **Framework:** FastAPI

## Critical Implementation Rules

1. **Database Access:** All database queries must go through the ORM layer.
Never write raw SQL. This ensures we maintain proper query logging
and can easily switch databases if needed.

2. **Error Handling:** Always catch exceptions at the controller layer.
Log the full stack trace but return sanitized error messages to clients.
Use error codes from the errors module.

3. **Simple Rule:** Keep it simple.
`;
// =============================================================================
// AC1: Detects project-context.md in project
// =============================================================================
describe('BMAD Context Reader (32-4)', () => {
    describe('AC1: File detection and basic parsing', () => {
        it('should parse a minimal valid context file', () => {
            const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
            assert.strictEqual(result.success, true, 'Should successfully parse minimal context');
            assert.ok(result.context, 'Should return context object');
        });
        it('should parse a complete context file with all sections', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true, 'Should successfully parse complete context');
            assert.ok(result.context, 'Should return context object');
        });
        it('should extract overview section', () => {
            const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.ok(result.context?.overview);
            assert.ok(result.context?.overview.includes('simple test project'));
        });
        it('should preserve multi-line overview content', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.ok(result.context?.overview.includes('TaskFlow'));
            assert.ok(result.context?.overview.includes('5,000+ daily active users'));
        });
        it('should return errors for empty content', () => {
            const result = parseBmadContext('');
            assert.strictEqual(result.success, false);
            assert.ok(result.errors && result.errors.length > 0);
        });
        it('should return errors for whitespace-only content', () => {
            const result = parseBmadContext('   \n\n   \t  ');
            assert.strictEqual(result.success, false);
        });
    });
    // ===========================================================================
    // AC2: Parses technology stack section
    // ===========================================================================
    describe('AC2: Technology Stack parsing', () => {
        describe('Frontend subsection', () => {
            it('should extract frontend framework', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.frontend?.framework, 'React');
            });
            it('should extract frontend language', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.frontend?.language, 'TypeScript');
            });
            it('should extract all frontend fields when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const frontend = result.context?.technologyStack.frontend;
                assert.strictEqual(frontend?.framework, 'React 18 with hooks');
                assert.strictEqual(frontend?.language, 'TypeScript 5.0+');
                assert.strictEqual(frontend?.stateManagement, 'Zustand for global state, React Query for server state');
                assert.strictEqual(frontend?.styling, 'Tailwind CSS with custom design tokens');
                assert.strictEqual(frontend?.buildTool, 'Vite 5');
            });
            it('should return undefined for missing frontend section', () => {
                const context = `# Project Context

## Overview
Backend only project.

## Technology Stack

### Backend
- **Language:** Go
- **Framework:** Gin

## Critical Implementation Rules

1. **Rule:** Description.
`;
                const result = parseBmadContext(context);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.frontend, undefined);
            });
        });
        describe('Backend subsection', () => {
            it('should extract backend language', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.backend?.language, 'Node.js');
            });
            it('should extract backend framework', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.backend?.framework, 'Express');
            });
            it('should extract all backend fields when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const backend = result.context?.technologyStack.backend;
                assert.strictEqual(backend?.language, 'Go 1.21+');
                assert.strictEqual(backend?.framework, 'Gin with custom middleware');
                assert.strictEqual(backend?.database, 'PostgreSQL 15 with pgx driver');
                assert.strictEqual(backend?.cache, 'Redis 7 for sessions and real-time updates');
                assert.strictEqual(backend?.apiStyle, 'REST with OpenAPI 3.0 documentation');
            });
            it('should return undefined for missing backend section', () => {
                const result = parseBmadContext(CONTEXT_WITHOUT_INFRASTRUCTURE);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.backend, undefined);
            });
        });
        describe('Infrastructure subsection', () => {
            it('should extract all infrastructure fields when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const infra = result.context?.technologyStack.infrastructure;
                assert.strictEqual(infra?.cloudProvider, 'AWS (us-east-1 primary, us-west-2 DR)');
                assert.strictEqual(infra?.containerRuntime, 'Docker with multi-stage builds');
                assert.strictEqual(infra?.orchestration, 'ECS Fargate');
                assert.strictEqual(infra?.ciCd, 'GitHub Actions with environment-based deployments');
            });
            it('should return undefined for missing infrastructure section', () => {
                const result = parseBmadContext(CONTEXT_WITHOUT_INFRASTRUCTURE);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.infrastructure, undefined);
            });
        });
        describe('Technology Stack edge cases', () => {
            it('should handle technology stack with only one subsection', () => {
                const context = `# Project Context

## Overview
Minimal stack project.

## Technology Stack

### Backend
- **Language:** Rust

## Critical Implementation Rules

1. **Rule:** Description.
`;
                const result = parseBmadContext(context);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.backend?.language, 'Rust');
                assert.strictEqual(result.context?.technologyStack.frontend, undefined);
                assert.strictEqual(result.context?.technologyStack.infrastructure, undefined);
            });
            it('should handle fields with extra whitespace', () => {
                const context = `# Project Context

## Overview
Test project.

## Technology Stack

### Frontend
-   **Framework:**   React
- **Language:**    TypeScript

## Critical Implementation Rules

1. **Rule:** Description.
`;
                const result = parseBmadContext(context);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.technologyStack.frontend?.framework, 'React');
                assert.strictEqual(result.context?.technologyStack.frontend?.language, 'TypeScript');
            });
            it('should handle fields without bold markers', () => {
                const context = `# Project Context

## Overview
Test project without bold.

## Technology Stack

### Frontend
- Framework: React
- Language: TypeScript

## Critical Implementation Rules

1. **Rule:** Description.
`;
                const result = parseBmadContext(context);
                assert.strictEqual(result.success, true);
                // Should still parse even without bold markers
                assert.strictEqual(result.context?.technologyStack.frontend?.framework, 'React');
                assert.strictEqual(result.context?.technologyStack.frontend?.language, 'TypeScript');
            });
        });
    });
    // ===========================================================================
    // AC3: Extracts implementation rules
    // ===========================================================================
    describe('AC3: Critical Implementation Rules parsing', () => {
        it('should extract single rule', () => {
            const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.implementationRules.length, 1);
            const rule = result.context?.implementationRules[0];
            assert.strictEqual(rule?.number, 1);
            assert.strictEqual(rule?.title, 'Test First');
            assert.strictEqual(rule?.description, 'Always write tests before implementation.');
        });
        it('should extract multiple rules', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.implementationRules.length, 5);
        });
        it('should extract rule numbers correctly', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.implementationRules[0]?.number, 1);
            assert.strictEqual(result.context?.implementationRules[1]?.number, 2);
            assert.strictEqual(result.context?.implementationRules[4]?.number, 5);
        });
        it('should extract rule titles correctly', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.implementationRules[0]?.title, 'No Raw SQL');
            assert.strictEqual(result.context?.implementationRules[1]?.title, 'Auth Required by Default');
            assert.strictEqual(result.context?.implementationRules[2]?.title, 'Soft Deletes Only');
        });
        it('should extract rule descriptions correctly', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            const rule = result.context?.implementationRules[0];
            assert.ok(rule?.description.includes('parameterized queries'));
            assert.ok(rule?.description.includes('SQL injection'));
        });
        it('should handle multi-line rule descriptions', () => {
            const result = parseBmadContext(CONTEXT_WITH_MULTILINE_RULES);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.implementationRules.length, 3);
            const rule1 = result.context?.implementationRules[0];
            assert.strictEqual(rule1?.title, 'Database Access');
            assert.ok(rule1?.description.includes('ORM layer'));
            assert.ok(rule1?.description.includes('easily switch databases'));
            const rule2 = result.context?.implementationRules[1];
            assert.strictEqual(rule2?.title, 'Error Handling');
            assert.ok(rule2?.description.includes('controller layer'));
            assert.ok(rule2?.description.includes('sanitized error messages'));
        });
        it('should preserve inline code in rule descriptions', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            const rule2 = result.context?.implementationRules[1];
            assert.ok(rule2?.description.includes('`@public`'));
        });
        it('should return empty array when rules section is missing', () => {
            const context = `# Project Context

## Overview
No rules project.

## Technology Stack

### Frontend
- **Framework:** React
`;
            const result = parseBmadContext(context);
            // Missing Critical Implementation Rules should cause error (it's required)
            assert.strictEqual(result.success, false);
            assert.ok(result.errors?.some((e) => e.section === 'Critical Implementation Rules'));
        });
        it('should handle rules with special characters in title', () => {
            const context = `# Project Context

## Overview
Test project.

## Technology Stack

### Frontend
- **Framework:** React

## Critical Implementation Rules

1. **API Versioning (v1/v2):** Support multiple API versions.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.implementationRules[0]?.title, 'API Versioning (v1/v2)');
        });
    });
    // ===========================================================================
    // AC4: Integrates with agent context loading - proper types and structure
    // ===========================================================================
    describe('AC4: Type structure and integration', () => {
        it('should return success: true for valid context', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            assert.ok(result.context);
            assert.strictEqual(result.errors, undefined);
        });
        it('should return success: false with errors for invalid context', () => {
            const context = `# Project Context

## Overview
Missing required sections.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.context, undefined);
            assert.ok(result.errors && result.errors.length > 0);
        });
        it('should populate all BmadProjectContext fields', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            const context = result.context;
            // Required fields
            assert.strictEqual(typeof context.overview, 'string');
            assert.ok(typeof context.technologyStack === 'object');
            assert.ok(Array.isArray(context.implementationRules));
            // Optional fields should be present when in content
            assert.ok(context.projectStructure === undefined || typeof context.projectStructure === 'string');
            assert.ok(context.codingStandards === undefined || typeof context.codingStandards === 'string');
            assert.ok(context.aiAgentGuidance === undefined || typeof context.aiAgentGuidance === 'object');
        });
        it('should have correct TechnologyStack structure', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            const stack = result.context?.technologyStack;
            // Frontend fields
            if (stack.frontend) {
                assert.ok(stack.frontend.framework === undefined || typeof stack.frontend.framework === 'string');
                assert.ok(stack.frontend.language === undefined || typeof stack.frontend.language === 'string');
                assert.ok(stack.frontend.stateManagement === undefined || typeof stack.frontend.stateManagement === 'string');
                assert.ok(stack.frontend.styling === undefined || typeof stack.frontend.styling === 'string');
                assert.ok(stack.frontend.buildTool === undefined || typeof stack.frontend.buildTool === 'string');
            }
            // Backend fields
            if (stack.backend) {
                assert.ok(stack.backend.language === undefined || typeof stack.backend.language === 'string');
                assert.ok(stack.backend.framework === undefined || typeof stack.backend.framework === 'string');
                assert.ok(stack.backend.database === undefined || typeof stack.backend.database === 'string');
                assert.ok(stack.backend.cache === undefined || typeof stack.backend.cache === 'string');
                assert.ok(stack.backend.apiStyle === undefined || typeof stack.backend.apiStyle === 'string');
            }
            // Infrastructure fields
            if (stack.infrastructure) {
                assert.ok(stack.infrastructure.cloudProvider === undefined || typeof stack.infrastructure.cloudProvider === 'string');
                assert.ok(stack.infrastructure.containerRuntime === undefined || typeof stack.infrastructure.containerRuntime === 'string');
                assert.ok(stack.infrastructure.orchestration === undefined || typeof stack.infrastructure.orchestration === 'string');
                assert.ok(stack.infrastructure.ciCd === undefined || typeof stack.infrastructure.ciCd === 'string');
            }
        });
        it('should have correct ImplementationRule structure', () => {
            const result = parseBmadContext(COMPLETE_CONTEXT);
            assert.strictEqual(result.success, true);
            const rule = result.context?.implementationRules[0];
            assert.strictEqual(typeof rule.number, 'number');
            assert.strictEqual(typeof rule.title, 'string');
            assert.strictEqual(typeof rule.description, 'string');
        });
        it('should include error details with section name', () => {
            const context = `# Project Context

## Overview
Missing tech stack and rules.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors?.some((e) => e.section === 'Technology Stack'));
            assert.ok(result.errors?.some((e) => e.section === 'Critical Implementation Rules'));
        });
        it('should accumulate multiple errors', () => {
            const context = `# Project Context
`;
            // Missing: Overview, Technology Stack, Critical Implementation Rules
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors && result.errors.length >= 3, 'Should report multiple errors');
        });
    });
    // ===========================================================================
    // AC5: Works alongside CLAUDE.md - optional sections and compatibility
    // ===========================================================================
    describe('AC5: Optional sections and CLAUDE.md compatibility', () => {
        describe('Project Structure section', () => {
            it('should extract project structure when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.ok(result.context?.projectStructure);
                assert.ok(result.context?.projectStructure?.includes('taskflow/'));
                assert.ok(result.context?.projectStructure?.includes('api/'));
            });
            it('should return undefined when project structure missing', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.projectStructure, undefined);
            });
        });
        describe('Coding Standards section', () => {
            it('should extract coding standards when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.ok(result.context?.codingStandards);
                assert.ok(result.context?.codingStandards?.includes('Naming Conventions'));
                assert.ok(result.context?.codingStandards?.includes('Error Handling'));
            });
            it('should return undefined when coding standards missing', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.codingStandards, undefined);
            });
        });
        describe('AI Agent Guidance section', () => {
            it('should extract AI agent guidance when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.ok(result.context?.aiAgentGuidance);
            });
            it('should parse Do subsection', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const guidance = result.context?.aiAgentGuidance;
                assert.ok(guidance?.do);
                assert.ok(Array.isArray(guidance?.do));
                assert.ok(guidance?.do?.some((item) => item.includes('existing code patterns')));
            });
            it('should parse Don\'t subsection', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const guidance = result.context?.aiAgentGuidance;
                assert.ok(guidance?.dont);
                assert.ok(Array.isArray(guidance?.dont));
                assert.ok(guidance?.dont?.some((item) => item.includes('new dependencies')));
            });
            it('should parse Context Loading subsection', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const guidance = result.context?.aiAgentGuidance;
                assert.ok(guidance?.contextLoading);
                assert.ok(guidance?.contextLoading?.includes('docs/adr/'));
            });
            it('should return undefined when AI guidance missing', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.aiAgentGuidance, undefined);
            });
        });
        describe('External Dependencies section', () => {
            it('should extract external dependencies when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.ok(result.context?.externalDependencies);
                assert.ok(Array.isArray(result.context?.externalDependencies));
            });
            it('should parse dependency table rows', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                const deps = result.context?.externalDependencies;
                assert.ok(deps && deps.length >= 5);
                const zustand = deps?.find((d) => d.name === 'Zustand');
                assert.ok(zustand);
                assert.strictEqual(zustand?.purpose, 'Frontend state management');
                assert.strictEqual(zustand?.documentation, 'https://zustand-demo.pmnd.rs/');
            });
            it('should return undefined when dependencies missing', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.externalDependencies, undefined);
            });
        });
        describe('Environment Setup section', () => {
            it('should extract environment setup when present', () => {
                const result = parseBmadContext(COMPLETE_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.ok(result.context?.environmentSetup);
                assert.ok(result.context?.environmentSetup?.includes('Install dependencies'));
                assert.ok(result.context?.environmentSetup?.includes('docker-compose'));
            });
            it('should return undefined when environment setup missing', () => {
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.context?.environmentSetup, undefined);
            });
        });
        describe('CLAUDE.md compatibility', () => {
            it('should not conflict with CLAUDE.md section names', () => {
                // CLAUDE.md uses sections like "## Build Commands", "## Architecture"
                // Our context reader should ignore these and focus on BMAD sections
                const context = `# Project Context

## Overview
Test project.

## Build Commands
This section should be ignored - it's CLAUDE.md format.

## Technology Stack

### Frontend
- **Framework:** React

## Critical Implementation Rules

1. **Rule:** Description.
`;
                const result = parseBmadContext(context);
                assert.strictEqual(result.success, true);
                // Should not have "Build Commands" as a recognized section
                assert.ok(result.context);
            });
            it('should parse context independently of CLAUDE.md', () => {
                // The parser should work on project-context.md content alone
                // without requiring CLAUDE.md to be present
                const result = parseBmadContext(MINIMAL_VALID_CONTEXT);
                assert.strictEqual(result.success, true);
                assert.ok(result.context);
            });
        });
    });
    // ===========================================================================
    // Edge cases and error handling
    // ===========================================================================
    describe('Edge cases and error handling', () => {
        it('should handle Windows line endings (CRLF)', () => {
            const context = '# Project Context\r\n\r\n## Overview\r\nTest project.\r\n\r\n## Technology Stack\r\n\r\n### Frontend\r\n- **Framework:** React\r\n\r\n## Critical Implementation Rules\r\n\r\n1. **Rule:** Description.\r\n';
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.technologyStack.frontend?.framework, 'React');
        });
        it('should handle extra blank lines between sections', () => {
            const context = `# Project Context



## Overview

Test project.



## Technology Stack


### Frontend
- **Framework:** React



## Critical Implementation Rules


1. **Rule:** Description.

`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
        });
        it('should handle section headers with extra spaces', () => {
            const context = `# Project Context

##   Overview
Test project.

##  Technology Stack

###   Frontend
- **Framework:** React

##    Critical Implementation Rules

1. **Rule:** Description.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
        });
        it('should handle missing H1 header gracefully', () => {
            const context = `## Overview
Test project without H1.

## Technology Stack

### Frontend
- **Framework:** React

## Critical Implementation Rules

1. **Rule:** Description.
`;
            const result = parseBmadContext(context);
            // Should still parse - H1 is just a title
            assert.strictEqual(result.success, true);
        });
        it('should handle technology fields with colons in values', () => {
            const context = `# Project Context

## Overview
Test project.

## Technology Stack

### Frontend
- **Framework:** React: The Modern Way
- **Language:** TypeScript: Strict Mode

## Critical Implementation Rules

1. **Rule:** Description.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.context?.technologyStack.frontend?.framework, 'React: The Modern Way');
        });
        it('should handle empty Technology Stack section', () => {
            const context = `# Project Context

## Overview
Test project.

## Technology Stack

## Critical Implementation Rules

1. **Rule:** Description.
`;
            const result = parseBmadContext(context);
            // Empty Technology Stack should result in empty object, not error
            assert.strictEqual(result.success, true);
            assert.ok(result.context?.technologyStack);
        });
        it('should handle rules without bold title format', () => {
            const context = `# Project Context

## Overview
Test project.

## Technology Stack

### Frontend
- **Framework:** React

## Critical Implementation Rules

1. Simple Rule: This rule has no bold formatting.
2. Another Rule: Also without bold.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
            // Should still parse rules even without bold
            assert.ok(result.context && result.context.implementationRules.length >= 2);
        });
        it('should handle markdown code blocks in content', () => {
            const context = `# Project Context

## Overview
Test project with code.

## Technology Stack

### Frontend
- **Framework:** React

## Critical Implementation Rules

1. **Code Rule:** Use this pattern:
\`\`\`typescript
const x = 1;
\`\`\`
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, true);
            assert.ok(result.context?.implementationRules[0]?.description.includes('pattern'));
        });
        it('should handle content with no matching sections', () => {
            const context = `# Random Document

This is not a BMAD project context file.

## Some Random Section
Content here.
`;
            const result = parseBmadContext(context);
            assert.strictEqual(result.success, false);
            assert.ok(result.errors && result.errors.length > 0);
        });
    });
});
//# sourceMappingURL=context-reader.test.js.map