"""Unified pf binary discovery.

Story 136-1: Resolves the absolute path to the `pf` executable across
all install methods (pip, pipx, uv, monorepo). Used by init to generate
the project-local shim at .pennyfarthing/bin/pf.

The discovery function probes a prioritized list of candidate paths and
returns a result dict with the absolute path and detected install method.
"""

from __future__ import annotations


def resolve_pf_binary() -> dict:
    """Resolve the absolute path to the pf CLI binary.

    Probe chain (first match wins):
      1. PF_BINARY env var (explicit override)
      2. ~/.local/bin/pf (pip/pipx user install)
      3. ~/.local/share/uv/tools/*/bin/pf (uv tool install)
      4. shutil.which("pf") fallback
      5. Monorepo pf_launcher.py (CWD walk-up)

    Returns:
        Result dict: {success, data?, error?}
        On success: data = {path: str, install_method: str}
        On failure: error = str, install_hint = str, probed_locations = list
    """
    raise NotImplementedError("resolve_pf_binary not yet implemented")


def generate_shim_content(discovery_result: dict, project_root: str | None = None) -> str:
    """Generate the content for the .pennyfarthing/bin/pf shim script.

    Args:
        discovery_result: Successful result from resolve_pf_binary()
        project_root: Absolute path to project root (for monorepo shims)

    Returns:
        Shell script content string for the shim.
    """
    raise NotImplementedError("generate_shim_content not yet implemented")


def write_shim(project_root: str, discovery_result: dict) -> dict:
    """Write the .pennyfarthing/bin/pf shim to disk.

    Creates .pennyfarthing/bin/ directory if needed. Writes the shim
    script and sets executable permissions.

    Args:
        project_root: Absolute path to project root
        discovery_result: Successful result from resolve_pf_binary()

    Returns:
        Result dict: {success, data?, error?}
        On success: data = {shim_path: str, install_method: str}
    """
    raise NotImplementedError("write_shim not yet implemented")
