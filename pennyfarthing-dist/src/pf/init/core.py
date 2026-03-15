"""Core init logic — project initialization.

Story 126-2: Rewrite pf init in Python.

Creates .pennyfarthing/ and .claude/ directory structures,
copies pf-* commands, skills, and content directories (agents, guides,
personas, etc.), writes settings.local.json, and updates .gitignore.
Idempotent and deterministic.

Portrait images are centralized to ~/.local/share/pennyfarthing/portraits/
(XDG_DATA_HOME) and symlinked into each project to avoid duplicating ~1.1GB
of portrait data per consumer.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from pf.common.discovery import resolve_pf_binary, write_shim
from pf.common.hooks import INFRASTRUCTURE_HOOKS, resolve_hook_paths
from pf.hooks.frontmatter import collect_all_frontmatter_hooks, merge_with_infrastructure

# Wrap the shared hooks in the settings envelope expected by settings.local.json.
_MINIMAL_SETTINGS: dict = {
    "hooks": INFRASTRUCTURE_HOOKS,
    "statusLine": {
        "type": "command",
        "command": ".pennyfarthing/bin/pf hooks statusline",
    },
}

# Entries to add to .gitignore.
_GITIGNORE_ENTRIES: list[str] = [
    "# Pennyfarthing runtime",
    ".session/",
    ".claude/settings.local.json",
    ".pennyfarthing/config.local.yaml",
    "# Frame server runtime files",
    ".frame-port",
    "frame-pid",
    "tui-pid",
    "# Local pf shim (machine-specific absolute paths)",
    ".pennyfarthing/bin/",
    "# tmux runtime cache files",
    ".pennyfarthing/tmux-status",
    ".pennyfarthing/tmux-status-left",
    ".pennyfarthing/tmux-status-right",
    ".pennyfarthing/tmux-activity",
    "# Local tmux config (copied from sample)",
    "tmux.conf",
]

# Directories to create under the target project.
_PENNYFARTHING_DIRS: list[str] = [
    ".pennyfarthing",
    ".pennyfarthing/commands",
    ".pennyfarthing/skills",
    ".pennyfarthing/scripts",
    ".pennyfarthing/scripts/lib",
]

_CLAUDE_DIRS: list[str] = [
    ".claude",
    ".claude/agents",
    ".claude/commands",
    ".claude/skills",
]

# Content directories copied from dist_root to .pennyfarthing/.
# These provide agents, guides, personas, etc. that the framework reads at runtime.
# In the npm era these were symlinks to node_modules; now they're direct copies.
_CONTENT_DIRS: list[str] = [
    "agents",
    "data",
    "gates",
    "guides",
    "output-styles",
    "personas",
    "scripts",
    "templates",
    "workflows",
]

# Symlink map for dogfooding mode.  Keys are paths relative to the project
# root; values are the symlink *targets* (also relative to the project root).
# In dogfooding repos these directories must be symlinks so that edits to
# pennyfarthing-dist/ are reflected immediately at runtime.
_DOGFOODING_SYMLINKS: dict[str, str] = {
    ".pennyfarthing/agents": "pennyfarthing/pennyfarthing-dist/agents",
    ".pennyfarthing/commands": "pennyfarthing/pennyfarthing-dist/commands",
    ".pennyfarthing/data": "pennyfarthing/pennyfarthing-dist/data",
    ".pennyfarthing/gates": "pennyfarthing/pennyfarthing-dist/gates",
    ".pennyfarthing/guides": "pennyfarthing/pennyfarthing-dist/guides",
    ".pennyfarthing/output-styles": "pennyfarthing/pennyfarthing-dist/output-styles",
    ".pennyfarthing/personas": "pennyfarthing/pennyfarthing-dist/personas",
    ".pennyfarthing/scripts": "pennyfarthing/pennyfarthing-dist/scripts",
    ".pennyfarthing/skills": "pennyfarthing/pennyfarthing-dist/skills",
    ".pennyfarthing/templates": "pennyfarthing/pennyfarthing-dist/templates",
    ".pennyfarthing/workflows": "pennyfarthing/pennyfarthing-dist/workflows",
    ".claude/agents": "pennyfarthing/pennyfarthing-dist/agents",
    ".claude/commands": "pennyfarthing/pennyfarthing-dist/commands",
    ".claude/skills": "pennyfarthing/pennyfarthing-dist/skills",
}


def _is_dogfooding_repo(target_dir: Path, dist_root: Path) -> bool:
    """Detect if this is the framework dogfooding repo.

    A dogfooding repo has pennyfarthing/pennyfarthing-dist/ inlined and
    that directory *is* the dist_root we were given.
    """
    inlined = target_dir / "pennyfarthing" / "pennyfarthing-dist"
    if not inlined.is_dir():
        return False
    try:
        return inlined.resolve() == dist_root.resolve()
    except OSError:
        return False


def _ensure_dogfooding_symlinks(target_dir: Path) -> int:
    """Create or repair dogfooding symlinks.

    Returns the number of symlinks created or repaired.
    """
    fixed = 0
    for link_path_str, target_str in _DOGFOODING_SYMLINKS.items():
        link_path = target_dir / link_path_str
        # Build relative target from the link's parent directory
        rel_target = os.path.relpath(target_dir / target_str, link_path.parent)

        # Already a correct symlink?
        if link_path.is_symlink():
            try:
                if link_path.resolve() == (target_dir / target_str).resolve():
                    continue
            except OSError:
                pass
            link_path.unlink()

        # Remove flat-copy directory that init would have created
        if link_path.is_dir():
            shutil.rmtree(link_path)
        elif link_path.exists():
            link_path.unlink()

        link_path.parent.mkdir(parents=True, exist_ok=True)
        link_path.symlink_to(rel_target)
        fixed += 1
    return fixed


def verify_pf_cli() -> dict:
    """Verify that the pf CLI is available and functional.

    Checks that `pf --version` succeeds and detects the install method
    (pipx, pip, or unknown). Returns a stale-shim error if pf is on
    PATH but its backing virtualenv is broken.

    Returns:
        Result dict: {success, version?, install_method?, error?, install_hint?}
    """
    import shutil as _shutil

    pf_path = _shutil.which("pf")
    if pf_path is None:
        return {
            "success": False,
            "error": "pf CLI not found on PATH. Hooks require it.",
            "install_hint": "pipx install pennyfarthing-scripts",
        }

    # Try running pf --version to check it's not a stale shim
    try:
        result = subprocess.run(
            ["pf", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {
            "success": False,
            "error": f"pf found but broken — {exc}",
            "install_hint": "pipx install pennyfarthing-scripts",
        }

    if result.returncode != 0:
        stderr = result.stderr.strip()
        return {
            "success": False,
            "error": f"pf found but broken — stale shim at {pf_path}",
            "install_hint": "pipx install pennyfarthing-scripts",
            "detail": stderr,
        }

    version = result.stdout.strip().removeprefix("pf, version ").strip()

    # Detect install method from pf_path
    install_method = "unknown"
    pf_resolved = str(Path(pf_path).resolve())
    if "pipx" in pf_resolved:
        install_method = "pipx"
    elif "uv" in pf_resolved:
        install_method = "uv"
    elif "site-packages" in pf_resolved:
        install_method = "pip"

    return {
        "success": True,
        "version": version,
        "install_method": install_method,
        "path": pf_path,
    }


def preview_hook_changes(
    target_dir: Path,
    dist_root: Path,
) -> dict:
    """Preview what hook changes pf init would make to settings.local.json.

    Returns:
        {
            "has_changes": bool,
            "is_new": bool,          # True if settings.local.json doesn't exist yet
            "added": list[str],      # Hook commands that would be added
            "removed": list[str],    # Hook commands that would be removed
            "upgraded": list[str],   # Hook commands that would be rewritten
        }
    """
    settings_path = target_dir / ".claude" / "settings.local.json"

    if not settings_path.exists():
        frontmatter_hooks = collect_all_frontmatter_hooks(dist_root)
        merged = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter_hooks)
        all_commands = []
        for _event, entries in merged.get("hooks", {}).items():
            for entry in entries:
                for h in entry.get("hooks", []):
                    if isinstance(h, dict) and h.get("command"):
                        all_commands.append(h["command"])
        return {
            "has_changes": True,
            "is_new": True,
            "added": all_commands,
            "removed": [],
            "upgraded": [],
        }

    try:
        before = json.loads(settings_path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"has_changes": False, "is_new": False, "added": [], "removed": [], "upgraded": []}

    # Simulate the upgrade + merge
    import copy

    after = copy.deepcopy(before)
    frontmatter_hooks = collect_all_frontmatter_hooks(dist_root)

    # Simulate _upgrade_hooks inline (without writing)
    hooks = after.get("hooks", {})
    for hook_type, canonical_entries in INFRASTRUCTURE_HOOKS.items():
        existing = hooks.get(hook_type, [])
        if not isinstance(existing, list):
            existing = []
        has_dispatcher = any(
            "pf hooks dispatch" in h.get("command", "")
            for entry in existing
            for h in entry.get("hooks", [])
            if isinstance(h, dict)
        )
        if not has_dispatcher:
            project_hooks = []
            for entry in existing:
                hook_list = entry.get("hooks", [])
                is_old_pf = any(
                    _is_old_pf_hook_command(h.get("command", ""))
                    for h in hook_list
                    if isinstance(h, dict)
                )
                if not is_old_pf:
                    project_hooks.append(entry)
            hooks[hook_type] = canonical_entries + project_hooks
    after["hooks"] = hooks

    after = merge_with_infrastructure(after, frontmatter_hooks)
    resolve_hook_paths(after, target_dir)

    # Also resolve before for comparison
    before_resolved = copy.deepcopy(before)
    resolve_hook_paths(before_resolved, target_dir)

    # Diff the hook commands
    def _extract_commands(settings: dict) -> set[str]:
        cmds: set[str] = set()
        for _event, entries in settings.get("hooks", {}).items():
            if not isinstance(entries, list):
                continue
            for entry in entries:
                for h in entry.get("hooks", []):
                    if isinstance(h, dict) and h.get("command"):
                        cmds.add(h["command"])
        return cmds

    before_cmds = _extract_commands(before_resolved)
    after_cmds = _extract_commands(after)

    added = sorted(after_cmds - before_cmds)
    removed = sorted(before_cmds - after_cmds)

    # Check for upgraded (rewritten) commands — same dispatch name, different path
    upgraded: list[str] = []
    before_raw = _extract_commands(before)
    after_raw = _extract_commands(after)
    for cmd in before_raw:
        if cmd not in after_raw and cmd not in removed:
            upgraded.append(cmd)

    has_changes = bool(added or removed or upgraded) or (after != before_resolved)

    return {
        "has_changes": has_changes,
        "is_new": False,
        "added": added,
        "removed": removed,
        "upgraded": upgraded,
    }


def init_project(
    target_dir: Path,
    dist_root: Path,
    dry_run: bool = False,
    skip_hooks: bool = False,
) -> dict:
    """Initialize a Pennyfarthing project.

    Creates .pennyfarthing/ and .claude/ directory structures,
    copies pf-* commands and skills, writes settings.local.json,
    and updates .gitignore.

    Args:
        target_dir: Directory to initialize
        dist_root: Path to pennyfarthing-dist source
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success: bool, data?: dict, error?: str}
    """
    # --- Validation ---
    if not target_dir.is_dir():
        return {"success": False, "error": f"Target directory does not exist: {target_dir}"}
    if not dist_root.is_dir():
        return {"success": False, "error": f"Dist root does not exist: {dist_root}"}

    # --- Verify pf CLI (required for hooks) ---
    pf_check = verify_pf_cli()
    if not pf_check["success"]:
        error_msg = pf_check.get("error", "pf CLI not available")
        hint = pf_check.get("install_hint", "")
        if hint:
            error_msg += f"\nFix: {hint}"
        return {"success": False, "error": error_msg}

    # --- Detect dogfooding mode ---
    is_dogfooding = _is_dogfooding_repo(target_dir, dist_root)

    # --- Gather plan ---
    commands_to_copy = _find_pf_commands(dist_root)
    skills_to_copy = _find_pf_skills(dist_root)
    directories = _PENNYFARTHING_DIRS + _CLAUDE_DIRS

    # --- Identify content dirs to copy ---
    content_dirs_to_copy = [name for name in _CONTENT_DIRS if (dist_root / name).is_dir()]

    if dry_run:
        from pf.init.justfile import update_framework_justfile

        justfile_result = update_framework_justfile(target_dir, dist_root, dry_run=True)
        justfile_data = justfile_result.get("data", {}) if justfile_result["success"] else {}

        return {
            "success": True,
            "data": {
                "directories": directories,
                "commands": [c.name for c in commands_to_copy],
                "skills": [s.name for s in skills_to_copy],
                "content_dirs": content_dirs_to_copy,
                "settings": ".claude/settings.local.json",
                "gitignore_entries": _GITIGNORE_ENTRIES,
                "justfile": justfile_data,
                "dogfooding": is_dogfooding,
            },
        }

    # --- Install pf shim at .pennyfarthing/bin/pf ---
    discovery_result = resolve_pf_binary()
    if discovery_result["success"]:
        shim_result = write_shim(str(target_dir), discovery_result)
    else:
        shim_result = {"success": False, "error": discovery_result.get("error", "pf not found")}

    # --- Clean stale npm-era artifacts ---
    _clean_stale_artifacts(target_dir)

    if is_dogfooding:
        # --- Dogfooding mode: symlink instead of copy ---
        # Create only the base directories (not those that will be symlinks)
        symlink_targets = {p.split("/")[0] + "/" + p.split("/")[1] for p in _DOGFOODING_SYMLINKS}
        for d in directories:
            path = target_dir / d
            if d in symlink_targets:
                continue  # Will be created as symlink
            if path.is_symlink():
                # Preserve existing correct symlinks
                continue
            path.mkdir(parents=True, exist_ok=True)

        # Create/repair all dogfooding symlinks
        symlinks_fixed = _ensure_dogfooding_symlinks(target_dir)

        # Skip portrait symlinking — personas dir is already a symlink
        portrait_result = _install_portraits(dist_root)
        portraits_linked = False

    else:
        # --- Consumer mode: flat copies ---

        # --- Create directories ---
        for d in directories:
            path = target_dir / d
            # Remove stale symlinks (npm era) that block directory creation
            if path.is_symlink():
                path.unlink()
            path.mkdir(parents=True, exist_ok=True)

        # --- Copy commands ---
        commands_copied = 0
        for cmd_file in commands_to_copy:
            # Copy to .pennyfarthing/commands/
            shutil.copy2(cmd_file, target_dir / ".pennyfarthing" / "commands" / cmd_file.name)
            # Copy to .claude/commands/
            shutil.copy2(cmd_file, target_dir / ".claude" / "commands" / cmd_file.name)
            commands_copied += 1

        # --- Copy skills ---
        skills_copied = 0
        for skill_dir in skills_to_copy:
            # Copy to .pennyfarthing/skills/
            _copy_tree(skill_dir, target_dir / ".pennyfarthing" / "skills" / skill_dir.name)
            # Copy to .claude/skills/
            _copy_tree(skill_dir, target_dir / ".claude" / "skills" / skill_dir.name)
            skills_copied += 1

        # --- Copy content directories (agents, guides, personas, etc.) ---
        content_dirs_copied = 0
        for dir_name in content_dirs_to_copy:
            dest = target_dir / ".pennyfarthing" / dir_name
            # Remove stale symlinks (npm era) before copying
            if dest.is_symlink():
                dest.unlink()
            _copy_tree(dist_root / dir_name, dest)
            content_dirs_copied += 1
            # Also copy agents to .claude/agents/ for native subagent support
            if dir_name == "agents":
                _copy_tree(dist_root / dir_name, target_dir / ".claude" / "agents")

        # --- Centralize portraits to shared XDG location ---
        portrait_result = _install_portraits(dist_root)
        portraits_linked = _symlink_portraits(target_dir)

        symlinks_fixed = 0

    # --- Install tmux config samples and launcher ---
    tmux_installed = _install_tmux_files(target_dir, dist_root)

    # --- Update framework justfile ---
    from pf.init.justfile import update_framework_justfile

    justfile_result = update_framework_justfile(target_dir, dist_root)
    justfile_data = justfile_result.get("data", {}) if justfile_result["success"] else {}

    # --- Write or upgrade settings.local.json ---
    settings_path = target_dir / ".claude" / "settings.local.json"
    settings_written = False
    hooks_upgraded = False
    hooks_skipped = False
    frontmatter_hooks = collect_all_frontmatter_hooks(dist_root)
    if not settings_path.exists():
        merged = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter_hooks)
        resolve_hook_paths(merged, target_dir)
        settings_path.write_text(json.dumps(merged, indent=2) + "\n")
        settings_written = True
    elif skip_hooks:
        hooks_skipped = True
    else:
        hooks_upgraded = _upgrade_hooks(settings_path)
        # Merge frontmatter hooks into existing settings
        data = json.loads(settings_path.read_text())
        merged = merge_with_infrastructure(data, frontmatter_hooks)
        resolve_hook_paths(merged, target_dir)
        if merged != data:
            settings_path.write_text(json.dumps(merged, indent=2) + "\n")
            hooks_upgraded = True

    # --- Clean parked Cyclist hooks from settings and config ---
    if not hooks_skipped:
        _clean_parked_hooks(settings_path, target_dir)

    # --- Write init manifest ---
    if is_dogfooding:
        _write_manifest(target_dir, 0, 0)
    else:
        _write_manifest(target_dir, commands_copied, skills_copied)

    # --- Update .gitignore ---
    _update_gitignore(target_dir)

    # --- Run auto-setup workflow ---
    from pf.init import setup

    setup_result = setup.run_setup(
        target_dir=target_dir,
        dist_root=dist_root,
        skip_prompts=True,
        is_dogfooding=is_dogfooding,
    )

    if is_dogfooding:
        return {
            "success": True,
            "data": {
                "dogfooding": True,
                "symlinks_fixed": symlinks_fixed,
                "directories_created": len(directories),
                "settings_written": settings_written,
                "hooks_upgraded": hooks_upgraded,
                "gitignore_updated": True,
                "tmux_installed": tmux_installed,
                "shim_installed": shim_result.get("success", False),
                "justfile": justfile_data,
                "setup": setup_result.get("data", {}),
                "portraits": portrait_result,
            },
        }

    return {
        "success": True,
        "data": {
            "dogfooding": False,
            "commands_copied": commands_copied,
            "skills_copied": skills_copied,
            "content_dirs_copied": content_dirs_copied,
            "directories_created": len(directories),
            "settings_written": settings_written,
            "hooks_upgraded": hooks_upgraded,
            "gitignore_updated": True,
            "tmux_installed": tmux_installed,
            "shim_installed": shim_result.get("success", False),
            "justfile": justfile_data,
            "setup": setup_result.get("data", {}),
            "portraits": portrait_result,
            "portraits_linked": portraits_linked,
        },
    }


def _find_pf_commands(dist_root: Path) -> list[Path]:
    """Find all pf-*.md command files in dist_root/commands/."""
    commands_dir = dist_root / "commands"
    if not commands_dir.is_dir():
        return []
    return sorted(f for f in commands_dir.glob("pf-*.md") if f.is_file())


def _find_pf_skills(dist_root: Path) -> list[Path]:
    """Find all pf-* skill directories in dist_root/skills/."""
    skills_dir = dist_root / "skills"
    if not skills_dir.is_dir():
        return []
    return sorted(d for d in skills_dir.iterdir() if d.is_dir() and d.name.startswith("pf-"))


def _write_manifest(target_dir: Path, commands_copied: int, skills_copied: int) -> None:
    """Write init manifest for upgrade tracking."""
    from pf import __version__

    manifest = {
        "pf_version": __version__,
        "initialized_at": datetime.now(UTC).isoformat(),
        "commands_copied": commands_copied,
        "skills_copied": skills_copied,
    }
    manifest_path = target_dir / ".pennyfarthing" / "init-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def _copy_tree(src: Path, dst: Path) -> None:
    """Copy a directory tree, merging into existing directories.

    Overwrites pf-managed files but preserves user-created files
    that don't exist in the source tree.
    """
    if not dst.exists():
        shutil.copytree(src, dst)
        return
    for item in src.iterdir():
        dest_item = dst / item.name
        if item.is_dir():
            _copy_tree(item, dest_item)
        else:
            shutil.copy2(item, dest_item)




def _install_tmux_files(target_dir: Path, dist_root: Path) -> list[str]:
    """Install tmux config and session launcher to the project root.

    Creates symlinks for tmux.conf.* pointing to templates, and installs
    the start-session launcher. Symlinks are always recreated; the launcher
    is always overwritten (framework code, not user-customizable).

    Returns:
        List of installed file names.
    """
    templates_dir = dist_root / "templates"
    installed: list[str] = []

    # Symlink tmux config files to templates
    tmux_configs = {
        "tmux.conf.vert.template": "tmux.conf.vert",
        "tmux.conf.right.template": "tmux.conf.right",
        "tmux.conf.left.template": "tmux.conf.left",
    }

    for template_name, dest_name in tmux_configs.items():
        src = templates_dir / template_name
        dest = target_dir / dest_name
        if not src.is_file():
            continue
        # Remove existing file/symlink before creating new symlink
        if dest.exists() or dest.is_symlink():
            dest.unlink()
        try:
            # Try relative symlink (works when dist_root is under target_dir)
            dest.symlink_to(src.relative_to(target_dir))
        except ValueError:
            # dist_root is outside target_dir (consumer mode) — copy instead
            shutil.copy2(src, dest)
        installed.append(dest_name)

    # Copy start-session launcher (always overwrite — framework code)
    launcher_src = templates_dir / "start-session.template"
    launcher_dest = target_dir / "start-session"
    if launcher_src.is_file():
        if launcher_dest.is_symlink() or (
            launcher_dest.exists()
            and launcher_dest.resolve() == launcher_src.resolve()
        ):
            launcher_dest.unlink()
        shutil.copy2(launcher_src, launcher_dest)
        launcher_dest.chmod(launcher_dest.stat().st_mode | 0o111)
        installed.append("start-session")

    # Clean up legacy files from previous naming
    for legacy in ("tmux-dev", "tmux.conf.vert-sample", "tmux.conf.right-sample", "tmux.conf.left-sample"):
        legacy_path = target_dir / legacy
        if legacy_path.exists() or legacy_path.is_symlink():
            legacy_path.unlink()

    return installed


def _is_old_pf_hook_command(cmd: str) -> bool:
    """Check if a command is an old-style individual pf hook (not dispatcher)."""
    if "pf hooks dispatch" in cmd:
        return False
    if "pf hooks " in cmd:
        return True
    if "pf.sh" in cmd:
        return True
    return False


def _upgrade_hooks(settings_path: Path) -> bool:
    """Consolidate per-hook entries into single dispatcher entries.

    Migrates from old-style individual hook commands (``pf hooks <name>``,
    ``pf.sh`` references) to a single ``pf hooks dispatch <Event>`` entry
    per event type.  Non-pf hooks (project-specific commands) are preserved.

    Returns:
        True if any changes were made.
    """
    try:
        data = json.loads(settings_path.read_text())
    except (json.JSONDecodeError, OSError):
        return False

    changed = False
    hooks = data.get("hooks", {})

    for hook_type, canonical_entries in INFRASTRUCTURE_HOOKS.items():
        existing = hooks.get(hook_type, [])
        if not isinstance(existing, list):
            existing = []

        # Check if dispatcher already present
        has_dispatcher = any(
            "pf hooks dispatch" in h.get("command", "")
            for entry in existing
            for h in entry.get("hooks", [])
            if isinstance(h, dict)
        )

        if has_dispatcher:
            # Remove any remaining old-style pf hook entries
            cleaned = []
            for entry in existing:
                hook_list = entry.get("hooks", [])
                is_old_pf = any(
                    _is_old_pf_hook_command(h.get("command", ""))
                    for h in hook_list
                    if isinstance(h, dict)
                )
                if is_old_pf:
                    changed = True
                else:
                    cleaned.append(entry)
            hooks[hook_type] = cleaned
        else:
            # No dispatcher yet — consolidate
            project_hooks = []
            had_old_hooks = False
            for entry in existing:
                hook_list = entry.get("hooks", [])
                is_old_pf = any(
                    _is_old_pf_hook_command(h.get("command", ""))
                    for h in hook_list
                    if isinstance(h, dict)
                )
                if is_old_pf:
                    had_old_hooks = True
                else:
                    project_hooks.append(entry)

            # Add dispatcher entry + preserved project hooks
            hooks[hook_type] = canonical_entries + project_hooks
            if had_old_hooks or not existing:
                changed = True

    data["hooks"] = hooks

    # Rewrite bare pf in statusLine
    if isinstance(data.get("statusLine"), dict):
        status_cmd = data["statusLine"].get("command", "")
        if status_cmd.startswith("pf hooks") and not status_cmd.startswith(".pennyfarthing/"):
            data["statusLine"]["command"] = ".pennyfarthing/bin/" + status_cmd
            changed = True

    # Ensure statusLine exists; upgrade pf.sh references
    canonical_status = {"type": "command", "command": ".pennyfarthing/bin/pf hooks statusline"}
    if "statusLine" not in data:
        data["statusLine"] = canonical_status
        changed = True
    elif isinstance(data["statusLine"], dict) and "pf.sh" in data["statusLine"].get("command", ""):
        data["statusLine"] = canonical_status
        changed = True

    if changed:
        settings_path.write_text(json.dumps(data, indent=2) + "\n")

    return changed


# Hooks that are parked (Cyclist features, not active).
# These are stripped from settings.local.json and config.local.yaml
# during init/upgrade so existing installs don't fire dead hooks.
_PARKED_HOOKS: set[str] = {"bell-mode", "reflector-check"}


def _clean_parked_hooks(settings_path: Path, target_dir: Path) -> bool:
    """Remove parked hook entries from settings.local.json and config.

    Strips individual hook entries for Cyclist features (bell-mode,
    reflector-check) that are no longer active. Also removes bell_mode
    from config.local.yaml workflow section.

    Returns:
        True if any changes were made.
    """
    changed = False

    # --- Strip from settings.local.json ---
    try:
        data = json.loads(settings_path.read_text())
    except (json.JSONDecodeError, OSError):
        data = None

    if data:
        hooks = data.get("hooks", {})
        for event_type in list(hooks.keys()):
            entries = hooks[event_type]
            if not isinstance(entries, list):
                continue
            cleaned = []
            for entry in entries:
                hook_list = entry.get("hooks", [])
                is_parked = any(
                    any(parked in h.get("command", "") for parked in _PARKED_HOOKS)
                    for h in hook_list
                    if isinstance(h, dict)
                )
                if is_parked:
                    changed = True
                else:
                    cleaned.append(entry)
            hooks[event_type] = cleaned
        if changed:
            data["hooks"] = hooks
            settings_path.write_text(json.dumps(data, indent=2) + "\n")

    # --- Strip bell_mode from config.local.yaml ---
    config_path = target_dir / ".pennyfarthing" / "config.local.yaml"
    if config_path.is_file():
        try:
            import yaml

            config = yaml.safe_load(config_path.read_text()) or {}
            workflow = config.get("workflow", {})
            if isinstance(workflow, dict) and "bell_mode" in workflow:
                del workflow["bell_mode"]
                with open(config_path, "w") as f:
                    yaml.dump(config, f, default_flow_style=False, sort_keys=False)
                changed = True
        except Exception:
            pass

    return changed


def _clean_stale_artifacts(target_dir: Path) -> None:
    """Remove stale npm-era artifacts from .pennyfarthing/.

    Covers three generations of install artifacts:

    npm-era (pre-12.x):
    - pyproject.toml, uv.lock, .venv/ — uv-based in-project hook execution
    - .installed-version — old version stamp
    - pennyfarthing_scripts.egg-info/ — editable install remnant
    - pf (symlink) — symlinked to ../../node_modules/pennyfarthing/pennyfarthing-dist/pf;
      replaced by .pennyfarthing/bin/pf shim
    - manifest.json — old npm install manifest (replaced by init-manifest.json)
    - settings.local.json — settings were incorrectly placed here; canonical
      location is .claude/settings.local.json

    node_modules-era (any remaining @pennyfarthing packages):
    - node_modules/@pennyfarthing/{core,shared,cyclist}/ — npm packages
    - node_modules/pennyfarthing/ — older single-package layout
    - node_modules/.pnpm/@pennyfarthing* — pnpm store cache entries
    - node_modules/.bin/pennyfarthing — broken symlink to old npm package
    """
    pf_dir = target_dir / ".pennyfarthing"
    stale_files = [
        "pyproject.toml",
        "uv.lock",
        ".installed-version",
        "manifest.json",
        "settings.local.json",
        "preferences.yaml",
    ]
    for name in stale_files:
        path = pf_dir / name
        if path.is_file() or path.is_symlink():
            # If .claude/settings.local.json symlinks here, break it first
            if name == "settings.local.json":
                claude_settings = target_dir / ".claude" / "settings.local.json"
                if claude_settings.is_symlink():
                    claude_settings.unlink()
            path.unlink()

    # Remove the old pf symlink (npm-era entry point, replaced by bin/pf shim)
    pf_symlink = pf_dir / "pf"
    if pf_symlink.is_symlink():
        pf_symlink.unlink()

    stale_dirs = [".venv", "pennyfarthing_scripts.egg-info"]
    for name in stale_dirs:
        path = pf_dir / name
        if path.is_dir():
            shutil.rmtree(path)

    # Remove stale node_modules/@pennyfarthing packages and pnpm cache if present
    nm = target_dir / "node_modules"
    if nm.is_dir():
        for pkg in [
            "@pennyfarthing/core",
            "@pennyfarthing/shared",
            "@pennyfarthing/cyclist",
            "pennyfarthing",
        ]:
            pkg_path = nm / pkg
            if pkg_path.is_symlink():
                pkg_path.unlink()
            elif pkg_path.is_dir():
                shutil.rmtree(pkg_path)
        # Clean @pennyfarthing entries from pnpm store cache
        pnpm_dir = nm / ".pnpm"
        if pnpm_dir.is_dir():
            for entry in pnpm_dir.iterdir():
                if entry.name.startswith("@pennyfarthing"):
                    if entry.is_dir():
                        shutil.rmtree(entry)
                    elif entry.is_symlink():
                        entry.unlink()
        # Remove broken .bin symlinks pointing to @pennyfarthing
        bin_dir = nm / ".bin"
        if bin_dir.is_dir():
            for link in bin_dir.iterdir():
                if link.is_symlink() and "pennyfarthing" in str(link.name):
                    if not link.resolve().exists():
                        link.unlink()

    # Remove stale wheelhub/bikerack-era runtime files (renamed to frame/tui)
    for name in (".bikerack-port", "bikerack-pid", "bikerack-tui-pid", ".wheelhub-pid"):
        path = target_dir / name
        if path.is_file():
            path.unlink()
    # Remove old wheelhub.mjs Node.js server bundle if present
    old_server = pf_dir / "server" / "wheelhub.mjs"
    if old_server.is_file():
        old_server.unlink()
    # Remove old .gitignore entries for bikerack/wheelhub
    _clean_old_gitignore_entries(target_dir)

    # Remove @pennyfarthing/* deps from package.json if present
    _clean_package_json(target_dir)


def _clean_package_json(target_dir: Path) -> bool:
    """Remove stale @pennyfarthing/* dependencies from package.json.

    Returns True if changes were made.
    """
    pkg_json = target_dir / "package.json"
    if not pkg_json.is_file():
        return False

    try:
        data = json.loads(pkg_json.read_text())
    except (json.JSONDecodeError, OSError):
        return False

    changed = False
    for section in ("dependencies", "devDependencies"):
        if section not in data or not isinstance(data[section], dict):
            continue
        stale_keys = [k for k in data[section] if k.startswith("@pennyfarthing/")]
        for key in stale_keys:
            del data[section][key]
            changed = True

    if changed:
        pkg_json.write_text(json.dumps(data, indent=2) + "\n")

    return changed


def _clean_old_gitignore_entries(target_dir: Path) -> None:
    """Remove stale wheelhub/bikerack gitignore entries from consumer repos."""
    gitignore_path = target_dir / ".gitignore"
    if not gitignore_path.is_file():
        return
    content = gitignore_path.read_text()
    stale = [".wheelhub-*", ".bikerack-*", "bikerack-*", "bikerack-pid", "bikerack-tui-pid", ".bikerack-port"]
    lines = content.splitlines(keepends=True)
    filtered = [line for line in lines if line.strip() not in stale]
    if len(filtered) != len(lines):
        gitignore_path.write_text("".join(filtered))


def _get_portraits_data_dir() -> Path:
    """Return the XDG-compliant shared portraits directory.

    Uses $XDG_DATA_HOME/pennyfarthing/portraits/ (defaults to
    ~/.local/share/pennyfarthing/portraits/).
    """
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        base = Path(xdg)
    else:
        base = Path.home() / ".local" / "share"
    return base / "pennyfarthing" / "portraits"


def _is_lfs_pointer(file_path: Path) -> bool:
    """Check if a file is a Git LFS pointer (not a real image)."""
    try:
        if file_path.stat().st_size > 200:
            return False
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        return content.startswith("version https://git-lfs")
    except (OSError, UnicodeDecodeError):
        return False


def _find_portraits_source(dist_root: Path) -> Path | None:
    """Find a source of real portrait images (not LFS pointers).

    Checks dist_root first, then falls back to the pip-installed _dist
    package which contains real images from the wheel build.

    Returns:
        Path to a portraits directory with real images, or None.
    """
    # Check dist_root portraits
    dist_portraits = dist_root / "personas" / "portraits"
    if dist_portraits.is_dir():
        # Spot-check one PNG to see if it's real or an LFS pointer
        sample = next(dist_portraits.rglob("*.png"), None)
        if sample and not _is_lfs_pointer(sample):
            return dist_portraits

    # Fall back to pip-installed _dist (always has real images from wheel)
    try:
        from pf._dist import get_root, is_populated

        if is_populated():
            pip_portraits = get_root() / "personas" / "portraits"
            if pip_portraits.is_dir():
                sample = next(pip_portraits.rglob("*.png"), None)
                if sample and not _is_lfs_pointer(sample):
                    return pip_portraits
    except (ImportError, ModuleNotFoundError):
        pass

    return None


def _install_portraits(dist_root: Path) -> dict:
    """Install portraits to the shared XDG data directory.

    Copies portrait images to ~/.local/share/pennyfarthing/portraits/
    once, then consumer projects symlink to this shared cache. Skips
    re-copy if the manifest version matches the current pf version.

    Returns:
        Result dict with keys: installed (bool), path (str),
        source (str), skipped_reason (str|None).
    """
    from pf import __version__

    target = _get_portraits_data_dir()
    manifest_path = target / ".manifest.json"

    # Check if already installed at current version
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text())
            if manifest.get("pf_version") == __version__:
                return {
                    "installed": False,
                    "path": str(target),
                    "source": "cached",
                    "skipped_reason": f"already at {__version__}",
                }
        except (json.JSONDecodeError, OSError):
            pass

    # Find a source with real images
    source = _find_portraits_source(dist_root)
    if source is None:
        return {
            "installed": False,
            "path": str(target),
            "source": "none",
            "skipped_reason": "no portrait source with real images found (LFS pointers only)",
        }

    # Copy portraits to shared location
    target.mkdir(parents=True, exist_ok=True)
    _copy_tree(source, target)

    # Write version manifest
    manifest_path.write_text(
        json.dumps(
            {
                "pf_version": __version__,
                "installed_at": datetime.now(UTC).isoformat(),
                "source": str(source),
            },
            indent=2,
        )
        + "\n"
    )

    return {
        "installed": True,
        "path": str(target),
        "source": str(source),
        "skipped_reason": None,
    }


def _symlink_portraits(target_dir: Path) -> bool:
    """Replace .pennyfarthing/personas/portraits/ with a symlink to the shared cache.

    Returns True if symlink was created or already exists correctly.
    """
    shared_portraits = _get_portraits_data_dir()

    if not shared_portraits.is_dir():
        return False

    personas_dir = target_dir / ".pennyfarthing" / "personas"
    if not personas_dir.is_dir():
        return False

    portraits_link = personas_dir / "portraits"

    # Already a correct symlink
    if portraits_link.is_symlink():
        if portraits_link.resolve() == shared_portraits.resolve():
            return True
        portraits_link.unlink()

    # Remove existing directory (copied portraits from previous init)
    if portraits_link.is_dir():
        shutil.rmtree(portraits_link)

    # Create symlink
    portraits_link.symlink_to(shared_portraits)
    return True


def _update_gitignore(target_dir: Path) -> None:
    """Add pennyfarthing entries to .gitignore, avoiding duplicates.

    Normalizes patterns so that e.g. `.session/*` is recognized as
    covering `.session/` to avoid redundant entries.
    """
    gitignore_path = target_dir / ".gitignore"

    existing_lines: set[str] = set()
    existing_content = ""
    if gitignore_path.is_file():
        existing_content = gitignore_path.read_text()
        existing_lines = {line.strip() for line in existing_content.splitlines()}

    # Build a set of normalized paths for overlap detection.
    # ".session/*" and ".session/" both cover the same directory.
    normalized_existing: set[str] = set()
    for line in existing_lines:
        normalized_existing.add(line)
        # ".session/*" covers ".session/"
        if line.endswith("/*"):
            normalized_existing.add(line[:-1])  # ".session/*" -> ".session/"
        # ".session/" covers ".session/*"
        if line.endswith("/") and not line.endswith("/*"):
            normalized_existing.add(line + "*")  # ".session/" -> ".session/*"

    new_entries = [e for e in _GITIGNORE_ENTRIES if e.strip() not in normalized_existing]

    if new_entries:
        # Ensure trailing newline before appending
        if existing_content and not existing_content.endswith("\n"):
            existing_content += "\n"
        existing_content += "\n".join(new_entries) + "\n"
        gitignore_path.write_text(existing_content)
