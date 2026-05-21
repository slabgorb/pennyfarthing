"""Shared extension loader for pf CLI groups.

Auto-discovers project-local CLI extensions from `.pennyfarthing/extensions/{group_name}/`.
Each extension file must define a `register(parent)` function that adds Click commands
to the parent group.

Convention:
    .pennyfarthing/extensions/benchmark/stats.py  → pf benchmark stats
    .pennyfarthing/extensions/sprint/foo.py        → pf sprint foo

Usage:
    from pf.extensions import load_extensions
    load_extensions(my_click_group, "benchmark")
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import click


def load_extensions(group, group_name: str) -> None:
    """Auto-discover CLI extensions from .pennyfarthing/extensions/{group_name}/.

    Args:
        group: Click group to register commands onto.
        group_name: Subdirectory name under .pennyfarthing/extensions/.
    """
    ext_dir = Path.cwd() / ".pennyfarthing" / "extensions" / group_name
    if not ext_dir.is_dir():
        return
    for py_file in sorted(ext_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        try:
            spec = importlib.util.spec_from_file_location(
                f"pf_ext_{group_name}_{py_file.stem}", py_file
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            if hasattr(mod, "register"):
                mod.register(group)
        except Exception as e:
            click.echo(
                f"Warning: failed to load {group_name} extension {py_file.name}: {e}",
                err=True,
            )
