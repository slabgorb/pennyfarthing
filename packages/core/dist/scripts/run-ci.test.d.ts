/**
 * Story 21-4: /run-ci thin wrapper command
 *
 * Tests for the run-ci.sh script that detects and runs CI locally.
 *
 * Detection Order:
 * 1. justfile with 'ci' recipe → `just ci`
 * 2. .github/workflows/*.yml → `act` (if installed)
 * 3. .gitlab-ci.yml → `gitlab-runner exec`
 * 4. Fallback: npm test && npm run lint && npm run build
 *
 * AC1: Command detects CI system from project files
 * AC2: Delegates to project's CI definition
 * AC3: Works with justfile 'ci' recipe
 * AC4: Works with GitHub Actions via 'act' (optional)
 * AC5: Provides clear output of what's running
 * AC6: Fallback to npm scripts if no CI config found
 */
export {};
//# sourceMappingURL=run-ci.test.d.ts.map