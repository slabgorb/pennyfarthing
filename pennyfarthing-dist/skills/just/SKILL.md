---
name: just-runner
description: Run just recipes for project tasks. This skill should be used when starting dev servers, running tests, managing databases, checking project health, or writing new justfile recipes.
---

# Just Command Runner Skill

## When to Use This Skill

- Starting/stopping development servers
- Running tests
- Managing databases (start, stop, reset, seed)
- Checking service health/status
- Writing new justfile recipes

## Overview

`just` is a command runner (like `make` but simpler). Commands run from the **project root** unless otherwise specified.

**Installation:** `brew install just` or `cargo install just`

## Getting Help

```bash
just help      # Show categorized commands with descriptions
just --list    # List all recipes without descriptions
just --show <recipe>  # Show recipe definition
```

## Common Recipe Patterns

### Development
```bash
just dev           # Start development environment
just dev-start     # Start all services
just dev-stop      # Stop all services
just dev-status    # Check service status
just dev-logs      # Tail logs
```

### Testing
```bash
just test          # Run all tests
just test-setup    # Setup test infrastructure
just test-api      # Backend tests only
just test-ui       # Frontend tests only
```

### Database
```bash
just db-start      # Start database services
just db-stop       # Stop database services
just db-reset      # Reset databases (DESTRUCTIVE)
just db-seed       # Seed with test data
```

## Passing Arguments

Just recipes accept arguments directly (NO `--` separator needed):

```bash
# Correct
just test-api -run TestName ./...
just build --release

# WRONG - don't use --
just test-api -- -run TestName
```

## Writing Custom Recipes

### Basic Recipe

```just
# Recipe with description (shows in `just --list`)
hello:
    echo "Hello, world!"

# Private recipe (doesn't show in list)
[private]
_helper:
    echo "I'm hidden"
```

### Recipe with Arguments

```just
# Positional arguments
greet name:
    echo "Hello, {{name}}!"

# With defaults
greet name="World":
    echo "Hello, {{name}}!"

# Variadic arguments
test *args:
    go test {{args}}
```

### Multi-line Scripts

```just
# Use shebang for complex scripts
build:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Building..."
    go build -o bin/app ./cmd/app
    echo "Done!"
```

### Variables and Interpolation

```just
# Set variables
project := "myapp"
version := `git describe --tags`

# Use in recipes
info:
    echo "{{project}} version {{version}}"

# Environment variables
export DATABASE_URL := "postgres://localhost/dev"
```

### Dependencies

```just
# Run `setup` before `build`
build: setup
    go build ./...

# Multiple dependencies
deploy: build test
    ./deploy.sh
```

### Conditionals

```just
# Platform-specific
install:
    {{ if os() == "macos" }} brew install foo {{ else }} apt install foo {{ endif }}
```

## Best Practices

1. **Use `echo -e`** for colored output (not plain `echo`)
2. **Use `#!/usr/bin/env bash`** shebang for multi-line scripts
3. **Mark internal recipes as `[private]`**
4. **Use `{{var}}`** for variable interpolation, not `$var`
5. **Extract complex logic** to scripts in `scripts/` directory
6. **Add descriptions** to all public recipes

## Reference Documentation

- **Justfile Syntax:** See `references/justfile-syntax.md`
- **Official Docs:** https://just.systems/man/en/
