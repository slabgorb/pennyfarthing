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


def resolve_gate_extensions(
    gate_name: str,
    project_root: Path | None = None,
) -> dict:
    """Resolve extension gates for a given gate name from config.

    Reads repos.yaml gates.extensions.{gate_name} and resolves
    each extension gate file via resolve_gate_file().

    Returns:
        dict with keys:
            success: bool
            data: list[str] — resolved gate refs (e.g., ["gates/rustfmt-check"])
            error: str | None
    """
    from pf.git.repos import load_repos_yaml_raw

    if project_root is None:
        project_root = _find_project_root()

    config = load_repos_yaml_raw(project_root)
    extensions = (
        config.get("gates", {}).get("extensions", {}).get(gate_name, [])
    )

    if not extensions:
        return {"success": True, "data": [], "error": None}

    resolved: list[str] = []
    for ext_name in extensions:
        result = resolve_gate_file(ext_name, project_root=project_root)
        if result["status"] != "found":
            return {
                "success": False,
                "data": [],
                "error": (
                    f"Extension gate '{ext_name}' for '{gate_name}' "
                    f"not found: {result['error']}"
                ),
            }
        resolved.append(f"gates/{_sanitize_gate_name(ext_name)}")

    return {"success": True, "data": resolved, "error": None}


def _find_project_root() -> Path:
    """Walk up from cwd looking for .pennyfarthing/ directory."""
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
