# Pennyfarthing development tasks

# Default recipe - list available commands
default:
    @just --list

# Start Cyclist in web development mode (browser + hot reload)
# Usage: just cyclist-web [project_dir]
# Default project_dir is current directory
cyclist-web project_dir=`pwd`:
    cd packages/cyclist && CYCLIST_PROJECT_DIR={{project_dir}} npm run dev:web

# Start Cyclist in Electron development mode
cyclist-electron:
    cd packages/cyclist && npm run dev

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

# Start Cyclist web server only (no Electron, for standalone mode)
cyclist-server project_dir=`pwd`:
    cd packages/cyclist && CYCLIST_PROJECT_DIR={{project_dir}} npm start

# Build Cyclist TypeScript
cyclist-build:
    cd packages/cyclist && npm run build

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

# First-time Cyclist setup (install deps, rebuild native modules, build)
cyclist-setup:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🚴 Setting up Cyclist..."
    echo ""
    echo "Step 1/3: Installing dependencies..."
    pnpm install
    echo ""
    echo "Step 2/3: Rebuilding native modules (node-pty)..."
    cd packages/cyclist && npx electron-rebuild
    echo ""
    echo "Step 3/3: Building TypeScript..."
    npm run build
    echo ""
    echo "✓ Cyclist setup complete!"
    echo ""
    echo "Next steps:"
    echo "  just cyclist-electron    # Run Electron app"
    echo "  just cyclist-web /path   # Run web mode"

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

# Start Cyclist web + Claude Code with telemetry in split workflow
# Run this, then open another terminal and run: just claude-with-cyclist
cyclist-web-info project_dir=`pwd`:
    #!/usr/bin/env bash
    echo "🚴 Starting Cyclist web server..."
    echo ""
    echo "To get token stats, run Claude Code in another terminal with:"
    echo "  just claude-with-cyclist"
    echo ""
    echo "Or manually:"
    echo "  OTEL_EXPORTER_OTLP_PROTOCOL=http/json \\"
    echo "  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:1898 \\"
    echo "  claude"
    echo ""
    cd packages/cyclist && CYCLIST_PROJECT_DIR={{project_dir}} npm start
