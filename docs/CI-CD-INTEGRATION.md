# CI/CD Integration Patterns

Document patterns for using Pennyfarthing in automated CI/CD pipelines, including CI environment setup, automated review workflows, git hooks, and GitHub Actions examples.

## CI Environment Setup

### GitHub Actions

Pennyfarthing uses GitHub Actions for CI. Example workflow:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Get pnpm store directory
        id: pnpm-cache
        run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm run build

      - name: Test
        run: pnpm test

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
```

### Multi-Job Parallelization

Run independent jobs in parallel:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    # Build and test

  lint:
    runs-on: ubuntu-latest
    # Lint check (runs parallel to build)

  security:
    runs-on: ubuntu-latest
    # Security scan (runs parallel to both)
```

### Package Publishing

For npm package releases:

```yaml
# .github/workflows/publish.yml
name: Publish
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      package:
        description: 'Package to publish'
        type: choice
        options:
          - core
          - shared
          - all
      dry-run:
        description: 'Dry run (no publish)'
        type: boolean
        default: false

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # For npm provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install
      - run: pnpm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Git Hooks Integration

### Installed Hooks

Pennyfarthing installs these git hooks:

| Hook | Purpose |
|------|---------|
| `pre-commit` | Block commits to protected branches |
| `pre-push` | Remind to sync sprint changes to Jira |
| `post-merge` | Auto-update sprint status on merge |

### pre-commit: Branch Protection

Prevents direct commits to main/develop:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit → pennyfarthing-dist/scripts/hooks/pre-commit.sh

BRANCH=$(git rev-parse --abbrev-ref HEAD)

case "$BRANCH" in
  main|develop)
    # Allow sprint/ folder commits on develop
    if [[ "$BRANCH" == "develop" ]]; then
      STAGED=$(git diff --cached --name-only)
      if echo "$STAGED" | grep -qE "^sprint/"; then
        exit 0  # Allow sprint file updates
      fi
    fi

    echo "ERROR: Direct commits to $BRANCH are blocked"
    echo "Create a feature branch: git checkout -b feat/X-Y-description"
    exit 1
    ;;
esac

exit 0
```

### post-merge: Sprint Auto-Update

Automatically marks stories as done when branches merge:

```bash
#!/usr/bin/env bash
# .git/hooks/post-merge → pennyfarthing-dist/scripts/hooks/post-merge.sh

# Extract merged branch names matching feat/X-Y-* pattern
MERGED_BRANCHES=$(git log --merges --format="%s" HEAD~1..HEAD | \
  grep -oE "feat/[0-9]+-[0-9]+-[a-z-]+")

for branch in $MERGED_BRANCHES; do
  story_id=$(echo "$branch" | grep -oE "[0-9]+-[0-9]+")

  # Update sprint YAML status to done
  yq -i ".stories[] |= select(.id == \"$story_id\").status = \"done\"" \
    sprint/current-sprint.yaml

  # Log reconciliation event
  echo "$(date -Iseconds)|$story_id|merged" >> .session/reconciliation.log
done
```

### Installing Hooks

Hooks are installed automatically by `pf setup`:

```bash
# Or manually
pf doctor --fix

# Or install script
.pennyfarthing/scripts/git/install-git-hooks.sh
```

## Quality Gate Automation

### check.sh - Pre-Handoff Verification

Comprehensive quality check before agent handoffs:

```bash
# Usage
.pennyfarthing/scripts/workflow/check.sh [OPTIONS]

# Options
--skip-check       # Emergency bypass
--tests-only       # Run only tests
--filter PATTERN   # Filter tests by pattern
--repo REPO        # Check specific repo
--no-lint          # Skip lint
--no-typecheck     # Skip type check
```

### Check Sequence

```
Quality Gate Check
==================
Section: Lint
  [PASS] Lint (pnpm run lint)

Section: Type Check
  [PASS] Type Check (tsc --noEmit)

Section: Tests
  [PASS] Tests (pnpm test)

Summary
=======
Checks run:    3
Checks passed: 3
Checks failed: 0
Checks skipped: 0

PASSED - All checks passed
```

### Project Detection

The script auto-detects project type:

| Project | Lint | Type Check | Tests |
|---------|------|------------|-------|
| Node.js | `pnpm run lint` or ESLint | `tsc --noEmit` | `pnpm test` |
| Go | `golangci-lint run` | (none) | `go test ./...` |
| Justfile | `just lint` | `just typecheck` | `just test` |

## CI Detection & Execution

### run-ci.sh - Smart CI Runner

Auto-detects and runs appropriate CI:

```bash
.pennyfarthing/scripts/misc/run-ci.sh              # Run detected CI
.pennyfarthing/scripts/misc/run-ci.sh --detect-only # Show what would run
.pennyfarthing/scripts/misc/run-ci.sh --dry-run     # Preview without executing
```

### Detection Priority

1. Justfile with 'ci' recipe → `just ci`
2. GitHub Actions → `act` (if installed)
3. GitLab CI → `gitlab-runner exec shell`
4. pnpm fallback → `pnpm run build && test && lint`

### Package Manager Detection

```bash
pnpm-lock.yaml or pnpm-workspace.yaml → pnpm
yarn.lock                              → yarn
otherwise                              → pnpm
```

## Automated Review Workflow

### Two-Phase Review

The Reviewer agent uses a two-phase process:

**Phase 1: Pre-Flight (Mechanical)**

```yaml
Task tool:
  subagent_type: "reviewer-preflight"
  prompt: |
    STORY_ID: 5-2
    REPOS: api,ui
    BRANCH: feat/5-2-feature
    PR_NUMBER: 42
```

Returns:
- Test results (pass/fail counts)
- Lint issues
- Code smells detected
- Diff statistics

**Phase 2: Critical Analysis (Human Judgment)**

Reviewer performs:
- Security analysis
- Edge case analysis
- Performance critique
- Test coverage assessment
- Data flow tracing

### Assessment Template

```markdown
## Reviewer Assessment

**PR:** #42
**Verdict:** APPROVED | REJECTED

**Code Review Evidence:**
- **Data flow traced:** input → destination (safe because...)
- **Pattern observed:** description at file:line
- **Error handling:** specific behavior at file:line

**Issues Found:** (if REJECTED)
| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| Critical | issue | file:line | fix |
| Major    | issue | file:line | fix |
```

## Approval Gates Pattern

### Four Gate Types

```
┌─────────────────┐
│  AUTOMATED      │  Tests, lint, pre-flight checks
├─────────────────┤
│  HUMAN REVIEW   │  Reviewer verdict (APPROVE/REJECT)
├─────────────────┤
│  USER DECISION  │  Interactive AskUserQuestion
├─────────────────┤
│  PLAN APPROVAL  │  EnterPlanMode confirmation
└─────────────────┘
```

### Assessment-First Protocol

Correct sequence:
1. Agent completes work
2. Writes assessment to session file
3. Spawns handoff subagent
4. Subagent verifies assessment exists
5. Routes based on verdict

### Verdict Verification

```bash
# Subagent verifies assessment
grep -q "## Reviewer Assessment" .session/{STORY_ID}-session.md

# Parse verdict
grep "**Verdict:**" .session/{STORY_ID}-session.md
```

## BikeLane Workflow State Machine

BikeLane supports multiple phased workflows. The TDD workflow is shown below as an example.

```
┌──────────┐
│ NEW_WORK │
└────┬─────┘
     │ User selects story
     ▼
┌──────────┐
│ SM_SETUP │ ─── Claim Jira, create branch
└────┬─────┘
     │
     ├─────────────────┐
     │ 3+ pts          │ 1-2 pts (skip TEA)
     ▼                 │
┌──────────┐           │
│ TEA_RED  │ ─── Write failing tests
└────┬─────┘           │
     │                 │
     ▼                 ▼
┌───────────────────────┐
│      DEV_GREEN        │ ─── Make tests pass, create PR
└──────────┬────────────┘
           │
           ▼
┌──────────────────────┐
│       REVIEW         │ ─── Adversarial review gate
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     │           │
REJECTED    APPROVED
     │           │
     │           ▼
     │     ┌──────────┐
     │     │  FINISH  │ ─── Archive, update Jira
     │     └──────────┘
     │
     └──────────► DEV_GREEN (fix issues)
```

Other BikeLane workflows include:
- **trivial** - Quick changes without full TDD ceremony (SM → Dev → Reviewer → SM)
- **agent-docs** - Documentation workflow (SM → Tech Writer → Reviewer → SM)
- **bdd** - Behavior-Driven Development (SM → TEA → Dev → Reviewer → SM)

### State Tracking

Session file tracks phase:

```markdown
## Workflow
- [x] Story claimed
- [x] Session file created
- [x] TEA: Tests written (RED)
- [ ] Dev: Implementation complete (GREEN)
- [ ] Reviewer: Code approved
- [ ] SM: Story archived
```

## GitHub Actions Examples

### Run Tests on PR

```yaml
name: PR Tests
on:
  pull_request:
    branches: [develop, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm run lint
```

### Matrix Testing

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

## Integrating with External CI

### Using `act` for Local GitHub Actions

```bash
# Install act
brew install act

# Run CI locally
act -j build

# Run with specific event
act pull_request
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test

build:
  stage: build
  script:
    - pnpm install --frozen-lockfile
    - pnpm run build

test:
  stage: test
  script:
    - pnpm install --frozen-lockfile
    - pnpm test
```

### Run with Pennyfarthing detection

```bash
.pennyfarthing/scripts/misc/run-ci.sh  # Auto-detects GitLab CI
```

## See Also

- [Troubleshooting](TROUBLESHOOTING.md) - Error recovery
- [Debugging Sessions](DEBUGGING-SESSIONS.md) - Session debugging
- [Workflows](WORKFLOWS.md) - BikeLane workflow documentation (TDD, trivial, agent-docs, stepped workflows, etc.)
- [BikeLane](BIKELANE.md) - BikeLane workflow system deep-dive
