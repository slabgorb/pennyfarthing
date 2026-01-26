# BMAD 6.0 Compatibility Matrix

This document describes the compatibility between BMAD 6.0 workflows and Pennyfarthing's BikeLane stepped workflow system. BikeLane is Pennyfarthing's unified workflow execution system that supports both native workflows and imported BMAD workflows.

## Overview

Pennyfarthing supports importing BMAD 6.0 workflows with full compatibility for core features. When imported, BMAD workflows become BikeLane stepped workflows, allowing them to run seamlessly within Pennyfarthing's unified workflow system. This matrix documents supported features, intentional differences, and migration notes.

## Workflow Types

| Type | BMAD 6.0 | BikeLane | Notes |
|------|----------|----------|-------|
| Stepped | Yes | Yes | Full support via `type: stepped` |
| Procedural | Yes | Yes | Full support via `type: procedural` |
| Linear | - | Yes | BikeLane-only type |

When imported, BMAD workflows become BikeLane workflows and execute through Pennyfarthing's unified workflow engine.

## Mode Support

### Standard BMAD Tri-Modal (create/validate/edit)

| Feature | Supported | Notes |
|---------|-----------|-------|
| Create mode | Yes | Primary workflow path |
| Validate mode | Yes | Review/check existing content |
| Edit mode | Yes | Modify existing content |
| Steps directories | Yes | `steps-c/`, `steps-v/`, `steps-e/` |

### Custom Modes

Pennyfarthing extends BMAD by supporting custom mode names:

| Feature | Supported | Example |
|---------|-----------|---------|
| Custom mode names | Yes | `market`, `domain`, `technical` |
| Custom directories | Yes | `steps-market/`, `steps-domain/` |
| Mode routing | Yes | User selects mode, routes to directory |

**Example: Research Workflow**
```yaml
modes:
  market: ./steps-market/
  domain: ./steps-domain/
  technical: ./steps-technical/
```

## Variable Syntax

| BMAD Syntax | Pennyfarthing Syntax | Converted |
|-------------|---------------------|-----------|
| `{var-name}` | `{var_name}` | Yes (auto) |
| `{var_name}` | `{var_name}` | Native |

The migration script automatically converts hyphen-separated variable names to underscore syntax.

### Variable Resolution Priority

1. Session variables (highest priority)
2. Config variables
3. Environment variables
4. Workflow defaults (lowest priority)

## Step File Format

| Feature | BMAD | Pennyfarthing | Notes |
|---------|------|---------------|-------|
| YAML frontmatter | Yes | Yes | Required for step metadata |
| `name` field | Yes | Yes | Must match filename |
| `description` field | Yes | Yes | Step description |
| `nextStepFile` | Yes | Yes | Links to next step |
| `continueStepFile` | Yes | Yes | Conditional branching |
| `<step-meta>` tags | Yes | No | Use frontmatter instead |

### Frontmatter Example

```yaml
---
name: 'step-01-init'
description: 'Initialize the workflow'
nextStepFile: './step-02-discovery.md'
---
```

## Gate Behavior

| Feature | BMAD | Pennyfarthing | Notes |
|---------|------|---------------|-------|
| Gate configuration | Yes | Yes | `gates.after_steps: [2, 8, 12]` |
| Gate marker | Yes | Yes | `<!-- GATE -->` in content |
| Approval flow | Yes | Yes | Pauses for user approval |

### Gate Configuration

```yaml
gates:
  after_steps: [2, 8, 12]  # Pause after these steps
  gate_marker: "<!-- GATE -->"
```

## Intentional Differences

### 1. Step Metadata Format

| Aspect | BMAD | Pennyfarthing |
|--------|------|---------------|
| Format | `<step-meta>` XML tags | YAML frontmatter |
| Reason | Better tooling support, standard markdown |

### 2. Variable Syntax

| Aspect | BMAD | Pennyfarthing |
|--------|------|---------------|
| Separator | Hyphens (`var-name`) | Underscores (`var_name`) |
| Reason | JavaScript/TypeScript compatibility |

### 3. Custom Mode Names

| Aspect | BMAD | Pennyfarthing |
|--------|------|---------------|
| Support | Limited to create/validate/edit | Any mode names |
| Reason | Flexibility for domain-specific workflows |

## Migration Notes

### Using the Migration Script

```bash
node pennyfarthing-dist/scripts/migrate-bmad-workflow.mjs \
  --source ~/Projects/BMAD-METHOD/src/modules/bmm/workflows/2-plan-workflows/prd \
  --target pennyfarthing-dist/workflows/prd
```

### Manual Migration Checklist

- [ ] Convert `{var-name}` to `{var_name}` in all step files
- [ ] Convert `<step-meta>` to YAML frontmatter
- [ ] Verify step file naming matches frontmatter `name` field
- [ ] Test mode routing if multi-modal
- [ ] Verify gate configuration references valid step numbers

## Imported Workflows from BMAD 6.0

The following BMAD 6.0 workflows have been imported and converted to BikeLane stepped workflows:

| Workflow | Type | Modes | Status |
|----------|------|-------|--------|
| prd | stepped | create/validate/edit | Imported |
| product-brief | stepped | single | Imported |
| research | stepped | market/domain/technical | Imported |
| epics-and-stories | stepped | single | Imported |
| implementation-readiness | stepped | single | Imported |
| ux-design | stepped | single | Imported |
| dev-story | stepped | single | Imported |
| sprint-planning | stepped | single | Imported |
| retrospective | procedural | - | Imported |
| project-context | stepped | single | Imported |
| quick-dev | stepped | single | Imported |
| quick-spec | stepped | single | Imported |

All imported workflows run as BikeLane stepped workflows within Pennyfarthing's workflow system.

## Testing

Run the BMAD compatibility test suite:

```bash
cd packages/cyclist
npm test -- B-bmad
```

Test coverage:
- Schema validation (B-bmad-schema.test.ts)
- Variable resolution (B-bmad-variables.test.ts)
- Step enumeration (B-bmad-steps.test.ts)
- Mode selection (B-bmad-modes.test.ts)
- Gate behavior (B-bmad-gates.test.ts)
