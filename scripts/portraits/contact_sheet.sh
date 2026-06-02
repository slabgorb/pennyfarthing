#!/usr/bin/env zsh
#
# contact_sheet.sh — build 4-wide contact sheets from portrait masters for review.
#
# Framework-dev tooling (not distributed). Wraps ImageMagick `montage`.
#
# Usage:
#   scripts/portraits/contact_sheet.sh [theme ...]   # one sheet per named theme
#   scripts/portraits/contact_sheet.sh               # all themes that have masters
#
# Env:
#   CONTACT_OUT   output dir (default: /tmp/contact)
#   TILE_PX       tile size in px (default: 320)
#   COLS          columns (default: 4)
#
# Output: $CONTACT_OUT/<theme>.png
#
set -euo pipefail

script_dir="${0:A:h}"
repo_root="${script_dir:h:h}"               # scripts/portraits -> repo root
portraits="$repo_root/pennyfarthing-dist/personas/portraits"
out_dir="${CONTACT_OUT:-/tmp/contact}"
tile_px="${TILE_PX:-320}"
cols="${COLS:-4}"

# Fanout dirs live alongside theme dirs — never treat them as themes.
fanout=(small medium large original)

if ! command -v montage >/dev/null 2>&1; then
  echo "error: ImageMagick 'montage' not found (brew install imagemagick)" >&2
  exit 1
fi

# ImageMagick 7 inits freetype even with empty labels and aborts if it can't
# resolve a default font. Pin an existing system font so `-label ''` works.
font=""
for f in /System/Library/Fonts/SFNS.ttf \
         /System/Library/Fonts/Supplemental/Arial.ttf \
         /Library/Fonts/Arial.ttf \
         /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf; do
  [[ -f "$f" ]] && { font="$f"; break; }
done
if [[ -z "$font" ]]; then
  echo "error: no usable TTF font found for montage labels" >&2
  exit 1
fi

# Resolve target themes.
if (( $# > 0 )); then
  themes=("$@")
else
  themes=()
  for d in "$portraits"/*(/N); do
    name="${d:t}"
    [[ ${fanout[(Ie)$name]} -ne 0 ]] && continue   # skip fanout dirs
    themes+=("$name")
  done
fi

mkdir -p "$out_dir"

made=0
for theme in "${themes[@]}"; do
  dir="$portraits/$theme"
  pngs=("$dir"/*.png(N))
  if (( ${#pngs} == 0 )); then
    echo "skip $theme — no PNG masters in $dir" >&2
    continue
  fi
  out="$out_dir/$theme.png"
  montage "${pngs[@]}" -font "$font" -label '' -tile "${cols}x" \
    -geometry "${tile_px}x${tile_px}+3+3" -background black "$out"
  echo "wrote $out (${#pngs} tiles)"
  made=$((made + 1))
done

echo "done — $made contact sheet(s) in $out_dir"
