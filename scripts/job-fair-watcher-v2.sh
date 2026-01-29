#!/bin/bash
# Watch job fairs - start batch 2 only (skip simpsons)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Job Fair Watcher v2 started at $(date)"
echo "Will run: discworld, snow-crash (skipping the-simpsons)"

is_running() {
    pgrep -f "job-fair-batch.sh $1" > /dev/null 2>&1
}

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

# Start batch 2 only
start_theme "discworld"
start_theme "snow-crash"

# Wait for batch 2 to complete
while is_running "discworld" || is_running "snow-crash"; do
    sleep 60
done
echo "$(date): Batch 2 complete - ALL DONE (skipped simpsons)"

# Final summary
echo ""
"$SCRIPT_DIR/job-fair-progress.sh" 2>/dev/null
