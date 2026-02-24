"""Core init logic — project initialization.

Story 126-2: Rewrite pf init in Python.

Creates .pennyfarthing/ and .claude/ directory structures,
copies pf-* commands and skills, writes settings.local.json,
and updates .gitignore. Idempotent and deterministic.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

# The 5 essential hooks for a minimal Pennyfarthing installation.
_MINIMAL_SETTINGS: dict = {
    "hooks": {
        "SessionStart": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": 'pf hooks session-start',
                    }
                ]
            }
        ],
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": 'pf hooks session-stop',
                    }
                ]
            }
        ],
        "PreToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {
                        "type": "command",
                        "command": 'pf hooks pre-edit-check',
                    }
                ],
            },
            {
                "matcher": "Edit|Write|Bash|Task",
                "hooks": [
                    {
                        "type": "command",
                        "command": 'pf hooks context-warning',
                    }
                ],
            },
        ],
        "PostToolUse": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": 'pf hooks bell-mode',
                    }
                ]
            }
        ],
    }
}

# Entries to add to .gitignore.
_GITIGNORE_ENTRIES: list[str] = [
    "# Pennyfarthing runtime",
    ".session/",
    ".claude/settings.local.json",
    ".pennyfarthing/config.local.yaml",
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

    # --- Gather plan ---
    commands_to_copy = _find_pf_commands(dist_root)
    skills_to_copy = _find_pf_skills(dist_root)
    directories = _PENNYFARTHING_DIRS + _CLAUDE_DIRS

    if dry_run:
        return {
            "success": True,
            "data": {
                "directories": directories,
                "commands": [c.name for c in commands_to_copy],
                "skills": [s.name for s in skills_to_copy],
                "settings": ".claude/settings.local.json",
                "gitignore_entries": _GITIGNORE_ENTRIES,
            },
        }

    # --- Create directories ---
    for d in directories:
        (target_dir / d).mkdir(parents=True, exist_ok=True)

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

    # --- Write settings.local.json (only if missing) ---
    settings_path = target_dir / ".claude" / "settings.local.json"
    settings_written = False
    if not settings_path.exists():
        settings_path.write_text(json.dumps(_MINIMAL_SETTINGS, indent=2) + "\n")
        settings_written = True

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
            "directories_created": len(directories),
            "settings_written": settings_written,
            "gitignore_updated": True,
            "setup": setup_result.get("data", {}),
        },
    }


def _find_pf_commands(dist_root: Path) -> list[Path]:
    """Find all pf-*.md command files in dist_root/commands/."""
    commands_dir = dist_root / "commands"
    if not commands_dir.is_dir():
        return []
    return sorted(commands_dir.glob("pf-*.md"))


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
    """Copy a directory tree, overwriting existing files."""
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def _update_gitignore(target_dir: Path) -> None:
    """Add pennyfarthing entries to .gitignore, avoiding duplicates."""
    gitignore_path = target_dir / ".gitignore"

    existing_lines: set[str] = set()
    existing_content = ""
    if gitignore_path.is_file():
        existing_content = gitignore_path.read_text()
        existing_lines = {line.strip() for line in existing_content.splitlines()}

    new_entries = [e for e in _GITIGNORE_ENTRIES if e.strip() not in existing_lines]

    if new_entries:
        # Ensure trailing newline before appending
        if existing_content and not existing_content.endswith("\n"):
            existing_content += "\n"
        existing_content += "\n".join(new_entries) + "\n"
        gitignore_path.write_text(existing_content)
