# Epic 12: Scientific Benchmarking Migration - Technical Context

**Epic:** 12 - Scientific Benchmarking Migration (Phase 1)
**Sprint:** 5
**Points:** 18
**Priority:** P1
**Repos:** pennyfarthing

## Strategic Overview

Migrate scientific research tools from Thunderdome to Pennyfarthing to establish clear separation of concerns:

- **Pennyfarthing:** Scientific research platform for persona benchmarking
- **Thunderdome:** Entertainment arena for duels and tournaments

This is Phase 1 (ADDITIVE migration). Phase 2 (Sprint 6) will clean up Thunderdome by removing migrated code.

## Architectural Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-1 | Pennyfarthing owns scenarios | Single source of truth for challenge definitions |
| ADR-2 | Pennyfarthing owns /judge | Consistent scientific rigor across evaluations |
| ADR-3 | Each project stores own results | Clear ownership, no cross-project dependencies |

## Source Files to Migrate

### Commands (from `thunderdome/.claude/project/commands/`)

| File | Lines | Purpose |
|------|-------|---------|
| `solo.md` | 298 | Canonical agent execution - runs agent on scenario with optional judging |
| `benchmark.md` | 396 | Compare persona against control baseline with Cohen's d effect size |
| `benchmark-control.md` | 70 | Shortcut for creating control baselines (n=10 runs) |

**Key `/solo` Features:**
- `--tools ""` flag is CRITICAL (prevents multi-turn contamination)
- Modes: full (agent + judge + save) or `--no-judge` (raw response)
- Integrates with `/judge` and `/finalize-run`
- Output paths: `internal/results/baselines/{scenario}/{role}/` or `internal/results/benchmarks/{scenario}/{theme}-{role}/`

**Key `/benchmark` Features:**
- Validates baseline proof-of-work before comparing
- Parallel run execution (batch of 4)
- Cohen's d effect size calculation
- 95% confidence intervals
- Interactive scenario discovery (AskUserQuestion)

### Skills (from `thunderdome/.claude/project/skills/`)

| Skill | Lines | Purpose |
|-------|-------|---------|
| `judge/SKILL.md` | 440 | Evaluate responses using standardized rubrics |
| `finalize-run/SKILL.md` | 259 | Validate and save run results (anti-fabrication guardrail) |

**`/judge` Modes:**
- `solo` - Single response, absolute rubric (generic or checklist-based)
- `compare` - Two responses, comparative rubric
- `phase-sm`, `phase-tea`, `phase-dev`, `phase-reviewer` - Relay phase rubrics
- `coherence` - Chain coherence rating

**Unified Rubric (25% each):**
- Correctness - Technical accuracy
- Depth - Thoroughness
- Quality - Clarity and actionability
- Persona - Character embodiment

**`/finalize-run` Validation:**
- Agent: timestamp, response (≥200 chars), tokens
- Judge: timestamp, score marker, response (≥100 chars)
- Score: 1-100 range, matches extracted value
- Timestamp sanity: elapsed ≥ 30s × number_of_agents

### Scenarios Library (from `thunderdome/scenarios/`)

| Category | Count | Agent Role |
|----------|-------|------------|
| `dev/` | ~6 | Developer (TDD GREEN phase) |
| `tea/` | ~4 | Test Engineer (test design) |
| `code-review/` | ~5 | Reviewer |
| `sm/` | ~6 | Scrum Master |
| `architecture/` | ~3 | Architect |
| `relay/` | ~3 | Team flow |
| `test/` | N/A | Test fixtures (exclude) |
| **Total** | 37 | |

**Key Files:**
- `schema.yaml` (525 lines) - Full scenario schema with difficulty calibration
- `README.md` - Documentation for scenario authors

**Difficulty Calibration:**
| Difficulty | Score Range | Interpretation |
|------------|-------------|----------------|
| easy | 85-100 | Most agents succeed |
| medium | 70-85 | Moderate challenge |
| hard | 55-70 | Significant challenge |
| extreme | <55 | Most agents struggle |

## Pennyfarthing Target Structure

```
pennyfarthing/
├── .claude/project/
│   ├── commands/
│   │   ├── solo.md           # Story 12-1
│   │   ├── benchmark.md      # Story 12-3
│   │   └── benchmark-control.md  # Story 12-3
│   └── skills/
│       ├── judge/            # Story 12-2
│       │   └── SKILL.md
│       └── finalize-run/     # Story 12-5
│           └── SKILL.md
├── scenarios/                # Story 12-4
│   ├── schema.yaml
│   ├── README.md
│   ├── dev/
│   ├── tea/
│   ├── code-review/
│   ├── sm/
│   └── architecture/
├── results/                  # Created by commands
│   ├── baselines/
│   │   └── {scenario}/{role}/
│   │       ├── runs/
│   │       └── summary.yaml
│   └── benchmarks/
│       └── {scenario}/{theme}-{role}/
│           ├── runs/
│           └── summary.yaml
├── docs/
│   └── BENCHMARKING.md       # Story 12-7
└── src/scripts/
    └── benchmark-integration.ts  # Story 12-6 (update)
```

## Integration Points

### benchmark-integration.ts Updates (Story 12-6)

**Current state** (from Story 11-8):
```typescript
// Lines 23-25: Hardcoded Thunderdome path
const thunderdomeRoot = join(projectRoot, '..', 'thunderdome');
const benchmarksDir = join(thunderdomeRoot, 'results', 'benchmarks');
```

**Required changes:**
1. Change default to local `results/` directory
2. Add `BENCHMARK_PATH` environment variable override
3. Graceful fallback if path doesn't exist
4. Update tests for new paths

**Functions affected:**
- `loadBenchmarkSummary()` - read path
- `getAvailableScenarios()` - list path
- `getBenchmarkedThemes()` - list path

### Path Adaptations

All commands/skills must update paths from Thunderdome conventions to Pennyfarthing:

| Thunderdome Path | Pennyfarthing Path |
|------------------|-------------------|
| `.claude/pennyfarthing/personas/themes/` | `pennyfarthing-dist/personas/themes/` |
| `scenarios/` | `scenarios/` (same, at root) |
| `results/baselines/` | `internal/results/baselines/` |
| `results/benchmarks/` | `internal/results/benchmarks/` |

## Story Dependency Graph

```
                    ┌─────────────────┐
                    │  12-4: Scenarios │ (independent)
                    └─────────────────┘

    ┌─────────────────┐     ┌─────────────────┐
    │  12-1: /solo    │     │  12-2: /judge   │
    └────────┬────────┘     └────────┬────────┘
             │                       │
             └───────────┬───────────┘
                         │
              ┌──────────┴──────────┐
              │  12-3: /benchmark   │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │  12-5: /finalize-run │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │  12-6: integration  │
              └──────────┬──────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
┌───┴───────────┐  ┌─────┴─────────┐  ┌───────┴───────┐
│ 12-7: docs    │  │ 12-8: e2e test │  │ (Phase 2)    │
└───────────────┘  └───────────────┘  └───────────────┘
```

**Recommended execution order:**
1. **12-4** (Scenarios) - No dependencies, quick win
2. **12-1** (Solo) - Foundation
3. **12-2** (Judge) - Used by Solo
4. **12-3** (Benchmark) - Uses Solo
5. **12-5** (Finalize-run) - Used by Solo/Benchmark
6. **12-6** (Integration) - Path updates
7. **12-7** (Docs) - Can parallelize
8. **12-8** (E2E test) - Final validation

## Testing Strategy

### Per-Story Testing

| Story | Test Type | Validation |
|-------|-----------|------------|
| 12-1 | Manual | `/solo control:dev --scenario tdd-shopping-cart --no-judge` works |
| 12-2 | Manual | `/judge --mode solo` returns valid JSON |
| 12-3 | Manual | `/benchmark-control dev --scenario tdd-shopping-cart --runs 2` creates baseline |
| 12-4 | Schema | `scenarios/*.yaml` validate against `schema.yaml` |
| 12-5 | Manual | `/finalize-run` rejects invalid proof-of-work |
| 12-6 | Unit | `npm test` passes with updated paths |
| 12-7 | Review | Documentation is clear and complete |
| 12-8 | E2E | Full workflow baseline → benchmark → query |

### E2E Workflow (Story 12-8)

```bash
# 1. Create baseline (2 runs for speed)
/benchmark-control dev --scenario tdd-shopping-cart --runs 2

# 2. Run persona benchmark
/benchmark discworld dev --scenario tdd-shopping-cart --runs 2

# 3. Query results via integration
node -e "import('./dist/scripts/benchmark-integration.js').then(m => console.log(m.queryBenchmarks({scenario: 'tdd-shopping-cart', role: 'dev'})))"
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Path differences break commands | High | Careful path audit, test each command |
| Scenarios depend on Thunderdome fixtures | Medium | Copy only non-test scenarios |
| Judge rubric drift | Low | Copy exactly, test against known outputs |
| Proof-of-work validation too strict | Medium | Ensure validation matches current Thunderdome behavior |

## Phase 2 Preview (Sprint 6)

After Phase 1 completes and is validated:

1. **Remove duplicated code** from Thunderdome
2. **Update Thunderdome** to import scenarios from Pennyfarthing (or symlink)
3. **Remove results/** from Thunderdome (Pennyfarthing owns scientific results)
4. **Keep duel/relay/tournament** code in Thunderdome (entertainment features)

## References

- **Sprint YAML:** `sprint/current-sprint.yaml` (Sprint 5 section)
- **Thunderdome Commands:** `~/Projects/thunderdome/.claude/project/commands/`
- **Thunderdome Skills:** `~/Projects/thunderdome/.claude/project/skills/`
- **Existing Integration:** `src/scripts/benchmark-integration.ts`
- **Persona Themes:** `pennyfarthing-dist/personas/themes/`
