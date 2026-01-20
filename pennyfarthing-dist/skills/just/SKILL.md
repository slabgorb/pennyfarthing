---
name: just
description: |
  Run just recipes for project tasks. This skill should be used when starting dev servers,
  running tests, managing Cyclist, generating portraits, or writing new justfile recipes.
args: "[recipe] [args...]"
---

# /just - Project Task Runner

`just` is a command runner for project tasks. All commands run from the **project root**.

## Commands

### `/just` or `/just --list`

List all available recipes.

**Run:**
```bash
just --list
```

**Output:** Recipe names with descriptions.

---

### `/just build`

Build all packages in the monorepo.

**Run:**
```bash
just build
```

**What it does:** Runs `pnpm run build` to compile TypeScript across all packages.

---

### `/just test`

Run tests for all packages.

**Run:**
```bash
just test
```

**What it does:** Runs `pnpm test` which executes Node.js native test runner across the monorepo.

---

### `/just test-cyclist`

Run tests for the Cyclist package only.

**Run:**
```bash
just test-cyclist
```

**What it does:** Runs `npm test` in `packages/cyclist/`.

---

### `/just test-cyclist-watch`

Run Cyclist tests in watch mode for TDD workflow.

**Run:**
```bash
just test-cyclist-watch
```

**What it does:** Runs Vitest in watch mode, re-running tests on file changes.

---

### `/just install`

Install dependencies for all packages.

**Run:**
```bash
just install
```

**What it does:** Runs `pnpm install` to install dependencies across the monorepo.

---

## Cyclist Commands

The `cyclist` recipe is the main entry point for Cyclist operations.

### `/just cyclist` (default)

Launch Cyclist in Electron mode with folder picker.

**Run:**
```bash
just cyclist
```

**What it does:** Starts Cyclist Electron app, prompting to select a project directory.

---

### `/just cyclist here`

Launch Cyclist for the current directory.

**Run:**
```bash
just cyclist here
```

**What it does:** Starts Cyclist Electron app with `pwd` as the project directory.

---

### `/just cyclist web`

Launch Cyclist in web dev mode with hot reload.

**Run:**
```bash
just cyclist web
```

**What it does:** Starts the web server with Vite for browser-based development.

---

### `/just cyclist server`

Start Cyclist web server only (no browser).

**Run:**
```bash
just cyclist server
```

**What it does:** Starts the backend server for headless or remote access.

---

### `/just cyclist verbose`

Enable debug logging for troubleshooting.

**Run:**
```bash
just cyclist verbose
```

**Combine flags:**
```bash
just cyclist here verbose
just cyclist web verbose
```

---

### `/just cyclist dir=<path>`

Launch Cyclist for a specific project directory.

**Run:**
```bash
just cyclist dir=/path/to/project
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `dir=` | Yes | Absolute path to project directory |

---

### `/just cyclist setup`

First-time setup for Cyclist development.

**Run:**
```bash
just cyclist setup
```

**What it does:**
1. Cleans stale artifacts (`rm -rf packages/cyclist/dist/`)
2. Installs dependencies (`pnpm install`)
3. Rebuilds native modules (`npx electron-rebuild`)
4. Builds TypeScript (`pnpm run build`)

---

### `/just cyclist doctor`

Diagnose Cyclist setup issues.

**Run:**
```bash
just cyclist doctor
just cyclist doctor --fix
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `--fix` | No | Auto-repair detected issues |

**What it does:** Checks for common setup problems and optionally fixes them.

---

### `/just cyclist build`

Build Cyclist TypeScript only.

**Run:**
```bash
just cyclist build
```

**What it does:** Compiles TypeScript in `packages/cyclist/`. Builds workspace dependencies first if missing.

---

### `/just cyclist clean`

Remove Cyclist build artifacts.

**Run:**
```bash
just cyclist clean
```

**What it does:** Removes `packages/cyclist/dist/` directory.

---

### `/just cyclist rebuild`

Rebuild native modules (node-pty) for Electron.

**Run:**
```bash
just cyclist rebuild
```

**What it does:** Runs `npx electron-rebuild` in `packages/cyclist/`.

**When needed:** After Node.js version changes or native module errors.

---

### `/just cyclist package`

Build Cyclist Electron app for distribution.

**Run:**
```bash
just cyclist package
```

**What it does:** Runs `npm run build:electron` to create distributable app.

---

### `/just cyclist install`

Install Cyclist app and CLI.

**Run:**
```bash
just cyclist install
```

**What it does:**
1. Installs `Cyclist.app` to `/Applications`
2. Installs `cyclist` CLI to `/usr/local/bin`

---

## Portrait Commands

Generate AI portraits for persona themes.

### `/just portraits <theme>`

Generate portraits for a specific theme.

**Run:**
```bash
just portraits arthurian-mythos
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `theme` | Yes | Theme name (e.g., `arthurian-mythos`, `the-expanse`) |

---

### `/just portraits-all`

Generate portraits for all themes.

**Run:**
```bash
just portraits-all
```

**Warning:** This is time-intensive. Generates portraits for all 102 themes.

---

### `/just portraits-preview <theme>`

Preview portraits for a theme without saving.

**Run:**
```bash
just portraits-preview arthurian-mythos
```

**Arguments:**
| Arg | Required | Description |
|-----|----------|-------------|
| `theme` | Yes | Theme name to preview |

---

## Passing Arguments to Recipes

Just recipes accept arguments directly (no `--` separator needed):

```bash
# Correct
just test-cyclist --filter "B-001"
just cyclist here verbose

# WRONG - don't use --
just test-cyclist -- --filter "B-001"
```

---

## Inspecting Recipes

### Show recipe definition

**Run:**
```bash
just --show <recipe>
```

**Example:**
```bash
just --show cyclist
# Shows the full recipe implementation
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `just` | List available recipes |
| `just build` | Build all packages |
| `just test` | Run all tests |
| `just test-cyclist` | Run Cyclist tests |
| `just test-cyclist-watch` | Cyclist tests in watch mode |
| `just install` | Install dependencies |
| `just cyclist` | Electron + folder picker |
| `just cyclist here` | Electron + current directory |
| `just cyclist web` | Web dev mode |
| `just cyclist server` | Web server only |
| `just cyclist setup` | First-time setup |
| `just cyclist doctor` | Diagnose issues |
| `just cyclist build` | Build TypeScript |
| `just cyclist clean` | Remove dist/ |
| `just cyclist rebuild` | Rebuild native modules |
| `just cyclist package` | Build Electron app |
| `just cyclist install` | Install app + CLI |
| `just portraits <theme>` | Generate theme portraits |
| `just portraits-all` | Generate all portraits |
| `just portraits-preview <theme>` | Preview portraits |

## Dependencies

```bash
brew install just
# or
cargo install just
```

## Reference

- **Official Docs:** https://just.systems/man/en/
