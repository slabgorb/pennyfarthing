# Pennyfarthing Scripts (Python)

**This is a distributed Python package.** It ships to users via npm alongside the bash scripts.

## Installation

The package is automatically available when Pennyfarthing is installed. PYTHONPATH is set by the calling script via environment variables.

## Packages

| Package | Purpose |
|---------|---------|
| `common/` | Shared utilities (output formatting, config) |
| `jira/` | Jira CLI wrapper (sync, create, claim) |
| `sprint/` | Sprint YAML management |
| `story/` | Story operations |
| `git/` | Git utilities |
| `brownfield/` | Codebase analysis for new projects |
| `prime/` | Context priming |
| `preflight/` | Pre-flight checks |

## Top-Level Modules

| Module | Purpose |
|--------|---------|
| `hooks.py` | Claude Code hook implementations |
| `bellmode_hook.py` | Bell mode hook |
| `pretooluse_hook.py` | PreToolUse hook |
| `welcome_hook.py` | Welcome message hook |
| `workflow.py` | Workflow utilities |
| `swebench.py` | SWE-bench evaluation support |

## Usage

Scripts invoke Python modules directly:

```bash
# From a bash script
python -m pf.jira.sync "$EPIC_ID"

# PYTHONPATH is set by the script:
# export PYTHONPATH="${PROJECT_ROOT}${PYTHONPATH:+:$PYTHONPATH}"
```

## Dependencies

Minimal dependencies - standard library plus:
- `httpx` - HTTP client
- `pyyaml` - YAML parsing

NO GPU dependencies here. Those belong in meta scripts (`scripts/*.py`).

## Testing

```bash
cd pennyfarthing
python -m pytest pf/tests/
```

## What Does NOT Go Here

Meta-only Python scripts belong in `scripts/`:
- Portrait generation (requires torch, diffusers)
- Other GPU-heavy tools

See `CLAUDE.md` for the full decision tree.
