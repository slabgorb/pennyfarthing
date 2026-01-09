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
