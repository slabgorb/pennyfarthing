"""Core upgrade logic — detect npm-based install and migrate to Python-based.

Story 126-7: pf upgrade command.

Detects npm-based Pennyfarthing installations (node_modules/@pennyfarthing)
and migrates to the Python-based structure. Preserves user custom hooks,
commands, and skills. Migrates config files. Removes npm artifacts.
"""

from __future__ import annotations

import json
from pathlib import Path

from pf.common.hooks import INFRASTRUCTURE_HOOKS

# Alias for local usage — single source of truth is pf.common.hooks.
_PYTHON_HOOKS: dict = INFRASTRUCTURE_HOOKS


def _is_pf_managed_command(command: str) -> bool:
    """Check if a hook command is Pennyfarthing-managed (not user-custom)."""
    cmd = command.strip()
    return cmd.startswith("pf hooks") or cmd.startswith("npx pennyfarthing")


def detect_npm_install(project_root: Path) -> dict:
    """Detect if project has an npm-based Pennyfarthing installation.

    Checks for node_modules/@pennyfarthing/core and related npm artifacts.

    Args:
        project_root: Project root path

    Returns:
        Result dict: {success, is_npm: bool, npm_paths: list[str], error?}
    """
    npm_pf_dir = project_root / "node_modules" / "@pennyfarthing"
    npm_paths: list[str] = []

    if npm_pf_dir.exists():
        npm_paths.append(str(npm_pf_dir.relative_to(project_root)))
        for p in npm_pf_dir.rglob("*"):
            if p.is_dir():
                npm_paths.append(str(p.relative_to(project_root)))

    return {"success": True, "is_npm": len(npm_paths) > 0, "npm_paths": npm_paths}


def plan_migration(project_root: Path) -> dict:
    """Plan the migration from npm to Python-based install.

    Args:
        project_root: Project root path

    Returns:
        Result dict: {success, plan: dict, error?}
    """
    detection = detect_npm_install(project_root)
    if not detection["is_npm"]:
        return {"success": True, "plan": {"needed": False}}
    return {
        "success": True,
        "plan": {
            "needed": True,
            "steps": [
                "migrate_directory_structure",
                "preserve_custom_hooks",
                "migrate_settings",
                "migrate_config_files",
            ],
        },
    }


def migrate_directory_structure(project_root: Path, dry_run: bool = False) -> dict:
    """Migrate directory structure from npm layout to Python layout.

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, changes: list[str], error?}
    """
    dirs_to_ensure = [
        ".pennyfarthing",
        ".pennyfarthing/scripts",
        ".pennyfarthing/scripts/lib",
    ]
    changes: list[str] = []
    for d in dirs_to_ensure:
        target = project_root / d
        if not target.exists():
            changes.append(f"create {d}")
            if not dry_run:
                target.mkdir(parents=True, exist_ok=True)

    if not changes:
        changes.append("directory structure already up to date")

    return {"success": True, "changes": changes}


def preserve_custom_hooks(project_root: Path) -> dict:
    """Identify and preserve user custom hooks (non-pf-* prefixed).

    Scans settings.local.json for hooks that are not Pennyfarthing-managed
    (don't start with 'pf hooks' or 'npx pennyfarthing') and returns them
    for preservation.

    Args:
        project_root: Project root path

    Returns:
        Result dict: {success, custom_hooks: list[dict], error?}
    """
    settings_path = project_root / ".claude" / "settings.local.json"
    if not settings_path.exists():
        return {"success": True, "custom_hooks": []}

    data = json.loads(settings_path.read_text())
    hooks = data.get("hooks", {})
    custom_hooks: list[dict] = []

    for _event, hook_list in hooks.items():
        for hook_entry in hook_list:
            entry_hooks = hook_entry.get("hooks", [])
            command_hooks = [h for h in entry_hooks if h.get("type") == "command"]
            if not command_hooks:
                custom_hooks.append(hook_entry)
                continue
            all_managed = all(
                _is_pf_managed_command(h.get("command", ""))
                for h in command_hooks
            )
            if not all_managed:
                custom_hooks.append(hook_entry)

    return {"success": True, "custom_hooks": custom_hooks}


def migrate_settings(project_root: Path, dry_run: bool = False) -> dict:
    """Migrate settings.local.json — remove old npm hooks, add new Python hooks.

    Preserves user custom hooks (non-pf-* prefixed). Replaces npm-era
    hook commands with Python CLI equivalents.

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, hooks_removed: list, hooks_added: list, hooks_preserved: list, error?}
    """
    settings_path = project_root / ".claude" / "settings.local.json"

    if not settings_path.exists():
        if not dry_run:
            settings_path.parent.mkdir(parents=True, exist_ok=True)
            settings_path.write_text(json.dumps({"hooks": _PYTHON_HOOKS}, indent=2) + "\n")
        return {
            "success": True,
            "hooks_removed": [],
            "hooks_added": list(_PYTHON_HOOKS.keys()),
            "hooks_preserved": [],
        }

    data = json.loads(settings_path.read_text())
    old_hooks = data.get("hooks", {})

    hooks_removed: list[dict] = []
    hooks_preserved: list[dict] = []
    preserved_by_event: dict[str, list] = {}

    for event, hook_list in old_hooks.items():
        for hook_entry in hook_list:
            entry_hooks = hook_entry.get("hooks", [])
            command_hooks = [h for h in entry_hooks if h.get("type") == "command"]
            if not command_hooks:
                hooks_preserved.append(hook_entry)
                preserved_by_event.setdefault(event, []).append(hook_entry)
                continue
            all_managed = all(
                _is_pf_managed_command(h.get("command", ""))
                for h in command_hooks
            )
            if all_managed:
                hooks_removed.append(hook_entry)
            else:
                hooks_preserved.append(hook_entry)
                preserved_by_event.setdefault(event, []).append(hook_entry)

    new_hooks: dict = {}
    for event, entries in _PYTHON_HOOKS.items():
        new_hooks[event] = list(entries)
    for event, entries in preserved_by_event.items():
        new_hooks.setdefault(event, []).extend(entries)

    if not dry_run:
        data["hooks"] = new_hooks
        settings_path.write_text(json.dumps(data, indent=2) + "\n")

    return {
        "success": True,
        "hooks_removed": hooks_removed,
        "hooks_added": list(_PYTHON_HOOKS.keys()),
        "hooks_preserved": hooks_preserved,
    }


def migrate_config_files(project_root: Path, dry_run: bool = False) -> dict:
    """Migrate config files (preferences.yaml -> config.local.yaml).

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, migrated: list[str], error?}
    """
    import yaml

    pf_dir = project_root / ".pennyfarthing"
    config_path = pf_dir / "config.local.yaml"
    prefs_path = project_root / ".claude" / "pennyfarthing" / "preferences.yaml"

    if not prefs_path.exists():
        return {"success": True, "migrated": []}

    if dry_run:
        return {"success": True, "migrated": ["preferences.yaml (planned)"]}

    config: dict = {}
    if config_path.exists():
        config = yaml.safe_load(config_path.read_text()) or {}

    prefs = yaml.safe_load(prefs_path.read_text()) or {}
    for key, value in prefs.items():
        if key not in config:
            config[key] = value

    pf_dir.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    return {"success": True, "migrated": ["preferences.yaml"]}


def generate_report(results: dict) -> str:
    """Generate a human-readable report of what changed during upgrade.

    Args:
        results: Aggregated results from all migration steps

    Returns:
        Formatted report string
    """
    lines = ["# Pennyfarthing Upgrade Report", ""]

    detection = results.get("detection", {})
    if detection.get("is_npm"):
        npm_paths = detection.get("npm_paths", [])
        lines.append(f"**npm installation detected** ({len(npm_paths)} artifact paths)")
    else:
        lines.append("No npm installation detected.")
    lines.append("")

    directory = results.get("directory", {})
    changes = directory.get("changes", [])
    if changes:
        lines.append(f"**Directory changes:** {len(changes)}")
        for c in changes:
            lines.append(f"  - {c}")
        lines.append("")

    hooks_data = results.get("hooks", {})
    removed = hooks_data.get("hooks_removed", 0)
    added = hooks_data.get("hooks_added", 0)
    preserved = hooks_data.get("hooks_preserved", 0)
    if isinstance(removed, list):
        removed = len(removed)
    if isinstance(added, list):
        added = len(added)
    if isinstance(preserved, list):
        preserved = len(preserved)

    if removed or added or preserved:
        lines.append("**Hooks:**")
        if removed:
            lines.append(f"  - Removed: {removed}")
        if added:
            lines.append(f"  - Added: {added}")
        if preserved:
            lines.append(f"  - Preserved: {preserved} custom hooks")
        lines.append("")

    config = results.get("config", {})
    migrated = config.get("migrated", [])
    if migrated:
        lines.append("**Config migration:**")
        for m in migrated:
            lines.append(f"  - {m}")
        lines.append("")

    return "\n".join(lines)


def run_upgrade(project_root: Path, dry_run: bool = False) -> dict:
    """Run the full upgrade from npm-based to Python-based install.

    Orchestrates all migration steps:
    1. Detect npm install
    2. Migrate directory structure
    3. Preserve custom hooks
    4. Migrate settings
    5. Migrate config files
    6. Generate report

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, report: str, changes: dict, error?}
    """
    detection = detect_npm_install(project_root)
    if not detection["success"]:
        return detection

    if not detection["is_npm"]:
        report = generate_report({
            "detection": detection,
            "directory": {"changes": []},
            "hooks": {},
            "config": {"migrated": []},
        })
        return {"success": True, "report": report, "changes": {}}

    dir_result = migrate_directory_structure(project_root, dry_run=dry_run)
    preserve_custom_hooks(project_root)
    settings_result = migrate_settings(project_root, dry_run=dry_run)
    config_result = migrate_config_files(project_root, dry_run=dry_run)

    results = {
        "detection": detection,
        "directory": dir_result,
        "hooks": settings_result,
        "config": config_result,
    }
    report = generate_report(results)

    return {"success": True, "report": report, "changes": results}
