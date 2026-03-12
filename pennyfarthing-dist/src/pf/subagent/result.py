"""Parse and validate subagent return values."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def parse_subagent_result(raw_result: str) -> dict[str, Any]:
    """Parse structured SUBAGENT_RESULT from raw subagent output.

    Looks for a SUBAGENT_RESULT: YAML block. Returns parsed dict
    or a fallback with status 'unknown' and the raw text.
    """
    marker = "SUBAGENT_RESULT:"
    idx = raw_result.find(marker)
    if idx == -1:
        return {"status": "unknown", "raw": raw_result}

    yaml_text = raw_result[idx + len(marker) :]
    try:
        parsed = yaml.safe_load(yaml_text)
        if isinstance(parsed, dict):
            return parsed
    except yaml.YAMLError:
        pass

    return {"status": "unknown", "raw": raw_result}


def validate_handoff_reference(
    handoff_path: str, project_root: Path
) -> bool:
    """Check that a referenced handoff document exists on disk."""
    return (project_root / handoff_path).is_file()
