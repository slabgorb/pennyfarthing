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

from pf.common.config import get_dist_root


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
    if project_root is None:
        project_root = _find_project_root()

    name = _sanitize_gate_name(gate_ref)
    if name is None:
        return _result(
            status="not_found",
            error=f"Invalid gate reference: {gate_ref!r}",
        )

    # Resolution order: local first, built-in fallback
    search_paths = [
        project_root / ".pennyfarthing" / "gates" / f"{name}.md",
    ]
    dist_root = get_dist_root(project_root=project_root)
    if dist_root:
        search_paths.append(dist_root / "gates" / f"{name}.md")

    for candidate in search_paths:
        if candidate.is_file():
            return _result(status="found", path=str(candidate.resolve()))

    return _result(
        status="not_found",
        error=f"Gate file not found: {name}",
    )


def _sanitize_gate_name(gate_ref: str) -> str | None:
    """Extract a clean gate name from a reference string.

    Strips 'gates/' prefix and '.md' suffix. Rejects empty names
    and path traversal attempts.
    """
    if not gate_ref:
        return None

    name = gate_ref
    # Strip gates/ prefix
    if name.startswith("gates/"):
        name = name[len("gates/"):]
    # Strip .md suffix
    if name.endswith(".md"):
        name = name[: -len(".md")]

    if not name:
        return None

    # Reject path traversal
    if ".." in name or "/" in name:
        return None

    return name


def _result(
    status: str,
    path: str | None = None,
    error: str | None = None,
) -> dict:
    return {
        "status": status,
        "path": path,
        "error": error,
    }


def _find_project_root() -> Path:
    """Walk up from cwd looking for .pennyfarthing/ directory."""
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
