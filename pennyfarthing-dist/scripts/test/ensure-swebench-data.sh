#!/usr/bin/env bash
# ensure-swebench-data.sh - Downloads SWE-bench data if not present
#
# Usage: ensure-swebench-data.sh [--force]
#
# Downloads SWE-bench Verified dataset from HuggingFace to /tmp/swebench_all.json
# This is a dependency for:
#   - swebench-judge.py
#   - ground-truth-judge.py
#
# Options:
#   --force    Re-download even if file exists

set -euo pipefail

CACHE_PATH="/tmp/swebench_all.json"
DATASET_URL="https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified/resolve/main/data/test.jsonl"

force=false
if [[ "${1:-}" == "--force" ]]; then
    force=true
fi

# Check if already present
if [[ -f "$CACHE_PATH" ]] && [[ "$force" == "false" ]]; then
    echo "SWE-bench data already cached at $CACHE_PATH"
    exit 0
fi

echo "Downloading SWE-bench Verified dataset..."

# Download JSONL and convert to JSON array
if command -v curl &>/dev/null; then
    curl -sL "$DATASET_URL" | python3 -c "
import json
import sys
lines = [json.loads(line) for line in sys.stdin if line.strip()]
print(json.dumps(lines, indent=2))
" > "$CACHE_PATH"
elif command -v wget &>/dev/null; then
    wget -qO- "$DATASET_URL" | python3 -c "
import json
import sys
lines = [json.loads(line) for line in sys.stdin if line.strip()]
print(json.dumps(lines, indent=2))
" > "$CACHE_PATH"
else
    echo "Error: curl or wget required to download SWE-bench data"
    exit 1
fi

# Verify download
if [[ -f "$CACHE_PATH" ]]; then
    count=$(python3 -c "import json; print(len(json.load(open('$CACHE_PATH'))))")
    echo "Downloaded $count SWE-bench scenarios to $CACHE_PATH"
else
    echo "Error: Failed to download SWE-bench data"
    exit 1
fi
