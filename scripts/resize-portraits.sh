#!/usr/bin/env zsh
#
# resize-portraits.sh - Generate multi-resolution portrait images
#
# This script creates optimized portrait sizes for the theme browser:
#   - small/  (64x64)   - For thumbnails, cards, lists
#   - medium/ (128x128) - For sidebar portrait display
#   - large/  (256x256) - For popup/modal display
#   - original/ (512x512) - Archived originals (moved from root)
#
# Usage:
#   ./scripts/resize-portraits.sh [--dry-run] [--theme <theme-id>]
#
# Options:
#   --dry-run       Show what would be done without making changes
#   --theme <id>    Process only a single theme (e.g., "discworld")
#   --quality <n>   PNG compression level 0-9 (default: 9, best compression)
#   --help          Show this help message
#
# Requirements:
#   - ImageMagick (convert command)
#
# Directory structure after running:
#   pennyfarthing-dist/personas/portraits/
#   ├── discworld/
#   │   ├── small/
#   │   │   └── granny-35211.png (64x64, ~12KB)
#   │   ├── medium/
#   │   │   └── granny-35211.png (128x128, ~40KB)
#   │   ├── large/
#   │   │   └── granny-35211.png (256x256, ~100KB)
#   │   └── original/
#   │       └── granny-35211.png (512x512, ~470KB)
#   └── ...

set -eo pipefail

# Configuration
SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
PORTRAITS_DIR="$PROJECT_ROOT/pennyfarthing-dist/personas/portraits"

# Sizes to generate - parallel arrays
SIZE_NAMES=(small medium large)
SIZE_DIMS=(64 128 256)

# Default options
DRY_RUN=false
SINGLE_THEME=""
QUALITY=9
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    print -P "${BLUE}[INFO]${NC} $1"
}

log_success() {
    print -P "${GREEN}[OK]${NC} $1"
}

log_warn() {
    print -P "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    print -P "${RED}[ERROR]${NC} $1" >&2
}

log_dry() {
    print -P "${YELLOW}[DRY-RUN]${NC} $1"
}

# Human-readable file size
human_size() {
    local bytes=$1
    if (( bytes >= 1048576 )); then
        printf "%.1fMB" $(( bytes / 1048576.0 ))
    elif (( bytes >= 1024 )); then
        printf "%.1fKB" $(( bytes / 1024.0 ))
    else
        printf "%dB" $bytes
    fi
}

# Show usage
usage() {
    head -35 "$0" | tail -32 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --theme)
                SINGLE_THEME="$2"
                shift 2
                ;;
            --quality)
                QUALITY="$2"
                shift 2
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                usage
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                ;;
        esac
    done
}

# Check dependencies and set ImageMagick command
MAGICK_CMD=""
check_dependencies() {
    # Prefer 'magick' (IMv7) over 'convert' (IMv6, deprecated)
    if command -v magick &> /dev/null; then
        MAGICK_CMD="magick"
        log_success "ImageMagick 7 found: $(magick --version | head -1)"
    elif command -v convert &> /dev/null; then
        MAGICK_CMD="convert"
        log_warn "Using deprecated 'convert' command (IMv6). Consider upgrading to ImageMagick 7."
        log_success "ImageMagick found: $(convert --version 2>/dev/null | head -1)"
    else
        log_error "ImageMagick is not installed. Please install it:"
        echo "  macOS:   brew install imagemagick"
        echo "  Ubuntu:  sudo apt-get install imagemagick"
        echo "  Fedora:  sudo dnf install ImageMagick"
        exit 1
    fi

    if ! command -v identify &> /dev/null && ! command -v magick &> /dev/null; then
        log_error "ImageMagick 'identify' command not found"
        exit 1
    fi
}

# Check if portraits directory exists
check_portraits_dir() {
    if [[ ! -d "$PORTRAITS_DIR" ]]; then
        log_error "Portraits directory not found: $PORTRAITS_DIR"
        exit 1
    fi
    log_info "Portraits directory: $PORTRAITS_DIR"
}

# Process a single image
process_image() {
    local src_file="$1"
    local theme_dir="$2"
    local filename="${src_file:t}"

    # Get source image dimensions (use magick identify for IMv7)
    local src_dims
    if [[ "$MAGICK_CMD" == "magick" ]]; then
        src_dims=$(magick identify -format "%wx%h" "$src_file" 2>/dev/null || echo "unknown")
    else
        src_dims=$(identify -format "%wx%h" "$src_file" 2>/dev/null || echo "unknown")
    fi

    if $VERBOSE; then
        log_info "  Processing: $filename ($src_dims)"
    fi

    # Generate each size
    for i in {1..${#SIZE_NAMES[@]}}; do
        local size_name="${SIZE_NAMES[$i]}"
        local dimension="${SIZE_DIMS[$i]}"
        local dest_dir="$theme_dir/$size_name"
        local dest_file="$dest_dir/$filename"

        if $DRY_RUN; then
            log_dry "  Would create: $size_name/$filename (${dimension}x${dimension})"
        else
            mkdir -p "$dest_dir"

            # Use high-quality resize with Lanczos filter
            $MAGICK_CMD "$src_file" \
                -resize "${dimension}x${dimension}" \
                -quality "$QUALITY" \
                -strip \
                "$dest_file"

            if $VERBOSE; then
                local new_size=$(stat -f%z "$dest_file" 2>/dev/null || stat -c%s "$dest_file" 2>/dev/null)
                log_info "    Created: $size_name/$filename ($(human_size "$new_size"))"
            fi
        fi
    done

    # Move original to original/ subdirectory
    local original_dir="$theme_dir/original"
    local original_dest="$original_dir/$filename"

    if $DRY_RUN; then
        log_dry "  Would move: $filename -> original/$filename"
    else
        mkdir -p "$original_dir"
        mv "$src_file" "$original_dest"
    fi
}

# Process a single theme directory
process_theme() {
    local theme_dir="$1"
    local theme_name="${theme_dir:t}"

    # Skip non-directories and hidden files
    if [[ ! -d "$theme_dir" ]] || [[ "$theme_name" == .* ]]; then
        return
    fi

    # Find PNG files in root of theme directory (not in subdirs)
    local png_files=()
    png_files=("$theme_dir"/*.png(N))

    if [[ ${#png_files[@]} -eq 0 ]]; then
        if $VERBOSE; then
            log_info "Skipping $theme_name (no root PNGs or already processed)"
        fi
        return
    fi

    log_info "Processing theme: $theme_name (${#png_files[@]} images)"

    local processed=0
    for png_file in "${png_files[@]}"; do
        process_image "$png_file" "$theme_dir"
        processed=$((processed + 1))
    done

    if ! $DRY_RUN; then
        log_success "  Completed: $processed images -> small/, medium/, large/, original/"
    fi
}

# Calculate and report space savings
report_savings() {
    if $DRY_RUN; then
        return
    fi

    log_info ""
    log_info "Calculating space usage..."

    local total_original=0
    local total_small=0
    local total_medium=0
    local total_large=0

    for theme_dir in "$PORTRAITS_DIR"/*/; do
        if [[ -d "$theme_dir/original" ]]; then
            total_original=$((total_original + $(du -sk "$theme_dir/original" 2>/dev/null | cut -f1 || echo 0)))
        fi
        if [[ -d "$theme_dir/small" ]]; then
            total_small=$((total_small + $(du -sk "$theme_dir/small" 2>/dev/null | cut -f1 || echo 0)))
        fi
        if [[ -d "$theme_dir/medium" ]]; then
            total_medium=$((total_medium + $(du -sk "$theme_dir/medium" 2>/dev/null | cut -f1 || echo 0)))
        fi
        if [[ -d "$theme_dir/large" ]]; then
            total_large=$((total_large + $(du -sk "$theme_dir/large" 2>/dev/null | cut -f1 || echo 0)))
        fi
    done

    echo ""
    echo "Space usage by size:"
    echo "  original/ (512x512): ${total_original}K"
    echo "  large/    (256x256): ${total_large}K"
    echo "  medium/   (128x128): ${total_medium}K"
    echo "  small/    (64x64):   ${total_small}K"
    echo ""

    local recommended=$((total_medium + total_large))
    local savings=$((total_original - recommended))
    echo "For typical UI usage (medium + large only):"
    echo "  Required: ${recommended}K (vs ${total_original}K original)"
    if [[ $savings -gt 0 ]]; then
        echo "  Savings:  ${savings}K (~$((savings * 100 / total_original))%)"
    fi
}

# Main function
main() {
    echo "========================================"
    echo "Portrait Resize Script for Pennyfarthing"
    echo "========================================"
    echo ""

    parse_args "$@"
    check_dependencies
    check_portraits_dir

    echo ""

    if $DRY_RUN; then
        log_warn "DRY RUN MODE - No changes will be made"
        echo ""
    fi

    local themes_processed=0

    if [[ -n "$SINGLE_THEME" ]]; then
        # Process single theme
        local theme_path="$PORTRAITS_DIR/$SINGLE_THEME"
        if [[ ! -d "$theme_path" ]]; then
            log_error "Theme not found: $SINGLE_THEME"
            exit 1
        fi
        process_theme "$theme_path"
        themes_processed=1
    else
        # Process all themes
        for theme_dir in "$PORTRAITS_DIR"/*/; do
            if [[ -d "$theme_dir" ]]; then
                process_theme "$theme_dir"
                themes_processed=$((themes_processed + 1))
            fi
        done
    fi

    echo ""
    log_success "Processed $themes_processed theme directories"

    if ! $DRY_RUN; then
        report_savings
    fi

    echo ""
    echo "Next steps:"
    echo "  1. Update portrait.js to use size-appropriate paths:"
    echo "     - /portraits/{theme}/small/{filename}  (64x64 for cards)"
    echo "     - /portraits/{theme}/medium/{filename} (128x128 for sidebar)"
    echo "     - /portraits/{theme}/large/{filename}  (256x256 for modals)"
    echo "  2. Original files preserved in /portraits/{theme}/original/"
    echo ""
}

main "$@"
