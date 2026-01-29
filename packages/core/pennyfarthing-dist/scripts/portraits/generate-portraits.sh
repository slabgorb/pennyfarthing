#!/usr/bin/env bash
#
# Portrait Generator Wrapper
# Activates venv and runs generate-portraits.py with all arguments
#
# Usage:
#   ./scripts/generate-portraits.sh --theme arthurian-mythos --dry-run
#   ./scripts/generate-portraits.sh --theme shakespeare
#   ./scripts/generate-portraits.sh --theme star-trek-tos --output-dir /tmp/portraits
#   ./scripts/generate-portraits.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find PROJECT_ROOT by looking for .pennyfarthing or pennyfarthing-dist marker
_dir="$SCRIPT_DIR"
while [[ ! -d "$_dir/.pennyfarthing" ]] && [[ ! -d "$_dir/pennyfarthing-dist" ]] && [[ "$_dir" != "/" ]]; do
    _dir="$(dirname "$_dir")"
done
PROJECT_ROOT="$_dir"

# If we're in the pennyfarthing repo itself, look for .venv there
# If we're in a user project, .venv should be at project root
VENV_DIR="$PROJECT_ROOT/.venv"
PYTHON_SCRIPT="$SCRIPT_DIR/generate-portraits.py"

# Check venv exists
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Error: Virtual environment not found at $VENV_DIR"
    echo "Create it with: python3 -m venv .venv"
    echo "Then install: pip install diffusers transformers accelerate torch pillow pyyaml"
    exit 1
fi

# Check Python script exists
if [[ ! -f "$PYTHON_SCRIPT" ]]; then
    echo "Error: generate-portraits.py not found at $PYTHON_SCRIPT"
    exit 1
fi

# Activate venv and run
source "$VENV_DIR/bin/activate"

# Verify torch is available
if ! python -c "import torch" 2>/dev/null; then
    echo "Error: torch not installed in venv"
    echo "Install with: pip install diffusers transformers accelerate torch pillow"
    deactivate
    exit 1
fi

# Run the portrait generator with all passed arguments
python "$PYTHON_SCRIPT" "$@"
