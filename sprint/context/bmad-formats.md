# BMAD Artifact Formats Reference

This document defines the canonical formats for all BMAD (Build Measure Analyze Decide) artifacts. Use this as the source of truth for Epic 32 implementation work (parsers, importers, exporters).

## Overview

BMAD is an AI-assisted planning framework that generates structured artifacts for software development. Pennyfarthing's Epic 32 enables bidirectional compatibility:

```
BMAD Planning → Import → Pennyfarthing TDD → Export → BMAD Records
```

**Four artifact types:**
1. **Story files** - Individual story tracking (`.md`)
2. **Epics files** - Epic/story hierarchy (`epics.md`)
3. **Sprint status** - Sprint tracking (`sprint-status.yaml`)
4. **Project context** - Technology and rules (`project-context.md`)

---

## 1. BMAD Story File Format

**Filename pattern:** `stories/story-N.M.md` or `story-{slug}.md`
**Purpose:** Track individual story progress, tasks, and development notes

### Complete Template

```markdown
# Story: [Title]

## Status
[ready-for-dev | in-progress | review | done]

## Story
As a [user type], I want [capability], so that [benefit]

## Acceptance Criteria
- Given [context], When [action], Then [expected result]
- Given [context], When [action], Then [expected result]

## Tasks / Subtasks
- [ ] Task 1
  - [ ] Subtask 1.1
  - [ ] Subtask 1.2
- [ ] Task 2
- [x] Task 3 (completed)

## Dev Notes
[Notes added during development - timestamps, decisions, blockers]

## Dev Agent Record
[AI agent session log - commands run, files changed, reasoning]

## File List
[Files created/modified during implementation]
- path/to/file1.ts - Created: Description
- path/to/file2.ts - Modified: What changed
```

### Field Descriptions

| Section | Required | Description |
|---------|----------|-------------|
| `# Story:` | Yes | Story title as H1 header |
| `## Status` | Yes | Current workflow state |
| `## Story` | Yes | User story in "As a...I want...so that" format |
| `## Acceptance Criteria` | Yes | BDD-style criteria (Given/When/Then) |
| `## Tasks / Subtasks` | No | Checkbox task list with optional nesting |
| `## Dev Notes` | No | Freeform development notes |
| `## Dev Agent Record` | No | AI agent session logs |
| `## File List` | No | Files changed during implementation |

### Status Values

| Status | Description | Pennyfarthing Equivalent |
|--------|-------------|-------------------------|
| `ready-for-dev` | Ready to be picked up | `backlog` |
| `in-progress` | Currently being worked | `in_progress` |
| `review` | Implementation complete, awaiting review | `needs_review` |
| `done` | Approved and completed | `done` |

### Acceptance Criteria Format

BMAD uses BDD-style (Behavior-Driven Development) acceptance criteria:

```markdown
## Acceptance Criteria
- Given I am logged in as an admin, When I navigate to /settings, Then I see the admin panel
- Given an invalid email format, When I submit the form, Then I see a validation error
```

**Parsing notes:**
- Each criterion is a bullet point starting with `- Given`
- Three parts: Given (context), When (action), Then (result)
- May span multiple lines if wrapped

### Task Checkbox Format

```markdown
## Tasks / Subtasks
- [ ] Uncompleted task
- [x] Completed task
  - [ ] Nested subtask (2 space indent)
  - [x] Completed nested subtask
```

**Parsing notes:**
- Top-level tasks have no indentation
- Subtasks use 2-space indentation
- Checkbox state: `[ ]` = incomplete, `[x]` = complete

### Example: Real Story File

```markdown
# Story: User Profile Photo Upload

## Status
in-progress

## Story
As a registered user, I want to upload a profile photo, so that other users can identify me visually

## Acceptance Criteria
- Given I am on my profile page, When I click "Upload Photo", Then I see a file picker dialog
- Given I select a valid image (JPG/PNG under 5MB), When I confirm upload, Then my photo appears on my profile
- Given I select an invalid file, When I try to upload, Then I see an appropriate error message
- Given I have an existing photo, When I upload a new one, Then the old photo is replaced

## Tasks / Subtasks
- [x] Create photo upload API endpoint
  - [x] Add file validation (type, size)
  - [x] Implement S3 storage integration
  - [x] Generate thumbnail versions
- [ ] Build frontend upload component
  - [ ] File picker with drag-and-drop
  - [ ] Preview before upload
  - [x] Progress indicator
- [ ] Write integration tests

## Dev Notes
2024-01-15: Started implementation. Using pre-signed S3 URLs for direct upload.
2024-01-16: Hit CORS issue with S3, resolved by updating bucket policy.

## Dev Agent Record
Session: abc123
Commands:
- npm run test:upload -- passed
- aws s3 cp test.jpg s3://bucket/test/ -- verified upload

## File List
- src/api/upload.ts - Created: Photo upload endpoint with S3 integration
- src/components/PhotoUpload.tsx - Created: React component for file selection
- src/utils/imageValidation.ts - Created: File type and size validation
- tests/upload.test.ts - Created: Integration tests for upload flow
```

---

## 2. BMAD Epics File Format

**Filename:** `epics.md` (single file containing all epics and stories)
**Purpose:** Define epic/story hierarchy with acceptance criteria and requirements coverage

### Complete Template

```markdown
# Project Epics

## Epic 1: [Epic Title]

[Epic description - what this epic accomplishes and why it matters]

### Story 1.1: [Story Title]
**Points:** N
**Priority:** P0 | P1 | P2

#### Description
[User story or detailed description]

#### Acceptance Criteria
- Given [context], When [action], Then [result]

#### Requirements Coverage
- REQ-001: [Requirement description]
- REQ-002: [Another requirement]

### Story 1.2: [Another Story]
**Points:** N
**Priority:** P1

#### Description
[Description]

#### Acceptance Criteria
- Given..., When..., Then...

---

## Epic 2: [Another Epic]

[Epic description]

### Story 2.1: [Story Title]
...
```

### Field Descriptions

| Element | Level | Required | Description |
|---------|-------|----------|-------------|
| `## Epic N:` | H2 | Yes | Epic title with numeric ID |
| Epic description | Paragraph | Yes | What the epic accomplishes |
| `### Story N.M:` | H3 | Yes | Story title with epic.story ID |
| `**Points:**` | Bold | Yes | Story point estimate |
| `**Priority:**` | Bold | Yes | P0 (highest) to P2 (lowest) |
| `#### Description` | H4 | Yes | User story or description |
| `#### Acceptance Criteria` | H4 | Yes | BDD-style criteria |
| `#### Requirements Coverage` | H4 | No | Links to requirements |

### Story ID Format

BMAD uses dot notation: `N.M` where:
- `N` = Epic number (1, 2, 3...)
- `M` = Story number within epic (1, 2, 3...)

**Mapping to Pennyfarthing:** `N.M` → `N-M` (dot becomes dash)

### Priority Levels

| Priority | Description | SLA |
|----------|-------------|-----|
| P0 | Critical / Blocker | Immediate |
| P1 | High impact | This sprint |
| P2 | Normal priority | Next sprint OK |

### Requirements Coverage

Links stories to external requirements or specifications:

```markdown
#### Requirements Coverage
- REQ-AUTH-001: Users must authenticate before accessing protected resources
- REQ-AUDIT-003: All data modifications must be logged with timestamp and user
```

### Example: Real Epics File

```markdown
# Project Epics

## Epic 1: User Authentication

Enable secure user authentication with multiple providers and session management.

### Story 1.1: Email/Password Login
**Points:** 5
**Priority:** P0

#### Description
As a user, I want to log in with my email and password, so that I can access my account securely

#### Acceptance Criteria
- Given I am on the login page, When I enter valid credentials, Then I am redirected to the dashboard
- Given I enter invalid credentials, When I submit, Then I see an error message and can retry
- Given I am logged in, When I close and reopen the browser, Then I remain logged in (session persistence)

#### Requirements Coverage
- REQ-AUTH-001: Support email/password authentication
- REQ-SEC-002: Passwords must be hashed with bcrypt

### Story 1.2: OAuth Integration
**Points:** 8
**Priority:** P1

#### Description
As a user, I want to log in with Google or GitHub, so that I don't need to remember another password

#### Acceptance Criteria
- Given I click "Login with Google", When I authorize, Then I am logged in with my Google identity
- Given I click "Login with GitHub", When I authorize, Then I am logged in with my GitHub identity
- Given I have an existing account, When I OAuth with the same email, Then accounts are linked

#### Requirements Coverage
- REQ-AUTH-002: Support OAuth 2.0 providers
- REQ-AUTH-003: Link OAuth identities to existing accounts by email

---

## Epic 2: User Profile Management

Allow users to manage their profile information and preferences.

### Story 2.1: Edit Profile
**Points:** 3
**Priority:** P1

#### Description
As a user, I want to edit my profile information, so that I can keep my details up to date

#### Acceptance Criteria
- Given I am on my profile page, When I edit my name, Then it is updated across the application
- Given I change my email, When I save, Then I receive a verification email at the new address
```

---

## 3. BMAD Sprint Status Format

**Filename:** `sprint-status.yaml`
**Purpose:** Track sprint progress, story status, and velocity metrics

### Complete Schema

```yaml
sprint:
  number: 10                          # Sprint number (integer)
  goal: "Sprint goal description"     # Human-readable goal
  start_date: 2024-01-15              # ISO date (YYYY-MM-DD)
  end_date: 2024-01-26                # ISO date (YYYY-MM-DD)

stories:
  - id: "1.1"                         # Story ID (string, dot notation)
    title: "Story title"              # Human-readable title
    epic: "Epic 1"                    # Parent epic name
    status: in-progress               # Current status
    assignee: "Developer Name"        # Assigned developer (optional)
    points: 5                         # Story points (integer)
    priority: P0                      # Priority level
    started: 2024-01-16               # Date work started (optional)
    completed: null                   # Date completed (optional/null)
    blockers: []                      # List of blocking issues (optional)

  - id: "1.2"
    title: "Another story"
    epic: "Epic 1"
    status: ready-for-dev
    points: 3
    priority: P1

metrics:
  total_points: 21                    # Sum of all story points
  completed_points: 8                 # Points of done stories
  in_progress_points: 5               # Points of in-progress stories
  velocity: 18                        # Historical velocity (optional)
  burndown:                           # Daily burndown data (optional)
    - date: 2024-01-15
      remaining: 21
    - date: 2024-01-16
      remaining: 18
```

### Field Descriptions

#### Sprint Section

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | integer | Yes | Sprint sequence number |
| `goal` | string | Yes | Sprint objective |
| `start_date` | date | Yes | Sprint start (YYYY-MM-DD) |
| `end_date` | date | Yes | Sprint end (YYYY-MM-DD) |

#### Stories Section

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Story ID in "N.M" format |
| `title` | string | Yes | Story title |
| `epic` | string | No | Parent epic name |
| `status` | enum | Yes | Workflow status |
| `assignee` | string | No | Developer assigned |
| `points` | integer | Yes | Story point estimate |
| `priority` | enum | Yes | P0, P1, or P2 |
| `started` | date | No | Date work began |
| `completed` | date | No | Date work finished |
| `blockers` | list | No | Blocking issues |

#### Metrics Section

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `total_points` | integer | Yes | Sum of all points |
| `completed_points` | integer | Yes | Points of done stories |
| `in_progress_points` | integer | No | Points being worked |
| `velocity` | integer | No | Team velocity |
| `burndown` | list | No | Daily remaining points |

### Status Values

| BMAD Status | Description | Pennyfarthing Equivalent |
|-------------|-------------|-------------------------|
| `ready-for-dev` | In backlog, ready to start | `backlog` |
| `in-progress` | Currently being worked | `in_progress` |
| `review` | Awaiting code review | `needs_review` |
| `done` | Completed and accepted | `done` |
| `blocked` | Cannot proceed | `blocked` |

### Example: Real Sprint Status

```yaml
sprint:
  number: 10
  goal: "Complete user authentication and begin profile management"
  start_date: 2024-01-15
  end_date: 2024-01-26

stories:
  - id: "1.1"
    title: "Email/Password Login"
    epic: "User Authentication"
    status: done
    assignee: "Alice Chen"
    points: 5
    priority: P0
    started: 2024-01-15
    completed: 2024-01-17

  - id: "1.2"
    title: "OAuth Integration"
    epic: "User Authentication"
    status: in-progress
    assignee: "Bob Smith"
    points: 8
    priority: P1
    started: 2024-01-18

  - id: "2.1"
    title: "Edit Profile"
    epic: "User Profile Management"
    status: ready-for-dev
    points: 3
    priority: P1

  - id: "1.3"
    title: "Password Reset Flow"
    epic: "User Authentication"
    status: blocked
    points: 3
    priority: P1
    blockers:
      - "Waiting for email service configuration"

metrics:
  total_points: 19
  completed_points: 5
  in_progress_points: 8
  velocity: 22
  burndown:
    - date: 2024-01-15
      remaining: 19
    - date: 2024-01-16
      remaining: 19
    - date: 2024-01-17
      remaining: 14
    - date: 2024-01-18
      remaining: 14
```

---

## 4. BMAD Project Context Format

**Filename:** `project-context.md`
**Purpose:** Provide AI agents and developers with project-specific context, rules, and guidance

### Complete Template

```markdown
# Project Context

## Overview
[Project description - what the project does, its purpose, and key objectives]

## Technology Stack

### Frontend
- **Framework:** [React/Vue/Angular/etc]
- **Language:** [TypeScript/JavaScript]
- **State Management:** [Redux/Zustand/Pinia/etc]
- **Styling:** [Tailwind/CSS Modules/styled-components]
- **Build Tool:** [Vite/webpack/etc]

### Backend
- **Language:** [Go/Python/Node.js/etc]
- **Framework:** [Gin/FastAPI/Express/etc]
- **Database:** [PostgreSQL/MySQL/MongoDB]
- **Cache:** [Redis/Memcached]
- **API Style:** [REST/GraphQL/gRPC]

### Infrastructure
- **Cloud Provider:** [AWS/GCP/Azure]
- **Container Runtime:** [Docker/Podman]
- **Orchestration:** [Kubernetes/ECS/etc]
- **CI/CD:** [GitHub Actions/GitLab CI/Jenkins]

## Project Structure
[Key directories and their purposes]

```
src/
├── api/           # API endpoints and handlers
├── components/    # React components
├── services/      # Business logic
├── utils/         # Shared utilities
└── types/         # TypeScript type definitions
```

## Critical Implementation Rules

1. **[Rule Name]:** [Rule description with rationale]
2. **[Another Rule]:** [Description]

## Coding Standards

### Naming Conventions
- [Convention 1]
- [Convention 2]

### Error Handling
[How errors should be handled across the codebase]

### Testing Requirements
[Testing standards and coverage expectations]

## AI Agent Guidance

### Do
- [Guidance for AI agents]

### Don't
- [Things to avoid]

### Context Loading
[How to load additional context if needed]

## External Dependencies

| Dependency | Purpose | Documentation |
|------------|---------|---------------|
| [Library] | [What it's used for] | [Link] |

## Environment Setup

[Instructions for setting up development environment]
```

### Field Descriptions

| Section | Required | Description |
|---------|----------|-------------|
| `## Overview` | Yes | Project purpose and objectives |
| `## Technology Stack` | Yes | Languages, frameworks, infrastructure |
| `## Project Structure` | No | Directory layout explanation |
| `## Critical Implementation Rules` | Yes | Must-follow rules for all code |
| `## Coding Standards` | No | Style and convention guidelines |
| `## AI Agent Guidance` | No | Specific instructions for AI assistants |
| `## External Dependencies` | No | Key libraries and their purposes |
| `## Environment Setup` | No | Dev environment instructions |

### Integration with Pennyfarthing

When BMAD `project-context.md` is present alongside Pennyfarthing's `CLAUDE.md`:
- Both are loaded as agent context
- `CLAUDE.md` takes precedence for conflicts
- Project context provides supplementary guidance

### Example: Real Project Context

```markdown
# Project Context

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

```
taskflow/
├── api/                    # Go backend
│   ├── cmd/server/         # Application entrypoint
│   ├── internal/
│   │   ├── handlers/       # HTTP handlers
│   │   ├── services/       # Business logic
│   │   ├── repository/     # Database access
│   │   └── models/         # Domain models
│   └── pkg/                # Shared packages
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # Custom hooks
│   │   ├── stores/         # Zustand stores
│   │   └── api/            # API client
│   └── tests/              # Frontend tests
└── docs/                   # Documentation
```

## Critical Implementation Rules

1. **No Raw SQL:** Always use parameterized queries via repository layer. SQL injection is a critical vulnerability.

2. **Auth Required by Default:** All API endpoints require authentication unless explicitly marked public. Use the `@public` decorator for exceptions.

3. **Soft Deletes Only:** Never hard-delete user data. Use `deleted_at` timestamp for all deletions. Required for audit compliance.

4. **Rate Limiting:** All public endpoints must have rate limiting. Default: 100 req/min per IP.

5. **Error Codes:** All API errors must use standard error codes from `pkg/errors/codes.go`. Never expose internal error messages to clients.

## Coding Standards

### Naming Conventions
- Go: Follow effective Go (MixedCaps for exports, mixedCaps for internal)
- React: PascalCase for components, camelCase for hooks (useXxx)
- Database: snake_case for all columns and tables
- API: camelCase for JSON fields

### Error Handling
- Go: Wrap errors with context using `fmt.Errorf("operation: %w", err)`
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
- Use existing utilities from `pkg/` before creating new ones
- Write tests alongside implementation, not after
- Check `docs/adr/` for architectural decision records before major changes

### Don't
- Don't add new dependencies without checking for existing alternatives
- Don't modify database schema without creating a migration
- Don't bypass the repository layer for database access
- Don't use `any` type in TypeScript - always define proper types

### Context Loading
For additional context, check:
- `docs/adr/` - Architectural decisions
- `docs/api/` - API specifications
- `.github/CONTRIBUTING.md` - Contribution guidelines

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
   ```bash
   # Backend
   cd api && go mod download

   # Frontend
   cd web && npm install
   ```

2. Set up local database:
   ```bash
   docker-compose up -d postgres redis
   make migrate
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

4. Run development servers:
   ```bash
   # Terminal 1: Backend
   make run-api

   # Terminal 2: Frontend
   cd web && npm run dev
   ```
```

---

## Format Mapping Summary

Quick reference for converting between BMAD and Pennyfarthing formats:

### Story IDs
| BMAD | Pennyfarthing | Example |
|------|---------------|---------|
| `N.M` (dot) | `N-M` (dash) | `1.3` → `1-3` |

### Status Values
| BMAD | Pennyfarthing |
|------|---------------|
| `ready-for-dev` | `backlog` |
| `in-progress` | `in_progress` |
| `review` | `needs_review` |
| `done` | `done` |
| `blocked` | `blocked` |

### Acceptance Criteria
| BMAD | Pennyfarthing |
|------|---------------|
| BDD format (Given/When/Then) | Simple text bullets |

### File Locations
| BMAD | Pennyfarthing |
|------|---------------|
| `stories/story-N.M.md` | `.session/{N-M}-session.md` |
| `epics.md` | `sprint/current-sprint.yaml` |
| `sprint-status.yaml` | `sprint/current-sprint.yaml` |
| `project-context.md` | `CLAUDE.md` |

---

## Parsing Guidelines

For implementers of stories 32-2 through 32-6:

### Markdown Section Parsing
1. Split content on `## ` (H2) or `### ` (H3) headers
2. Extract header text as section name
3. Content is everything until next header of same or higher level
4. Handle nested headers (H4 within H3)

### YAML Parsing
1. Use standard YAML parser
2. Handle null values for optional fields
3. Validate enum values (status, priority)
4. Parse dates as ISO format

### Edge Cases to Handle
- Missing optional sections (return null/empty)
- Extra whitespace around field values
- Markdown formatting within content (bold, italic, code)
- Multi-line acceptance criteria
- Nested task checkboxes
- Empty file lists

---

*Document created for Epic 32: BMAD Artifact Compatibility*
*Reference for stories 32-2 through 32-6*
