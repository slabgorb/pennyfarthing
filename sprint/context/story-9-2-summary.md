# Story 9-2: Build Skill Search Utility - Completion Summary

**Completed:** 2026-01-11
**Points:** 3
**Epic:** 9 - Skill Discovery & Documentation Hub
**PR:** #161

## What Was Built

A skill search utility (`searchSkills()`) that queries the skill registry created in story 9-1, with support for filtering by tag, keyword, query string, and category. The implementation includes both a TypeScript core function in `@pennyfarthing/shared` and a shell wrapper for command-line access with table and JSON output formats.

## Key Technical Decisions

1. **Custom YAML Parser** - Rather than adding the `yaml` package as a dependency to `@pennyfarthing/shared`, a purpose-built parser was created specifically for the skill-registry.yaml format. This keeps the shared package lightweight and avoids version conflicts.

2. **Hybrid Architecture** - The core logic lives in TypeScript (`packages/shared/src/skill-search.ts`) with a thin shell wrapper (`skill-search.sh`) for CLI access. This reuses the existing pennyfarthing-dist resolution pattern from portrait-resolver.

3. **AND Logic for Filters** - When multiple filters are specified (e.g., `--tag cli --keyword test`), they combine with AND logic, narrowing results rather than broadening them.

4. **Category Validation** - Invalid categories throw helpful errors listing valid options, providing good developer experience.

## Implementation Patterns

- **Path Resolution Reuse** - Leveraged `resolvePennyfarthingDist()` from portrait-resolver to find the skill registry, maintaining consistency with other tools.
- **Test-First Shell Wrapper** - Integration tests for the bash wrapper were written using Node.js test runner via a thin TypeScript shim, avoiding the complexity of bash-native testing.
- **Fail-Fast Validation** - All inputs validated early with descriptive error messages before processing.

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `packages/shared/src/skill-search.ts` | CREATE | Core searchSkills() function + YAML parser (~300 lines) |
| `packages/shared/src/skill-search.sh` | CREATE | Shell wrapper for CLI access (~40 lines) |
| `packages/shared/src/skill-search.test.ts` | CREATE | 21 tests covering all ACs |
| `packages/shared/src/index.ts` | MODIFY | Export searchSkills, SearchOptions, SkillResult |
| `packages/shared/package.json` | MODIFY | Build script copies .sh files to dist |

## Lessons for Future Work

1. **Custom parsers can be worth it** - For narrowly-scoped use cases (parsing a known YAML structure), a custom parser avoids dependency overhead and gives precise control over behavior.

2. **Shell wrapper testing via Node.js** - Testing bash scripts through Node.js test runner (spawning the script as a child process) provides better assertions and error reporting than bash-native testing approaches.

3. **Registry design pays off** - The structured YAML format from story 9-1 made filtering straightforward; good schema design upstream enables clean implementation downstream.

## Acceptance Criteria Verification

| AC | Description | Status |
|----|-------------|--------|
| AC1 | skill-search.sh is functional | ✓ PASSED (21 tests) |
| AC2 | Tag/keyword search returns expected results | ✓ PASSED (AND logic, case-insensitive) |
| AC3 | JSON output format with --json flag | ✓ PASSED (valid JSON, required fields) |

## Review Notes

Granny Weatherwax approved with one minor observation: an unused `currentField` variable in the YAML parser at line 71. Non-blocking, but could be cleaned up in future maintenance.
