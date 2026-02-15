"""Gate file discovery and resolution.

Resolves gate file references (e.g., "gates/tests-pass") to actual file paths.
Resolution order:
  1. .pennyfarthing/gates/{name}.md  (project-local override)
  2. pennyfarthing-dist/gates/{name}.md  (built-in fallback)

Non-existent files return an error result with status "blocked".

Story: 106-4 (Gate File Discovery and Resolution)
"""

from __future__ import annotations

from pathlib import Path


def resolve_gate_file(
    gate_ref: str,
    project_root: Path | None = None,
) -> dict:
    """Resolve a gate file reference to an absolute file path.

    Args:
        gate_ref: Gate reference string (e.g., "gates/tests-pass" or "tests-pass")
        project_root: Project root path. Auto-detected if None.

    Returns:
        dict with keys:
            status: "found" | "not_found"
            path: str | None  (absolute path if found)
            error: str | None (error message if not found)
    """
    raise NotImplementedError("Story 106-4: Dev implements this")
