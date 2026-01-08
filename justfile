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
