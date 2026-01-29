---
description: Detect and run CI locally
---

<purpose>
Run CI locally by detecting the project's CI system and executing the appropriate commands. Thin wrapper that delegates to project configuration.
</purpose>

<when-to-use>
- Before pushing to verify CI will pass
- To reproduce CI failures locally
- To run the full CI pipeline without pushing
- When you want to know what CI system the project uses
</when-to-use>

<execution>

## Running CI Locally

Use the run-ci.sh script:

```bash
# Run CI locally (auto-detects CI system)
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run-ci.sh

# Show what CI system is detected without running
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run-ci.sh --detect-only

# Show what command would run without executing
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run-ci.sh --dry-run

# Show help
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run-ci.sh --help
```

## Options

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help message |
| `--detect-only` | Show detected CI system without running |
| `--dry-run` | Show what would run without executing |

</execution>

<detection-order>

## CI System Detection

The script detects CI systems in this order:

| Priority | System | Detection | Command |
|----------|--------|-----------|---------|
| 1 | Justfile | `just --list` shows `ci` recipe | `just ci` |
| 2 | GitHub Actions | `.github/workflows/*.yml` exists | `act` |
| 3 | GitLab CI | `.gitlab-ci.yml` exists | `gitlab-runner exec` |
| 4 | npm fallback | `package.json` exists | `npm run build && npm test && npm run lint` |

### Package Manager Detection

For npm fallback, the script detects package manager:
- `pnpm-lock.yaml` or `pnpm-workspace.yaml` → `pnpm`
- `yarn.lock` → `yarn`
- Otherwise → `npm`

</detection-order>

<output-format>

## Output Examples

### --detect-only
```
Detected CI system: github-actions
Would run: act
```

### --dry-run
```
Detected: github-actions
Would run: act
```

### Running CI
```
Running CI: github-actions
Command: act

[act output follows...]
```

Exit codes:
- `0` - CI ran successfully
- `1` - CI failed or no CI system detected

</output-format>

<requirements>

## Tool Requirements

| CI System | Required Tool | Installation |
|-----------|--------------|--------------|
| GitHub Actions | `act` | `brew install act` |
| GitLab CI | `gitlab-runner` | See GitLab docs |
| Justfile | `just` | `brew install just` |
| npm fallback | `npm`/`pnpm`/`yarn` | Comes with Node.js |

If a required tool is not installed, the script will show a warning.

</requirements>

<reference>
- **Script:** `.pennyfarthing/scripts/run-ci.sh`
- **Story:** 21-4 (Command & Skill Expansion)
</reference>
