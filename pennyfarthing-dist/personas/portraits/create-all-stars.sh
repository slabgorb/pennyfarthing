#!/bin/bash
# Create All-Stars Portrait Set
# Usage: ./create-all-stars.sh <team-name> <mapping-file>
#
# Mapping file format (one per line):
#   source-theme/portrait-file.png
#
# Example:
#   echo "lord-of-the-rings/aragorn-45342.png" > my-team.txt
#   echo "the-matrix/morpheus-55442.png" >> my-team.txt
#   ./create-all-stars.sh my-team my-team.txt

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAR_BADGE="$SCRIPT_DIR/.star-badge.png"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 <team-name> <mapping-file>"
    echo ""
    echo "Creates an all-star portrait set with gold star badges."
    echo ""
    echo "Arguments:"
    echo "  team-name     Name of the team directory to create"
    echo "  mapping-file  File containing source portrait paths (one per line)"
    echo ""
    echo "Mapping file format:"
    echo "  source-theme/portrait-file.png"
    echo ""
    echo "Example:"
    echo "  $0 all-stars portraits.txt"
    exit 1
}

create_star_badge() {
    if [[ -f "$STAR_BADGE" ]]; then
        echo -e "${YELLOW}Star badge already exists${NC}"
        return
    fi

    echo -e "${GREEN}Creating gold star badge...${NC}"
    magick -size 100x100 xc:transparent \
        -fill "gold" -stroke "darkgoldenrod" -strokewidth 2 \
        -draw "path 'M 50,5 L 61,35 L 95,35 L 68,55 L 79,90 L 50,70 L 21,90 L 32,55 L 5,35 L 39,35 Z'" \
        \( +clone -background "rgba(255,215,0,0.5)" -shadow 60x4+0+0 \) \
        +swap -background none -layers merge +repage \
        "$STAR_BADGE"
}

apply_star_badge() {
    local source="$1"
    local dest="$2"

    magick "$source" \
        \( "$STAR_BADGE" -resize 100x100 \) \
        -gravity northwest -geometry +10+10 -composite \
        "$dest"
}

# Check arguments
if [[ $# -ne 2 ]]; then
    usage
fi

TEAM_NAME="$1"
MAPPING_FILE="$2"

# Validate mapping file exists
if [[ ! -f "$MAPPING_FILE" ]]; then
    echo -e "${RED}Error: Mapping file '$MAPPING_FILE' not found${NC}"
    exit 1
fi

# Check for ImageMagick
if ! command -v magick &> /dev/null; then
    echo -e "${RED}Error: ImageMagick 7 (magick) is required${NC}"
    echo "Install with: brew install imagemagick"
    exit 1
fi

# Create output directory
OUTPUT_DIR="$SCRIPT_DIR/$TEAM_NAME"
mkdir -p "$OUTPUT_DIR"

# Create star badge if needed
create_star_badge

# Process each portrait
echo -e "${GREEN}Creating $TEAM_NAME portraits...${NC}"
count=0
errors=0

while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^# ]] && continue

    source_path="$SCRIPT_DIR/$line"
    filename=$(basename "$line")
    dest_path="$OUTPUT_DIR/$filename"

    if [[ ! -f "$source_path" ]]; then
        echo -e "${RED}  ✗ Not found: $line${NC}"
        ((errors++))
        continue
    fi

    apply_star_badge "$source_path" "$dest_path"
    echo -e "${GREEN}  ✓ $filename${NC}"
    ((count++))

done < "$MAPPING_FILE"

echo ""
echo -e "${GREEN}Done! Created $count portraits in $OUTPUT_DIR${NC}"
if [[ $errors -gt 0 ]]; then
    echo -e "${YELLOW}Warning: $errors portraits could not be found${NC}"
fi
