# Story 7-5: Add Persona Differential Dimensions to Benchmarking

## What Was Built

Extended the benchmarking framework to analyze persona performance by categorical dimensions (tone, era, genre, energy) rather than just individual themes. This enables insights like "satirical personas outperform serious ones on creative tasks" or "high-energy personas excel at debugging." Tagged 13 anchor themes with dimensions and created REST API endpoints for querying dimension-based statistics.

## Key Technical Decisions

1. **Cohen's d Effect Size for Significance** - Used standardized effect size thresholds (0.8=significant, 0.5=marginal) rather than p-values, which is more appropriate for benchmark comparisons with varying sample sizes.

2. **ESM-Compatible Module Pattern** - Used `fileURLToPath(import.meta.url)` for `__dirname` equivalent since the codebase uses ES modules.

3. **Whitelist Validation for Security** - API dimension parameter validated against fixed array `['tone', 'era', 'genre', 'energy']` before use in filesystem paths, preventing path traversal.

4. **Pure Functions with No State Mutation** - Aggregation functions are stateless and side-effect free, making them easily testable and concurrent-safe.

## Implementation Patterns

- **Type-safe dimension enums**: `DimensionName` and `DimensionValues` interfaces ensure only valid dimension values are used
- **Graceful degradation**: Themes without dimensions are silently skipped rather than causing errors
- **Pairwise comparison generation**: All dimension values compared head-to-head with per-role breakdowns
- **Express router factory pattern**: `createBenchmarkRouter(getProjectDir)` follows existing cyclist API patterns

## Files Modified

- 13 theme YAML files (added `dimensions:` block)
- `packages/core/src/scripts/job-fair-aggregator.ts` (+296 lines: types, aggregation, reporting)
- `packages/core/src/scripts/job-fair-aggregator.test.ts` (+327 lines: 18 new tests)
- `packages/core/src/index.ts` (new exports)
- `packages/cyclist/src/api/benchmark.ts` (new file: 191 lines)
- `packages/cyclist/src/api/index.ts`, `server.ts` (router integration)
- `packages/cyclist/package.json` (added @pennyfarthing/core dependency)

## API Endpoints Created

| Endpoint | Purpose |
|----------|---------|
| `GET /api/benchmark/dimensions` | List all dimensions with value counts |
| `GET /api/benchmark/dimensions/:dimension` | Stats grouped by dimension value |
| `GET /api/benchmark/dimensions/:dimension/report` | Markdown differential report |
| `GET /api/benchmark/aggregate` | Overall aggregation (from 7-4) |

## Lessons for Future Work

1. **Dimension values are extensible** - New values can be added to `DimensionValues` interface as themes are tagged
2. **Statistical significance requires sufficient samples** - The `calculateSignificance()` function returns "not_significant" for n<2, so more theme tagging will improve analysis quality
3. **API supports role filtering** - Use `?role=dev` query param to filter stats to specific roles
4. **Benchmark router pattern** - Can be extended for future benchmark-related endpoints (e.g., trend analysis, comparison tools)
