# Pennyfarthing development tasks

# Default recipe - list available commands
default:
    @just --list

# =============================================================================
# Cyclist - Main Command
# =============================================================================

# Cyclist - unified command for all Cyclist operations
#
# Run modes:
#   just cyclist              # Electron + folder picker (default)
#   just cyclist here         # Electron + current directory
#   just cyclist cdp          # Electron + CDP debugging (port 9222 for Playwright)
#   just cyclist web          # Web dev mode (browser + hot reload)
#   just cyclist server       # Web server only
#   just cyclist verbose      # Enable debug logging
#   just cyclist here verbose # Combine flags (any order)
#   just cyclist dir=/path    # Specific project directory
#
# Maintenance:
#   just cyclist setup        # First-time setup (clean, install, rebuild, build)
#   just cyclist doctor       # Diagnose setup issues (add --fix to auto-repair)
#   just cyclist build        # Build TypeScript
#   just cyclist clean        # Remove dist/
#   just cyclist rebuild      # Rebuild native modules (node-pty)
#   just cyclist package      # Build Electron app for distribution
#   just cyclist install      # Install app to /Applications + CLI to /usr/local/bin
cyclist *args:
    #!/usr/bin/env bash
    set -euo pipefail

    # Set up positional parameters from just args
    set -- {{args}}

    # Check for maintenance subcommands first
    case "${1:-}" in
        setup)
            echo "🚴 Setting up Cyclist..."
            echo ""
            echo "Step 1/4: Cleaning stale artifacts..."
            rm -rf packages/cyclist/dist/
            echo ""
            echo "Step 2/4: Installing dependencies..."
            pnpm install
            echo ""
            echo "Step 3/4: Rebuilding native modules (node-pty)..."
            cd packages/cyclist && npx electron-rebuild
            cd - > /dev/null
            echo ""
            echo "Step 4/4: Building TypeScript..."
            pnpm run build
            echo ""
            echo "✓ Cyclist setup complete!"
            echo ""
            echo "Next steps:"
            echo "  just cyclist           # Electron with folder picker"
            echo "  just cyclist here      # Electron in current directory"
            echo "  just cyclist web       # Web dev mode"
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
        rebuild)
            cd packages/cyclist && npx electron-rebuild
            exit 0
            ;;
        package)
            cd packages/cyclist && npm run build:electron
            exit 0
            ;;
        install)
            cd packages/cyclist
            ./scripts/install-app.sh
            ./scripts/install-cli.sh
            echo ""
            echo "✓ Cyclist installation complete!"
            echo "  - Launch from Applications: Cyclist.app"
            echo "  - Launch from terminal: cyclist [path]"
            exit 0
            ;;
    esac

    # Parse run mode arguments
    mode="electron"
    project_dir=""
    here="false"
    verbose="false"
    cdp="false"

    for arg in "$@"; do
        case "$arg" in
            electron|web|server)
                mode="$arg"
                ;;
            here)
                here="true"
                ;;
            cdp)
                cdp="true"
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
                echo "  just cyclist              # Electron + folder picker"
                echo "  just cyclist here         # Electron + current directory"
                echo "  just cyclist cdp          # Electron + CDP debugging (port 9222)"
                echo "  just cyclist web          # Web dev mode"
                echo "  just cyclist server       # Web server only"
                echo "  just cyclist verbose      # Enable debug logging"
                echo "  just cyclist dir=/path    # Specific directory"
                echo ""
                echo "Maintenance:"
                echo "  just cyclist setup        # First-time setup"
                echo "  just cyclist doctor       # Diagnose issues"
                echo "  just cyclist build        # Build TypeScript"
                echo "  just cyclist clean        # Remove dist/"
                echo "  just cyclist rebuild      # Rebuild native modules"
                echo "  just cyclist package      # Build Electron app"
                echo "  just cyclist install      # Install app + CLI"
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
    if [[ -z "$project_dir" ]] && [[ "$mode" != "electron" ]]; then
        project_dir="$(pwd)"
    fi

    cd packages/cyclist

    # Build environment
    env_vars=""
    [[ -n "$project_dir" ]] && env_vars="CYCLIST_PROJECT_DIR=$project_dir"
    [[ "$verbose" == "true" ]] && env_vars="$env_vars CYCLIST_VERBOSE=true"

    case "$mode" in
        electron)
            echo "Starting Cyclist (Electron)..."
            [[ -n "$project_dir" ]] && echo "  Project: $project_dir" || echo "  Project: (folder picker)"
            if [[ "$cdp" == "true" ]]; then
                echo "  CDP: enabled on port 9222 (Playwright)"
                eval $env_vars npm run dev:cdp
            else
                eval $env_vars npm run dev
            fi
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
    ./pennyfarthing-dist/scripts/portraits/generate-portraits.sh --theme {{theme}} --skip-existing

# Preview portrait generation without running (dry-run)
# Usage: just portraits-preview arthurian-mythos
portraits-preview theme:
    ./pennyfarthing-dist/scripts/portraits/generate-portraits.sh --theme {{theme}} --dry-run

# Generate portraits for all themes
portraits-all:
    ./pennyfarthing-dist/scripts/portraits/generate-portraits.sh --skip-existing

# Run Cyclist tests in watch mode
test-cyclist-watch:
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
    ./pennyfarthing-dist/scripts/validation/validate-agent-schema.sh {{args}}

# Validate subagent YAML frontmatter
validate-subagents:
    ./pennyfarthing-dist/scripts/misc/validate-subagent-frontmatter.sh

# Validate sprint YAML structure
validate-sprint *args:
    PYTHONPATH="{{justfile_directory()}}:${PYTHONPATH:-}" python3 -m pennyfarthing_scripts.sprint.validator {{args}}

# Run all validations
validate: validate-agents validate-subagents validate-sprint

# =============================================================================
# BikeRack
# =============================================================================

# Start BikeRack mode (WheelHub + Claude CLI)
# Run modes: here, dir=/path, stop, status, debug
bikerack *args:
    #!/usr/bin/env bash
    set -euo pipefail

    set -- {{args}}

    # Check for subcommands first
    case "${1:-start}" in
        stop)
            shift
            PYTHONPATH="{{justfile_directory()}}:${PYTHONPATH:-}" python3 -m pennyfarthing_scripts.bikerack stop "$@"
            exit 0
            ;;
        status)
            shift
            PYTHONPATH="{{justfile_directory()}}:${PYTHONPATH:-}" python3 -m pennyfarthing_scripts.bikerack status "$@"
            exit 0
            ;;
    esac

    # Parse run arguments
    project_dir=""
    debug_mode=false
    for arg in "$@"; do
        case "$arg" in
            here)
                project_dir="$(pwd)"
                ;;
            dir=*)
                project_dir="${arg#dir=}"
                ;;
            debug)
                debug_mode=true
                ;;
            start)
                # default, no-op
                ;;
            *)
                echo "Unknown argument: $arg"
                echo ""
                echo "Usage:"
                echo "  just bikerack              # Start in current directory"
                echo "  just bikerack here         # Start pointing at invocation directory"
                echo "  just bikerack dir=/path    # Start pointing at specific directory"
                echo "  just bikerack debug        # Hot-reload dev mode (no Claude CLI)"
                echo "  just bikerack stop         # Stop running instance"
                echo "  just bikerack status       # Show running state"
                exit 1
                ;;
        esac
    done

    # Debug mode: hot-reload server + vite rebuild watcher (no Claude CLI)
    if [[ "$debug_mode" == "true" ]]; then
        cd packages/cyclist
        export IS_BIKERACK=1
        export CYCLIST_PROJECT_DIR="${project_dir:-$(cd ../.. && pwd)}"
        echo "BikeRack debug mode — hot reload enabled"
        echo "  Project dir: $CYCLIST_PROJECT_DIR"
        echo "  Server: tsx watch src/bikerack.ts"
        echo "  Frontend: vite build --watch"
        echo ""
        npx concurrently -k \
            -n server,vite \
            -c green,magenta \
            "tsx watch src/bikerack.ts" \
            "vite build --watch"
        exit 0
    fi

    # Build project-dir flag
    dir_flag=""
    if [[ -n "$project_dir" ]]; then
        dir_flag="--project-dir $project_dir"
    fi

    PYTHONPATH="{{justfile_directory()}}:${PYTHONPATH:-}" python3 -m pennyfarthing_scripts.bikerack start $dir_flag
