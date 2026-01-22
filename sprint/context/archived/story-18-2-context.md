# Story 18-2: Convert to pnpm Workspace Structure
<!-- NOTE: Was Story 11-2, renumbered with epic -->

**Epic:** 18 - Cyclist-Pennyfarthing Monorepo Consolidation
**Points:** 5
**Jira:** MSSCI-11419
**Created:** 2026-01-08

## Objective

Restructure Pennyfarthing as a pnpm workspace monorepo with `@pennyfarthing/core` as the CLI package.

## Technical Context

### Current State
- Monolithic `src/cli/` with TypeScript compilation to `dist/`
- `bin/pennyfarthing.js` entry point
- `packages/shared/` created in Story 18-1 with portrait resolver

### Target State
```
pennyfarthing/
├── pnpm-workspace.yaml          # NEW: workspace definition
├── tsconfig.base.json           # NEW: shared TS config
├── package.json                 # MODIFIED: workspace root
├── packages/
│   ├── core/                    # NEW: @pennyfarthing/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/pennyfarthing.js # MOVED from root
│   │   └── src/cli/             # MOVED from root src/
│   └── shared/                  # EXISTS from 11-1
└── pennyfarthing-dist/          # UNCHANGED
```

## Key Files

### Create
| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Define workspace packages |
| `tsconfig.base.json` | Shared TypeScript configuration |
| `packages/core/package.json` | CLI package definition |
| `packages/core/tsconfig.json` | Extends tsconfig.base.json |

### Move
| From | To |
|------|-----|
| `src/` | `packages/core/src/` |
| `bin/` | `packages/core/bin/` |
| `dist/` | `packages/core/dist/` |

### Modify
| File | Changes |
|------|---------|
| `package.json` | Transform to workspace root (remove deps) |
| `.gitignore` | Ensure packages/*/node_modules covered |

## Dependencies

- **Depends on:** Story 18-1 (DONE) - @pennyfarthing/shared exists
- **Blocks:** Story 18-3 (Cyclist migration needs workspace)

## Acceptance Criteria

1. [ ] `packages/core/src/` contains former `src/`
2. [ ] `pnpm-workspace.yaml` defines packages/*
3. [ ] `pnpm install` works from root
4. [ ] `pnpm build` compiles all packages
5. [ ] `pennyfarthing` CLI still functional
6. [ ] Existing tests pass

## Testing Strategy

```bash
# After restructure
pnpm install              # Should resolve workspace deps
pnpm build                # Should compile all packages
pnpm test                 # Should run all tests
pennyfarthing --help      # Should show CLI help
pennyfarthing doctor      # Should run health check
```

## Risks

| Risk | Mitigation |
|------|------------|
| Broken imports after move | Use TypeScript path aliases |
| CLI bin path broken | Update package.json bin field |
| Test discovery fails | Verify test glob patterns |

## Reference

- ADR-002: `~/.claude/plans/snuggly-bouncing-forest.md`
- Epic Context: `.session/epic-18-context.md`
