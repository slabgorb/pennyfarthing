#!/bin/bash
# Watch job fairs and start next batch when current finishes
# Usage: ./scripts/job-fair-watcher.sh &

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Job Fair Watcher started at $(date)"

# Function to check if a theme is running
is_running() {
    pgrep -f "job-fair-batch.sh $1" > /dev/null 2>&1
}

# Function to start a theme
start_theme() {
    local theme="$1"
    echo "$(date): Starting $theme"
    nohup "$SCRIPT_DIR/job-fair-batch.sh" "$theme" 4 > "/tmp/job-fair-${theme}.log" 2>&1 &
    echo "$(date): $theme PID: $!"
}

# Wait for batch 1 to complete
while is_running "arthurian-mythos" || is_running "greek-mythology"; do
    sleep 60
done
echo "$(date): Batch 1 complete"

# Start batch 2
start_theme "discworld"
start_theme "snow-crash"

# Wait for batch 2 to complete
while is_running "discworld" || is_running "snow-crash"; do
    sleep 60
done
echo "$(date): Batch 2 complete"

# Start batch 3
start_theme "the-simpsons"

# Wait for batch 3 to complete
while is_running "the-simpsons"; do
    sleep 60
done
echo "$(date): Batch 3 complete - ALL DONE!"

# Final summary
echo ""
echo "=== Final Results ==="
"$SCRIPT_DIR/job-fair-progress.sh"
