# Pennyfarthing development tasks

# Python interpreter — use venv when available, fall back to system python3
venv_python := if path_exists(justfile_directory() / ".venv/bin/python3") == "true" { justfile_directory() / ".venv/bin/python3" } else { "python3" }

# Default recipe - list available commands
default:
    @just --list

# =============================================================================
# Testing
# =============================================================================

# Run all Python tests
test:
    python3 -m pytest pennyfarthing-dist/src/pf/tests/ tests/python/

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

# Run all validations
validate: validate-agents validate-subagents validate-sprint

# =============================================================================
# Frame / TUI
# =============================================================================

# Start Frame server
# Run modes: here, dir=/path, stop, status
frame *args:
    #!/usr/bin/env bash
    set -euo pipefail

    set -- {{args}}

    case "${1:-start}" in
        stop)
            shift
            PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.frame stop "$@"
            exit 0
            ;;
        status)
            shift
            PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.frame status "$@"
            exit 0
            ;;
    esac

    dir_flag=""
    for arg in "$@"; do
        case "$arg" in
            here)
                dir_flag="--project-dir $(pwd)"
                ;;
            dir=*)
                dir_flag="--project-dir ${arg#dir=}"
                ;;
            start)
                ;;
            *)
                echo "Unknown argument: $arg"
                echo ""
                echo "Usage:"
                echo "  just frame              # Start Frame server"
                echo "  just frame here         # Start pointing at invocation directory"
                echo "  just frame dir=/path    # Start pointing at specific directory"
                echo "  just frame stop         # Stop running instance"
                echo "  just frame status       # Show running state"
                exit 1
                ;;
        esac
    done

    PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.frame start $dir_flag

# Launch TUI (connects to running Frame server)
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

    PYTHONPATH="{{justfile_directory()}}/pennyfarthing-dist:${PYTHONPATH:-}" {{venv_python}} -m pf.tui $port_flag $project_dir_flag
