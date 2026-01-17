# Pennyfarthing development tasks

# Default recipe - list available commands
default:
    @just --list

# =============================================================================
# Cyclist - Main Command
# =============================================================================

# Start Cyclist (unified command)
# Usage:
#   just cyclist              # Electron + folder picker (default)
#   just cyclist here         # Electron + current directory
#   just cyclist dir=/path    # Electron + specific path
#   just cyclist web          # Web dev mode (browser + hot reload)
#   just cyclist server       # Web server only (no hot reload)
#   just cyclist verbose      # Enable verbose/debug logging
#
# Combine flags: just cyclist here verbose
#                just cyclist web dir=/path
cyclist mode="electron" dir="" here="false" verbose="false":
    #!/usr/bin/env bash
    set -euo pipefail

    # Build workspace dependencies if missing (dogfooding support)
    if [[ ! -d packages/shared/dist ]] || [[ ! -d packages/core/dist ]]; then
        echo "Building workspace dependencies..."
        pnpm run build
    fi

    # Resolve directory: explicit dir > here flag > mode default
    project_dir="{{dir}}"
    if [[ -z "$project_dir" ]] && [[ "{{here}}" == "true" ]]; then
        project_dir="$(pwd)"
    fi

    # Web/server modes require a directory (default to pwd)
    if [[ -z "$project_dir" ]] && [[ "{{mode}}" != "electron" ]]; then
        project_dir="$(pwd)"
    fi

    cd packages/cyclist

    # Build environment
    env_vars=""
    [[ -n "$project_dir" ]] && env_vars="CYCLIST_PROJECT_DIR=$project_dir"
    [[ "{{verbose}}" == "true" ]] && env_vars="$env_vars CYCLIST_VERBOSE=true"

    case "{{mode}}" in
        electron)
            echo "Starting Cyclist (Electron)..."
            [[ -n "$project_dir" ]] && echo "  Project: $project_dir" || echo "  Project: (folder picker)"
            eval $env_vars npm run dev
            ;;
        web)
            echo "Starting Cyclist (Web dev mode)..."
            echo "  Project: $project_dir"
            eval $env_vars npm run dev:web
            ;;
        server)
            echo "Starting Cyclist (Web server)..."
            echo "  Project: $project_dir"
            eval $env_vars npm start
            ;;
        *)
            echo "Unknown mode: {{mode}}"
            echo "Use: electron, web, or server"
            exit 1
            ;;
    esac

# Build all packages
build:
    pnpm run build

# Run tests for all packages
test:
    pnpm test

# Run tests for cyclist package only
test-cyclist:
    cd packages/cyclist && npm test

# Install dependencies
install:
    pnpm install

# Generate portraits for a theme (uses SDXL, requires GPU)
# Usage: just portraits arthurian-mythos
portraits theme:
    ./scripts/generate-portraits.sh --theme {{theme}} --skip-existing

# Preview portrait generation without running (dry-run)
# Usage: just portraits-preview arthurian-mythos
portraits-preview theme:
    ./scripts/generate-portraits.sh --theme {{theme}} --dry-run

# Generate portraits for all themes
portraits-all:
    ./scripts/generate-portraits.sh --skip-existing

# =============================================================================
# Cyclist - Additional Commands
# =============================================================================

# Build Cyclist TypeScript (includes workspace dependencies)
cyclist-build:
    #!/usr/bin/env bash
    set -euo pipefail
    # Build workspace dependencies if missing
    if [[ ! -d packages/shared/dist ]] || [[ ! -d packages/core/dist ]]; then
        echo "Building workspace dependencies..."
        pnpm run build
    else
        cd packages/cyclist && npm run build
    fi

# Build and package Cyclist Electron app for distribution
cyclist-package:
    cd packages/cyclist && npm run build:electron

# Run Cyclist tests in watch mode
test-cyclist-watch:
    cd packages/cyclist && npm test -- --watch

# Clean Cyclist build artifacts
cyclist-clean:
    rm -rf packages/cyclist/dist/

# Rebuild Cyclist native modules (node-pty)
cyclist-rebuild:
    cd packages/cyclist && npx electron-rebuild

# Run Cyclist health check to diagnose setup issues
# Usage: just cyclist-doctor [--fix]
cyclist-doctor *args:
    cd packages/cyclist && ./scripts/cyclist-doctor.sh {{args}}

# First-time Cyclist setup (clean, install deps, rebuild native modules, build)
cyclist-setup:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🚴 Setting up Cyclist..."
    echo ""
    echo "Step 1/4: Cleaning stale artifacts..."
    just cyclist-clean
    echo ""
    echo "Step 2/4: Installing dependencies..."
    pnpm install
    echo ""
    echo "Step 3/4: Rebuilding native modules (node-pty)..."
    cd packages/cyclist && npx electron-rebuild
    echo ""
    echo "Step 4/4: Building TypeScript..."
    npm run build
    echo ""
    echo "✓ Cyclist setup complete!"
    echo ""
    echo "Next steps:"
    echo "  just cyclist           # Electron with folder picker"
    echo "  just cyclist here      # Electron in current directory"
    echo "  just cyclist web       # Web dev mode"

# Install Cyclist.app to /Applications (macOS)
cyclist-install-app:
    cd packages/cyclist && ./scripts/install-app.sh

# Install cyclist CLI command to /usr/local/bin
cyclist-install-cli:
    cd packages/cyclist && ./scripts/install-cli.sh

# Install both Cyclist app and CLI
cyclist-install: cyclist-install-app cyclist-install-cli
    @echo ""
    @echo "✓ Cyclist installation complete!"
    @echo "  - Launch from Applications: Cyclist.app"
    @echo "  - Launch from terminal: cyclist [path]"

# Build and install Cyclist
cyclist-build-and-install: cyclist-package cyclist-install
    @echo "✓ Cyclist build and install complete"

# Launch Claude Code with OTEL telemetry pointing to Cyclist web server
# Use this when running Cyclist in web mode to get token stats
# Usage: just claude-with-cyclist [port]
# Default port is 1898 (Cyclist default)
claude-with-cyclist port="1898":
    #!/usr/bin/env bash
    echo "🚴 Launching Claude Code with Cyclist telemetry (port {{port}})"
    echo "   Token stats will appear in Cyclist web UI"
    echo ""
    OTEL_EXPORTER_OTLP_PROTOCOL=http/json \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:{{port}} \
    claude

