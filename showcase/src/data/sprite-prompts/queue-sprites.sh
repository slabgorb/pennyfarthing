#!/bin/bash
# Queue sprite generation for remaining themes
# Runs 3 themes in parallel, waits for completion, then next batch

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/generate-sprites.py"
VENV="$HOME/.venvs/sd/bin/activate"

# Themes to generate (excluding already complete/in-progress)
THEMES=(
  agatha-christie arcane avatar-the-last-airbender babylon-5 battlestar-galactica
  better-call-saul big-lebowski black-sails blade-runner bobiverse
  breaking-bad control deadwood doctor-who dune
  expeditionary-force fargo foundation game-of-thrones hannibal
  harry-potter his-dark-materials historical-figures imperial-radch inspector-morse
  jane-austen justified legion-of-doom les-miserables mad-men
  marvel-mcu mash mass-effect neuromancer parks-and-rec
  peaky-blinders princess-bride rome sandman shakespeare
  sherlock-holmes snow-crash software-pioneers star-trek-tng star-trek-tos
  succession superfriends ted-lasso the-americans the-crown
  the-expanse the-good-place the-office the-sopranos the-wire
  the-witcher vorkosigan-saga watchmen west-wing world-explorers
  wwii-leaders
)

BATCH_SIZE=3
TOTAL=${#THEMES[@]}

echo "=== Sprite Generation Queue ==="
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
