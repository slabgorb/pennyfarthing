#!/bin/bash
# Queue portrait generation for remaining themes
# Runs 3 themes in parallel, waits for completion, then next batch

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/generate-portraits.py"

# Use project-local venv if it exists, otherwise fall back to home dir
if [[ -f "$SCRIPT_DIR/.venv/bin/activate" ]]; then
  VENV="$SCRIPT_DIR/.venv/bin/activate"
elif [[ -f "$HOME/.venvs/sd/bin/activate" ]]; then
  VENV="$HOME/.venvs/sd/bin/activate"
else
  echo "ERROR: No Python venv found with torch/diffusers."
  echo "Create one with:"
  echo "  cd $SCRIPT_DIR"
  echo "  python3 -m venv .venv"
  echo "  source .venv/bin/activate"
  echo "  pip install -r requirements.txt"
  exit 1
fi

# Themes to generate - 7 missing themes
THEMES=(
  hitchhikers-guide house-md jazz-legends lord-of-the-rings
  military-commanders moby-dick norse-mythology
)

BATCH_SIZE=3
TOTAL=${#THEMES[@]}

echo "=== Portrait Generation Queue ==="
echo "Total themes: $TOTAL"
echo "Batch size: $BATCH_SIZE"
echo ""

source "$VENV"

for ((i=0; i<TOTAL; i+=BATCH_SIZE)); do
  batch=("${THEMES[@]:i:BATCH_SIZE}")
  batch_num=$((i/BATCH_SIZE + 1))
  total_batches=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

  echo "=== Batch $batch_num/$total_batches: ${batch[*]} ==="

  # Launch batch in parallel
  pids=()
  for theme in "${batch[@]}"; do
    echo "Starting: $theme"
    python3 "$SCRIPT" --theme "$theme" --skip-existing &
    pids+=($!)
  done

  # Wait for all in batch to complete
  for pid in "${pids[@]}"; do
    wait $pid
  done

  echo "Batch $batch_num complete."
  echo ""
done

echo "=== All themes complete! ==="
