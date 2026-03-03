"""Unified pf binary discovery.

Story 136-1: Resolves the absolute path to the `pf` executable across
all install methods (pip, pipx, uv, monorepo). Used by init to generate
the project-local shim at .pennyfarthing/bin/pf.

The discovery function probes a prioritized list of candidate paths and
returns a result dict with the absolute path and detected install method.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def resolve_pf_binary() -> dict:
    """Resolve the absolute path to the pf CLI binary.

    Probe chain (first match wins):
      1. PF_BINARY env var (explicit override)
      2. ~/.local/bin/pf (pip/pipx user install)
      3. ~/.local/share/uv/tools/pennyfarthing*/bin/pf (uv tool install)
      4. Monorepo pf_launcher.py (CWD walk-up)
      5. shutil.which("pf") fallback

    Returns:
        Result dict: {success, data?, error?}
        On success: data = {path: str, install_method: str}
        On failure: error = str, install_hint = str, probed_locations = list
    """
    probed: list[str] = []

    # 1. PF_BINARY env var (explicit override)
    pf_binary_env = os.environ.get("PF_BINARY")
    if pf_binary_env:
        p = Path(pf_binary_env)
        if not p.exists():
            return {
                "success": False,
                "error": f"PF_BINARY points to nonexistent path: {pf_binary_env}",
            }
        if not p.is_file():
            return {
                "success": False,
                "error": f"PF_BINARY points to a non-file: {pf_binary_env}",
            }
        return {
            "success": True,
            "data": {"path": str(p), "install_method": "env_override"},
        }

    # 2. ~/.local/bin/pf (pip/pipx user install)
    home = Path(os.environ.get("HOME", os.path.expanduser("~")))
    local_bin_pf = home / ".local" / "bin" / "pf"
    probed.append(str(local_bin_pf))

    if local_bin_pf.is_symlink():
        target = local_bin_pf.resolve()
        if target.exists() and os.access(str(local_bin_pf), os.X_OK):
            if "pipx" in str(target):
                return {
                    "success": True,
                    "data": {"path": str(local_bin_pf), "install_method": "pipx"},
                }
            return {
                "success": True,
                "data": {"path": str(local_bin_pf), "install_method": "pip"},
            }
        # Stale or non-executable symlink — fall through
    elif local_bin_pf.is_file() and os.access(str(local_bin_pf), os.X_OK):
        return {
            "success": True,
            "data": {"path": str(local_bin_pf), "install_method": "pip"},
        }

    # 3. uv tools dir
    uv_tools_dir = home / ".local" / "share" / "uv" / "tools"
    probed.append(str(uv_tools_dir / "pennyfarthing-*" / "bin" / "pf"))

    if uv_tools_dir.is_dir():
        for match in sorted(uv_tools_dir.glob("pennyfarthing*/bin/pf")):
            if match.is_file() and os.access(str(match), os.X_OK):
                return {
                    "success": True,
                    "data": {"path": str(match), "install_method": "uv"},
                }

    # 4. Monorepo pf_launcher.py (CWD walk-up)
    try:
        cwd = Path(os.getcwd()).resolve()
    except OSError:
        cwd = None

    if cwd:
        current = cwd
        while True:
            # Framework repo layout
            launcher = current / "pennyfarthing-dist" / "src" / "pf_launcher.py"
            probed.append(str(launcher))
            if launcher.is_file():
                return {
                    "success": True,
                    "data": {"path": str(launcher), "install_method": "monorepo"},
                }
            # Orchestrator layout
            launcher2 = current / "pennyfarthing" / "pennyfarthing-dist" / "src" / "pf_launcher.py"
            probed.append(str(launcher2))
            if launcher2.is_file():
                return {
                    "success": True,
                    "data": {"path": str(launcher2), "install_method": "monorepo"},
                }
            parent = current.parent
            if parent == current:
                break
            current = parent

    # 5. shutil.which fallback
    which_pf = shutil.which("pf")
    probed.append("which('pf')")
    if which_pf:
        return {
            "success": True,
            "data": {"path": which_pf, "install_method": "which"},
        }

    # All probes failed
    return {
        "success": False,
        "error": "pf CLI not found. Searched all known install locations.",
        "install_hint": "Install with: pipx install pennyfarthing-scripts",
        "probed_locations": probed,
    }


def generate_shim_content(discovery_result: dict, project_root: str | None = None) -> str:
    """Generate the content for the .pennyfarthing/bin/pf shim script.

    Args:
        discovery_result: Successful result from resolve_pf_binary()
        project_root: Absolute path to project root (for monorepo shims)

    Returns:
        Shell script content string for the shim.
    """
    data = discovery_result["data"]
    path = data["path"]
    method = data["install_method"]

    lines = ["#!/usr/bin/env bash"]

    if method == "monorepo" or path.endswith(".py"):
        lines.append(f'exec /usr/bin/env python3 "{path}" "$@"')
    else:
        lines.append(f'exec "{path}" "$@"')

    return "\n".join(lines) + "\n"


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
    project = Path(project_root)
    bin_dir = project / ".pennyfarthing" / "bin"

    try:
        bin_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return {"success": False, "error": str(e)}

    shim_path = bin_dir / "pf"
    content = generate_shim_content(discovery_result, project_root=project_root)

    shim_path.write_text(content)
    shim_path.chmod(0o755)

    return {
        "success": True,
        "data": {
            "shim_path": str(shim_path),
            "install_method": discovery_result["data"]["install_method"],
        },
    }
