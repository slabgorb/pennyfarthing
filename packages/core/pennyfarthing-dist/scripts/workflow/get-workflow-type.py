#!/usr/bin/env python3
"""
get-workflow-type.py - Determine if a workflow is phased or stepped

Usage: python get-workflow-type.py <workflow-name>

Returns: "phased" or "stepped" (stdout)
Exit 1 if workflow not found
"""

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def find_project_root() -> Path:
    """Find project root by looking for .pennyfarthing directory."""
    current = Path.cwd()
    while current != current.parent:
        if (current / ".pennyfarthing").is_dir():
            return current
        current = current.parent
    return Path.cwd()


def get_workflow_type(workflow_name: str) -> str:
    """Get workflow type from YAML definition."""
    project_root = find_project_root()
    workflows_dir = project_root / ".pennyfarthing" / "workflows"
    workflow_file = workflows_dir / f"{workflow_name}.yaml"

    if not workflow_file.exists():
        print(f"Error: Workflow '{workflow_name}' not found", file=sys.stderr)
        sys.exit(1)

    with open(workflow_file) as f:
        data = yaml.safe_load(f)

    # Extract type, default to "phased" if not specified
    workflow_type = data.get("workflow", {}).get("type", "phased")
    return workflow_type


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: get-workflow-type.py <workflow-name>", file=sys.stderr)
        return 1

    workflow_name = sys.argv[1]
    workflow_type = get_workflow_type(workflow_name)
    print(workflow_type)
    return 0


if __name__ == "__main__":
    sys.exit(main())
