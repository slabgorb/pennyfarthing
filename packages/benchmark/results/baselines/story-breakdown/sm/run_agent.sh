#!/bin/bash
# Run control:sm agent for baseline

PROMPT="You are a Scrum Master. Break down this epic into user stories: We need user notifications for important app events. Identify questions for PM, make assumptions, create 4-8 stories with acceptance criteria and story points. Team velocity is 20 points, no existing notification infrastructure, web and mobile clients, users have emails. Keep under 800 words."

OUTPUT_FILE="/tmp/baseline_run_output.txt"

echo "TIMESTAMP: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
claude -p --print --model claude-sonnet-4-20250514 "$PROMPT" > "$OUTPUT_FILE" 2>&1
echo "EXIT_CODE: $?"
echo "=== OUTPUT ==="
cat "$OUTPUT_FILE"
