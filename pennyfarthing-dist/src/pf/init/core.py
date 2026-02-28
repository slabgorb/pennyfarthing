"""Core init logic — project initialization.

Story 126-2: Rewrite pf init in Python.

Creates .pennyfarthing/ and .claude/ directory structures,
copies pf-* commands, skills, and content directories (agents, guides,
personas, etc.), writes settings.local.json, and updates .gitignore.
Idempotent and deterministic.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from pf.common.discovery import resolve_pf_binary, write_shim
from pf.common.hooks import INFRASTRUCTURE_HOOKS
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


def init_project(
    target_dir: Path,
    dist_root: Path,
    dry_run: bool = False,
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

    # --- Gather plan ---
    commands_to_copy = _find_pf_commands(dist_root)
    skills_to_copy = _find_pf_skills(dist_root)
    directories = _PENNYFARTHING_DIRS + _CLAUDE_DIRS

    # --- Identify content dirs to copy ---
    content_dirs_to_copy = [
        name for name in _CONTENT_DIRS if (dist_root / name).is_dir()
    ]

    if dry_run:
        from pf.init.justfile import update_framework_justfile

        justfile_result = update_framework_justfile(
            target_dir, dist_root, dry_run=True
        )
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
    frontmatter_hooks = collect_all_frontmatter_hooks(dist_root)
    if not settings_path.exists():
        merged = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter_hooks)
        settings_path.write_text(json.dumps(merged, indent=2) + "\n")
        settings_written = True
    else:
        hooks_upgraded = _upgrade_hooks(settings_path)
        # Merge frontmatter hooks into existing settings
        data = json.loads(settings_path.read_text())
        merged = merge_with_infrastructure(data, frontmatter_hooks)
        if merged != data:
            settings_path.write_text(json.dumps(merged, indent=2) + "\n")
            hooks_upgraded = True

    # --- Write init manifest ---
    _write_manifest(target_dir, commands_copied, skills_copied)

    # --- Update .gitignore ---
    _update_gitignore(target_dir)

    # --- Run auto-setup workflow ---
    from pf.init import setup

    setup_result = setup.run_setup(
        target_dir=target_dir, dist_root=dist_root, skip_prompts=True, dry_run=True
    )

    return {
        "success": True,
        "data": {
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
    """Install tmux config samples and launcher to the project root.

    Copies tmux.conf.template variants as *-sample files and installs
    the tmux-dev launcher. Skips files that already exist (user may
    have customized them).

    Returns:
        List of installed file names.
    """
    templates_dir = dist_root / "templates"
    installed: list[str] = []

    # Map template files to their installed names
    tmux_files = {
        "tmux.conf.vert.template": "tmux.conf.vert-sample",
        "tmux.conf.right.template": "tmux.conf.right-sample",
        "tmux.conf.left.template": "tmux.conf.left-sample",
        "tmux-dev.template": "tmux-dev",
    }

    for template_name, dest_name in tmux_files.items():
        src = templates_dir / template_name
        dest = target_dir / dest_name
        if not src.is_file():
            continue
        if dest.exists():
            continue  # Don't overwrite user customizations
        shutil.copy2(src, dest)
        # Make tmux-dev executable
        if dest_name == "tmux-dev":
            dest.chmod(dest.stat().st_mode | 0o111)
        installed.append(dest_name)

    return installed


def _upgrade_hooks(settings_path: Path) -> bool:
    """Remove deprecated pf.sh hook entries and ensure canonical hooks exist.

    Hooks referencing `.pennyfarthing/scripts/core/pf.sh` are deprecated.
    This function removes them and ensures the canonical `pf hooks` entries
    from INFRASTRUCTURE_HOOKS are present. Also upgrades statusLine.

    Returns:
        True if any changes were made.
    """
    try:
        data = json.loads(settings_path.read_text())
    except (json.JSONDecodeError, OSError):
        return False

    changed = False
    hooks = data.get("hooks", {})

    # Remove hook entries referencing pf.sh (deprecated)
    for hook_type in list(hooks.keys()):
        entries = hooks[hook_type]
        if not isinstance(entries, list):
            continue
        cleaned = []
        for entry in entries:
            hook_list = entry.get("hooks", [])
            has_deprecated = any(
                "pf.sh" in h.get("command", "")
                for h in hook_list
                if isinstance(h, dict)
            )
            if has_deprecated:
                changed = True
            else:
                cleaned.append(entry)
        hooks[hook_type] = cleaned

    # Rewrite bare "pf hooks X" → ".pennyfarthing/bin/pf hooks X"
    for hook_type in list(hooks.keys()):
        entries = hooks[hook_type]
        if not isinstance(entries, list):
            continue
        for entry in entries:
            for hook in entry.get("hooks", []):
                if not isinstance(hook, dict):
                    continue
                cmd = hook.get("command", "")
                if cmd.startswith("pf hooks ") and not cmd.startswith(".pennyfarthing/"):
                    hook["command"] = ".pennyfarthing/bin/" + cmd
                    changed = True

    # Ensure canonical hooks exist
    for hook_type, canonical_entries in INFRASTRUCTURE_HOOKS.items():
        existing = hooks.get(hook_type, [])
        for canonical in canonical_entries:
            canonical_cmd = canonical["hooks"][0]["command"]
            canonical_matcher = canonical.get("matcher")
            already_present = any(
                (entry.get("matcher") or "") == (canonical_matcher or "")
                and any(
                    h.get("command") == canonical_cmd
                    for h in entry.get("hooks", [])
                    if isinstance(h, dict)
                )
                for entry in existing
            )
            if not already_present:
                existing.append(canonical)
                changed = True
        hooks[hook_type] = existing

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


def _clean_stale_artifacts(target_dir: Path) -> None:
    """Remove stale npm-era artifacts from .pennyfarthing/.

    The old npm install created a pyproject.toml, uv.lock, and .venv
    inside .pennyfarthing/ for uv-based hook execution. Now that pf is
    installed globally via pipx, these are stale and cause conflicts
    (e.g. uv tries to build from the empty local project instead of
    using the global pf).
    """
    pf_dir = target_dir / ".pennyfarthing"
    stale_files = ["pyproject.toml", "uv.lock", ".installed-version"]
    for name in stale_files:
        path = pf_dir / name
        if path.is_file():
            path.unlink()

    stale_dirs = [".venv", "pennyfarthing_scripts.egg-info"]
    for name in stale_dirs:
        path = pf_dir / name
        if path.is_dir():
            shutil.rmtree(path)


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

    new_entries = [
        e for e in _GITIGNORE_ENTRIES
        if e.strip() not in normalized_existing
    ]

    if new_entries:
        # Ensure trailing newline before appending
        if existing_content and not existing_content.endswith("\n"):
            existing_content += "\n"
        existing_content += "\n".join(new_entries) + "\n"
        gitignore_path.write_text(existing_content)
