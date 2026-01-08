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
    ./scripts/generate-portraits.sh --theme {{theme}}

# Preview portrait generation without running (dry-run)
# Usage: just portraits-preview arthurian-mythos
portraits-preview theme:
    ./scripts/generate-portraits.sh --theme {{theme}} --dry-run

# Generate portraits for all themes
portraits-all:
    ./scripts/generate-portraits.sh
