# Cyclist Distribution Guide

Cyclist is the visual terminal for Pennyfarthing, distributed as a standalone Electron application via GitHub Releases.

## Quick Start

1. Go to the [latest release](../../releases/latest)
2. Download the installer for your platform
3. Install and launch Cyclist
4. Point it at your project directory (must contain a `.pennyfarthing/` directory)

## Downloads

All release artifacts are available on the [GitHub Releases](../../releases) page.

| Platform | File | Type |
|----------|------|------|
| macOS | `Cyclist-{version}.dmg` | Disk image (drag to Applications) |
| macOS | `Cyclist-{version}-mac.zip` | Zip archive |
| Windows | `Cyclist Setup {version}.exe` | NSIS installer |
| Windows | `Cyclist {version}.exe` | Portable (no install needed) |
| Linux | `Cyclist-{version}.AppImage` | AppImage (run directly) |
| Linux | `cyclist_{version}_amd64.deb` | Debian package |

## Installation

### macOS

**DMG (recommended):**

1. Download `Cyclist-{version}.dmg`
2. Open the DMG and drag Cyclist to Applications
3. On first launch, macOS may warn about unsigned apps — right-click and select "Open"

**Zip:**

1. Download `Cyclist-{version}-mac.zip`
2. Extract and move `Cyclist.app` to Applications

> **Code signing:** Release builds are unsigned unless Apple Developer certificates are configured in the CI environment. See [Code Signing](#code-signing) below.

### Windows

**Installer (recommended):**

1. Download `Cyclist Setup {version}.exe`
2. Run the installer — it creates a Start Menu entry and desktop shortcut
3. Windows SmartScreen may warn about unsigned apps — click "More info" then "Run anyway"

**Portable:**

1. Download `Cyclist {version}.exe`
2. Run directly — no installation needed, no registry changes

### Linux

**AppImage:**

1. Download `Cyclist-{version}.AppImage`
2. Make executable: `chmod +x Cyclist-{version}.AppImage`
3. Run: `./Cyclist-{version}.AppImage`

**Debian package:**

```bash
sudo dpkg -i cyclist_{version}_amd64.deb
```

## Upgrading

1. Download the new version from [Releases](../../releases)
2. Install over the existing version (same process as initial install)
3. Your settings and project configuration are preserved (stored in `.pennyfarthing/` within your project)

## Configuration

Cyclist requires a Pennyfarthing project directory to function. On launch, it searches for `.pennyfarthing/` in:

1. The current working directory
2. `CYCLIST_PROJECT_DIR` environment variable (if set)
3. The `--project-dir` CLI argument

### Launch from Terminal

```bash
# macOS (after installing to Applications)
open -a Cyclist

# With explicit project directory
CYCLIST_PROJECT_DIR=/path/to/your/project open -a Cyclist

# Linux AppImage
CYCLIST_PROJECT_DIR=/path/to/your/project ./Cyclist-{version}.AppImage

# Linux deb
CYCLIST_PROJECT_DIR=/path/to/your/project cyclist
```

## Code Signing

Release builds support optional code signing via GitHub Actions secrets:

### macOS

| Secret | Description |
|--------|-------------|
| `MAC_CSC_LINK` | Base64-encoded .p12 certificate file |
| `MAC_CSC_KEY_PASSWORD` | Password for the .p12 certificate |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

Without these secrets, macOS builds are unsigned. Users will need to bypass Gatekeeper on first launch.

### Windows

| Secret | Description |
|--------|-------------|
| `WIN_CSC_LINK` | Base64-encoded code signing certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the certificate |

Without these secrets, Windows builds are unsigned. Users will see a SmartScreen warning.

## Release Process

Releases are automated via the `release-electron.yml` GitHub Actions workflow.

### Tag-triggered release

```bash
# Bump version in package.json, commit, then tag
git tag v11.2.0
git push origin v11.2.0
```

This triggers the full pipeline: test, build (macOS + Windows + Linux), create GitHub Release.

### Manual release

1. Go to Actions > "Release Electron App"
2. Click "Run workflow"
3. Optionally specify a version tag and whether to create a draft release

### What the pipeline does

1. **Test** — runs shared, core, and cyclist test suites
2. **Build** — builds Electron app on macOS, Windows, and Linux in parallel
3. **Release** — creates a GitHub Release with all platform artifacts and auto-generated release notes

## Troubleshooting

### macOS: "Cyclist is damaged and can't be opened"

This happens with unsigned builds. Fix:

```bash
xattr -cr /Applications/Cyclist.app
```

### Linux: AppImage won't launch

Ensure FUSE is available:

```bash
# Ubuntu/Debian
sudo apt install libfuse2
```

### Cyclist shows blank screen or 404

Ensure `CYCLIST_PROJECT_DIR` points to a directory containing `.pennyfarthing/`. Without this, the WheelHub server can't find project configuration.

### Build fails in CI

Check that workspace dependencies build correctly:

```bash
pnpm install
pnpm run build  # builds shared → core → cyclist → electron in order
```
