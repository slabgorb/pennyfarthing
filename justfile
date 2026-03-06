# Pennyfarthing development tasks

# Python interpreter — use venv when available, fall back to system python3
venv_python := if path_exists(justfile_directory() / ".venv/bin/python3") == "true" { justfile_directory() / ".venv/bin/python3" } else { "python3" }

# Default recipe - list available commands
default:
    @just --list

# =============================================================================
# GUI - Main Command
# =============================================================================

# GUI - unified command for BikeRack GUI operations
#
# Run modes:
#   just gui              # Web dev mode (browser + hot reload, default)
#   just gui here         # Web dev + current directory
#   just gui server       # Web server only
#   just gui verbose      # Enable debug logging
#   just gui here verbose # Combine flags (any order)
#   just gui dir=/path    # Specific project directory
#
# Maintenance:
#   just gui setup        # First-time setup (clean, install, build)
#   just gui doctor       # Diagnose setup issues (add --fix to auto-repair)
#   just gui build        # Build TypeScript
#   just gui clean        # Remove dist/
gui *args:
    #!/usr/bin/env bash
    set -euo pipefail

    # Set up positional parameters from just args
    set -- {{args}}

    # Check for maintenance subcommands first
    case "${1:-}" in
        setup)
            echo "🚴 Setting up BikeRack GUI..."
            echo ""
            echo "Step 1/3: Cleaning stale artifacts..."
            rm -rf packages/cyclist/dist/
            echo ""
            echo "Step 2/3: Installing dependencies..."
            pnpm install
            echo ""
            echo "Step 3/3: Building TypeScript..."
            pnpm run build
            echo ""
            echo "✓ BikeRack GUI setup complete!"
            echo ""
            echo "Next steps:"
            echo "  just gui here      # Web dev in current directory"
            echo "  just gui web       # Web dev mode"
            exit 0
            ;;
        doctor)
            shift
            cd packages/cyclist && ./scripts/cyclist-doctor.sh "$@"
            exit 0
            ;;
        build)
            if [[ ! -d packages/shared/dist ]] || [[ ! -d packages/core/dist ]]; then
                echo "Building workspace dependencies..."
                pnpm run build
            else
                cd packages/cyclist && npm run build
            fi
            exit 0
            ;;
        clean)
            rm -rf packages/cyclist/dist/
            echo "✓ Cleaned packages/cyclist/dist/"
            exit 0
            ;;
    esac

    # Parse run mode arguments
    mode="web"
    project_dir=""
    here="false"
    verbose="false"

    for arg in "$@"; do
        case "$arg" in
            web|server)
                mode="$arg"
                ;;
            here)
                here="true"
                ;;
            verbose)
                verbose="true"
                ;;
            dir=*)
                project_dir="${arg#dir=}"
                ;;
            *)
                echo "Unknown argument: $arg"
                echo ""
                echo "Run modes:"
                echo "  just gui              # Web dev mode (default)"
                echo "  just gui here         # Web dev + current directory"
                echo "  just gui server       # Web server only"
                echo "  just gui verbose      # Enable debug logging"
                echo "  just gui dir=/path    # Specific directory"
                echo ""
                echo "Maintenance:"
                echo "  just gui setup        # First-time setup"
                echo "  just gui doctor       # Diagnose issues"
                echo "  just gui build        # Build TypeScript"
                echo "  just gui clean        # Remove dist/"
                exit 1
                ;;
        esac
    done

    # Build workspace dependencies if missing
    if [[ ! -d packages/shared/dist ]] || [[ ! -d packages/core/dist ]]; then
        echo "Building workspace dependencies..."
        pnpm run build
    fi

    # Resolve directory: explicit dir > here flag > mode default
    if [[ -z "$project_dir" ]] && [[ "$here" == "true" ]]; then
        project_dir="$(pwd)"
    fi

    # Web/server modes require a directory (default to pwd)
    if [[ -z "$project_dir" ]]; then
        project_dir="$(pwd)"
    fi

    cd packages/cyclist

    # Build environment
    env_vars=""
    [[ -n "$project_dir" ]] && env_vars="PF_PROJECT_DIR=$project_dir"
    [[ "$verbose" == "true" ]] && env_vars="$env_vars PF_VERBOSE=true"

    case "$mode" in
        web)
            echo "Starting BikeRack GUI (Web dev mode)..."
            echo "  Project: $project_dir"
            eval $env_vars npm run dev:web
            ;;
        server)
            echo "Starting BikeRack GUI (Web server)..."
            echo "  Project: $project_dir"
            eval $env_vars npm start
            ;;
    esac

# Build all packages
build:
    pnpm run build

# Run tests for all packages
test:
    pnpm test

# Run tests for GUI package only
test-gui:
    cd packages/cyclist && npm test

# Install dependencies
install:
    pnpm install

# Publish a package. MUST use pnpm publish, never npm publish.
# npm publish does not resolve workspace:* refs and leaks them into the tarball.
# For full releases, use scripts/deploy.sh instead.
publish pkg:
    cd packages/{{pkg}} && pnpm publish --access public --no-git-checks

# Generate portraits for a theme (uses SDXL, requires GPU)
# Usage: just portraits arthurian-mythos
portraits theme:
    ./pennyfarthing-dist/scripts/portraits/generate-portraits.sh --theme {{theme}} --skip-existing

# Preview portrait generation without running (dry-run)
# Usage: just portraits-preview arthurian-mythos
portraits-preview theme:
    ./pennyfarthing-dist/scripts/portraits/generate-portraits.sh --theme {{theme}} --dry-run

# Generate portraits for all themes
portraits-all:
    ./pennyfarthing-dist/scripts/portraits/generate-portraits.sh --skip-existing

# Run GUI tests in watch mode
test-gui-watch:
    cd packages/cyclist && npm test -- --watch

# Check sidecar files for bloat
sidecar-health:
    .pennyfarthing/scripts/maintenance/sidecar-health.sh

# Archive bloated sidecars and prepare for pruning
sidecar-prune:
    .pennyfarthing/scripts/maintenance/sidecar-health.sh --fix

# =============================================================================
# VS Code Extension
# =============================================================================

# VS Code extension - unified command for all extension operations
#
# Commands:
#   just vscode              # Build and install extension
#   just vscode build        # Build only (no install)
#   just vscode install      # Install from existing .vsix
#   just vscode package      # Create .vsix package
#   just vscode uninstall    # Remove extension from VS Code
vscode *args:
    #!/usr/bin/env bash
    set -euo pipefail
    cd packages/vscode-extension

    case "${1:-}" in
        build)
            echo "Building VS Code extension..."
            npm run build
            echo "✓ Built dist/extension.js"
            ;;
        package)
            echo "Packaging VS Code extension..."
            npm run build
            npx @vscode/vsce package --no-dependencies
            echo "✓ Created .vsix package"
            ls -la *.vsix
            ;;
        install)
            vsix=$(ls -t *.vsix 2>/dev/null | head -1)
            if [[ -z "$vsix" ]]; then
                echo "No .vsix found. Run 'just vscode package' first."
                exit 1
            fi
            echo "Installing $vsix..."
            code --install-extension "$vsix" --force
            echo "✓ Installed. Reload VS Code to activate."
            ;;
        uninstall)
            echo "Uninstalling Pennyfarthing extension..."
            code --uninstall-extension 1898andco.pennyfarthing-vscode || true
            echo "✓ Uninstalled"
            ;;
        ""|default)
            echo "Building and installing VS Code extension..."
            npm run build
            npx @vscode/vsce package --no-dependencies
            vsix=$(ls -t *.vsix | head -1)
            code --install-extension "$vsix" --force
            echo ""
            echo "✓ Extension installed: $vsix"
            echo "  Reload VS Code (Cmd+Shift+P → 'Developer: Reload Window')"
            ;;
        *)
            echo "Unknown command: $1"
            echo ""
            echo "Commands:"
            echo "  just vscode              # Build and install"
            echo "  just vscode build        # Build only"
            echo "  just vscode package      # Create .vsix"
            echo "  just vscode install      # Install existing .vsix"
            echo "  just vscode uninstall    # Remove extension"
            exit 1
            ;;
    esac

# =============================================================================
# Validation
# =============================================================================

# Validate agent files against schema and best practices
validate-agents *args:
    pf validate agent {{args}}

# Validate subagent YAML frontmatter (consolidated into pf validate agent)
validate-subagents:
    pf validate agent

# Validate sprint YAML structure
validate-sprint *args:
    PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.sprint.validator {{args}}

# Check if wheelhub.mjs bundle is stale vs TypeScript source
check-bundle-drift:
    ./scripts/check-bundle-drift.sh

# Rebuild wheelhub.mjs bundle from TypeScript source
rebuild-wheelhub:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Step 1/4: Building TypeScript..."
    cd packages/core && pnpm run build:tsc
    cd ../..
    echo "Step 2/4: Bundling with esbuild..."
    npx esbuild packages/core/dist/server/entry.js --bundle --format=esm --platform=node --outfile=/tmp/wheelhub.mjs
    echo "Step 3/4: Patching CJS shim for Node 24..."
    python3 -c "
import re
with open('/tmp/wheelhub.mjs', 'r') as f:
    content = f.read()
old = r'var __require = /\* @__PURE__ \*/ \(\(x\) => typeof require.*?\)\(0\);'
new = 'var __require = /* @__PURE__ */ ((x) => typeof require !== \"undefined\" ? require : __createRequire(import.meta.url))(0);'
content = re.sub(old, new, content, flags=re.DOTALL)
content = 'import { createRequire as __createRequire } from \"node:module\";\n' + content
with open('/tmp/wheelhub.mjs', 'w') as f:
    f.write(content)
"
    echo "Step 4/4: Copying to pennyfarthing-dist..."
    cp /tmp/wheelhub.mjs pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs
    echo "Done. Run 'pipx install --force .' then 'pf init' in consumer projects."

# Run all validations
validate: validate-agents validate-subagents validate-sprint check-bundle-drift

# =============================================================================
# BikeRack
# =============================================================================

# Start BikeRack mode (hot-reload by default)
# Run modes: here, dir=/path, stop, status, prod
bikerack *args:
    #!/usr/bin/env bash
    set -euo pipefail

    set -- {{args}}

    # Check for subcommands first
    case "${1:-start}" in
        stop)
            shift
            PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.bikerack stop "$@"
            exit 0
            ;;
        status)
            shift
            PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.bikerack status "$@"
            exit 0
            ;;
    esac

    # Parse run arguments
    project_dir=""
    prod_mode=false
    for arg in "$@"; do
        case "$arg" in
            here)
                project_dir="$(pwd)"
                ;;
            dir=*)
                project_dir="${arg#dir=}"
                ;;
            prod)
                prod_mode=true
                ;;
            start)
                # default, no-op
                ;;
            *)
                echo "Unknown argument: $arg"
                echo ""
                echo "Usage:"
                echo "  just bikerack              # Start with hot reload (default)"
                echo "  just bikerack here         # Hot reload pointing at invocation directory"
                echo "  just bikerack dir=/path    # Hot reload pointing at specific directory"
                echo "  just bikerack prod         # Production mode (Python launcher + Claude CLI)"
                echo "  just bikerack stop         # Stop running instance"
                echo "  just bikerack status       # Show running state"
                exit 1
                ;;
        esac
    done

    # Production mode: Python launcher with Claude CLI
    if [[ "$prod_mode" == "true" ]]; then
        dir_flag=""
        if [[ -n "$project_dir" ]]; then
            dir_flag="--project-dir $project_dir"
        fi
        PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.bikerack start $dir_flag
        exit 0
    fi

    # Default: hot-reload server + vite rebuild watcher
    cd packages/cyclist
    export IS_BIKERACK=1
    export PF_PROJECT_DIR="${project_dir:-$(cd ../.. && pwd)}"
    echo "BikeRack — hot reload mode"
    echo "  Project dir: $PF_PROJECT_DIR"
    echo "  Server: tsx watch ../core/src/server/entry.ts"
    echo "  Frontend: vite build --watch"
    echo ""
    logfile="$PF_PROJECT_DIR/.session/bikerack_debug.log"
    mkdir -p "$(dirname "$logfile")"
    echo "  Log: $logfile"
    # Clean stale port file before starting
    rm -f "$PF_PROJECT_DIR/.bikerack-port"
    npx concurrently -k \
        -n server,vite \
        -c green,magenta \
        "tsx watch ../core/src/server/entry.ts" \
        "vite build --watch" \
        >> "$logfile" 2>&1 &
    bg_pid=$!
    echo "  PID: $bg_pid"
    echo "$bg_pid" > "$PF_PROJECT_DIR/.wheelhub-pid"
    echo ""
    # Wait for server to write .bikerack-port (up to 10s)
    port_file="$PF_PROJECT_DIR/.bikerack-port"
    for i in $(seq 1 20); do
        if [[ -f "$port_file" ]]; then
            port=$(cat "$port_file")
            url="http://127.0.0.1:${port}"
            echo "  BikeRack: $url"
            echo ""
            open "$url"
            break
        fi
        sleep 0.5
    done
    if [[ ! -f "$port_file" ]]; then
        echo "  Warning: server didn't start within 10s. Check logs: $logfile"
    fi
    echo "BikeRack running in background. Use 'tail -f $logfile' to watch logs."
    echo ""
    # Launch Claude Code in the project directory
    cd "$PF_PROJECT_DIR" && exec claude

# Launch BikeRack TUI (connects to running WheelHub)
tui *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port_flag=""
    project_dir_flag=""
    for arg in {{args}}; do
        case "$arg" in
            --port=*|port=*)
                port_flag="--port ${arg#*=}"
                ;;
            dir=*)
                project_dir_flag="--project-dir ${arg#dir=}"
                ;;
            here)
                project_dir_flag="--project-dir $(pwd)"
                ;;
        esac
    done

    PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.bikerack.tui $port_flag $project_dir_flag
