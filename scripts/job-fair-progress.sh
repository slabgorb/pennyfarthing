#!/bin/bash
# Check job fair progress across all running themes

echo "=== Job Fair Progress ==="
echo ""

for log in /tmp/job-fair-*.log; do
    if [[ -f "$log" ]]; then
        theme=$(basename "$log" | sed 's/job-fair-//' | sed 's/.log//')

        # Count completed runs
        completed=$(grep -c "score=" "$log" 2>/dev/null || echo "0")
        total=200

        # Get last few lines
        last_char=$(grep -E "^  [A-Z]" "$log" 2>/dev/null | tail -1 | sed 's/^ *//')
        last_score=$(grep "score=" "$log" 2>/dev/null | tail -1 | grep -oE "score=[0-9.]+" | cut -d= -f2)

        # Check if still running
        if pgrep -f "job-fair-batch.sh $theme" > /dev/null 2>&1; then
            status="RUNNING"
        else
            status="DONE"
        fi

        pct=$((completed * 100 / total))
        echo "$theme: $completed/$total ($pct%) [$status]"
        [[ -n "$last_char" ]] && echo "  Last: $last_char -> $last_score"
    fi
done

echo ""
echo "Total estimated: 1000 runs"
total_done=$(cat /tmp/job-fair-*.log 2>/dev/null | grep -c "score=" || echo "0")
echo "Total completed: $total_done"
