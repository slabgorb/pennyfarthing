"""Core upgrade logic — detect npm-based install and migrate to Python-based.

Story 126-7: pf upgrade command.

Detects npm-based Pennyfarthing installations (node_modules/@pennyfarthing)
and migrates to the Python-based structure. Preserves user custom hooks,
commands, and skills. Migrates config files. Removes npm artifacts.
"""

from __future__ import annotations

from pathlib import Path


def detect_npm_install(project_root: Path) -> dict:
    """Detect if project has an npm-based Pennyfarthing installation.

    Checks for node_modules/@pennyfarthing/core and related npm artifacts.

    Args:
        project_root: Project root path

    Returns:
        Result dict: {success, is_npm: bool, npm_paths: list[str], error?}
    """
    raise NotImplementedError("detect_npm_install not yet implemented")


def plan_migration(project_root: Path) -> dict:
    """Plan the migration from npm to Python-based install.

    Scans the project and returns a migration plan listing what will be
    migrated, preserved, and removed.

    Args:
        project_root: Project root path

    Returns:
        Result dict: {success, plan: dict, error?}
    """
    raise NotImplementedError("plan_migration not yet implemented")


def migrate_directory_structure(project_root: Path, dry_run: bool = False) -> dict:
    """Migrate directory structure from npm layout to Python layout.

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, changes: list[str], error?}
    """
    raise NotImplementedError("migrate_directory_structure not yet implemented")


def preserve_custom_hooks(project_root: Path) -> dict:
    """Identify and preserve user custom hooks (non-pf-* prefixed).

    Scans settings.local.json for hooks that are not Pennyfarthing-managed
    (don't start with 'pf hooks') and returns them for preservation.

    Args:
        project_root: Project root path

    Returns:
        Result dict: {success, custom_hooks: list[dict], error?}
    """
    raise NotImplementedError("preserve_custom_hooks not yet implemented")


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
    raise NotImplementedError("migrate_settings not yet implemented")


def migrate_config_files(project_root: Path, dry_run: bool = False) -> dict:
    """Migrate config files (preferences.yaml → config.local.yaml).

    Delegates to config_migration.migrate_config() for the actual migration,
    then handles any upgrade-specific config changes.

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, migrated: list[str], error?}
    """
    raise NotImplementedError("migrate_config_files not yet implemented")


def generate_report(results: dict) -> str:
    """Generate a human-readable report of what changed during upgrade.

    Args:
        results: Aggregated results from all migration steps

    Returns:
        Formatted report string
    """
    raise NotImplementedError("generate_report not yet implemented")


def run_upgrade(project_root: Path, dry_run: bool = False) -> dict:
    """Run the full upgrade from npm-based to Python-based install.

    Orchestrates all migration steps:
    1. Detect npm install
    2. Plan migration
    3. Migrate directory structure
    4. Preserve custom hooks
    5. Migrate settings
    6. Migrate config files
    7. Generate report

    Args:
        project_root: Project root path
        dry_run: If True, show plan without executing

    Returns:
        Result dict: {success, report: str, changes: dict, error?}
    """
    raise NotImplementedError("run_upgrade not yet implemented")
