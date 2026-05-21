"""
Git hooks installer — Python replacement for install-git-hooks.sh (145 lines).

Creates .d/ dispatcher directories, symlinks pennyfarthing hooks,
and migrates existing user hooks.

Usage via CLI:
    pf git install-hooks
"""

from __future__ import annotations

import os
from pathlib import Path

from pf.common.config import get_dist_root, get_project_root

DISPATCHER_MARKER = "pennyfarthing-dispatcher"
PF_PREFIX = "10"
MIGRATED_PREFIX = "50"

# Hook source file → git hook name
HOOKS = [
    ("pre-commit.sh", "pre-commit"),
    ("pre-push.sh", "pre-push"),
    ("post-merge.sh", "post-merge"),
]


def _generate_dispatcher(template_path: Path, hook_name: str) -> str:
    """Generate a dispatcher script from the template."""
    template = template_path.read_text()
    return template.replace("__HOOK_NAME__", hook_name)


def install_git_hooks(project_root: Path | None = None) -> int:
    """Install git hooks with .d/ dispatcher pattern.

    Creates .d/ directories for each hook, installs dispatcher scripts,
    and symlinks pennyfarthing hooks into the .d/ directories.
    Existing non-pennyfarthing hooks are migrated into .d/.

    Args:
        project_root: Project root. Auto-detected if not provided.

    Returns:
        0 on success, 1 on error
    """
    if project_root is None:
        project_root = get_project_root()

    pf_dist = get_dist_root(project_root=project_root)
    if pf_dist is None or not pf_dist.is_dir():
        print("Error: pennyfarthing-dist not found")
        print("       End-user projects should use: pf setup")
        return 1

    git_dir = project_root / ".git"
    if not git_dir.is_dir():
        print("Error: Not a git repository")
        return 1

    hooks_source = pf_dist / "scripts" / "hooks"
    hooks_dest = git_dir / "hooks"
    hooks_dest.mkdir(exist_ok=True)

    dispatcher_template = hooks_source / "dispatcher-template.sh"
    if not dispatcher_template.is_file():
        print(f"Error: dispatcher-template.sh not found at {dispatcher_template}")
        return 1

    print("Installing git hooks with .d/ dispatcher pattern...")
    print("  Source: pennyfarthing-dist/scripts/hooks/")
    print("  Dest:   .git/hooks/")
    print()

    for source_file, dest_name in HOOKS:
        source_path = hooks_source / source_file
        dest_path = hooks_dest / dest_name
        d_dir = hooks_dest / f"{dest_name}.d"
        pf_hook_name = f"{PF_PREFIX}-pennyfarthing-{dest_name}.sh"
        pf_hook_path = d_dir / pf_hook_name

        if not source_path.is_file():
            print(f"  SKIP {dest_name} (source not found)")
            continue

        # Create .d/ directory
        d_dir.mkdir(exist_ok=True)

        # Handle existing hook at dest path
        if dest_path.exists():
            if dest_path.is_file():
                content = dest_path.read_text()
                if DISPATCHER_MARKER in content:
                    print(f"  OK   {dest_name} dispatcher (already installed)")
                elif dest_path.is_symlink():
                    # Old-style symlink — replace with dispatcher
                    dest_path.unlink()
                    dest_path.write_text(_generate_dispatcher(dispatcher_template, dest_name))
                    dest_path.chmod(0o755)
                    print(f"  UPD  {dest_name} -> dispatcher")
                elif "pennyfarthing" in content:
                    # Old pennyfarthing single-file hook — replace
                    dest_path.write_text(_generate_dispatcher(dispatcher_template, dest_name))
                    dest_path.chmod(0o755)
                    print(f"  UPD  {dest_name} -> dispatcher (was single-file pf hook)")
                else:
                    # Non-pennyfarthing hook — migrate into .d/
                    migrated_name = f"{MIGRATED_PREFIX}-migrated-{dest_name}.sh"
                    migrated_path = d_dir / migrated_name
                    if not migrated_path.exists():
                        dest_path.rename(migrated_path)
                        migrated_path.chmod(0o755)
                        print(f"  MIG  {dest_name} -> {dest_name}.d/{migrated_name}")
                    dest_path.write_text(_generate_dispatcher(dispatcher_template, dest_name))
                    dest_path.chmod(0o755)
                    print(f"  NEW  {dest_name} dispatcher")
            elif dest_path.is_symlink():
                dest_path.unlink()
                dest_path.write_text(_generate_dispatcher(dispatcher_template, dest_name))
                dest_path.chmod(0o755)
                print(f"  UPD  {dest_name} -> dispatcher")
        else:
            # No existing hook — install fresh dispatcher
            dest_path.write_text(_generate_dispatcher(dispatcher_template, dest_name))
            dest_path.chmod(0o755)
            print(f"  NEW  {dest_name} dispatcher")

        # Symlink pennyfarthing hook into .d/
        # Compute relative path from .git/hooks/{hook}.d/ to the hooks source
        relative_path = Path(os.path.relpath(hooks_source / source_file, d_dir))

        if pf_hook_path.is_symlink():
            current_target = pf_hook_path.readlink()
            if current_target == relative_path:
                print(f"  OK   {dest_name}.d/{pf_hook_name} (already linked)")
            else:
                pf_hook_path.unlink()
                pf_hook_path.symlink_to(relative_path)
                print(f"  UPD  {dest_name}.d/{pf_hook_name} -> {relative_path}")
        elif pf_hook_path.is_file():
            pf_hook_path.unlink()
            pf_hook_path.symlink_to(relative_path)
            print(f"  UPD  {dest_name}.d/{pf_hook_name} -> {relative_path} (was copy)")
        else:
            pf_hook_path.symlink_to(relative_path)
            print(f"  NEW  {dest_name}.d/{pf_hook_name} -> {relative_path}")

    print()
    print("Done. Verify with: ls -la .git/hooks/*.d/")
    return 0
