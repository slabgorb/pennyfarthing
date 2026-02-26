"""
Stale hooks detection — Story 129-6.

Compares installed hooks in .claude/settings.local.json against the canonical
hooks shipped by pennyfarthing (INFRASTRUCTURE_HOOKS + agent/skill frontmatter).
Returns a drift report for session-start to surface as additionalContext.
"""

from __future__ import annotations

import json
from pathlib import Path

from pf.common.hooks import INFRASTRUCTURE_HOOKS


def _load_installed_hooks(project_dir: Path) -> dict:
    """Load hooks from .claude/settings.local.json.

    Returns the hooks dict, or empty dict on any failure.
    """
    settings_path = project_dir / ".claude" / "settings.local.json"
    if not settings_path.is_file():
        return {}
    try:
        data = json.loads(settings_path.read_text())
    except (json.JSONDecodeError, OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    hooks = data.get("hooks", {})
    if not isinstance(hooks, dict):
        return {}
    return hooks


def _extract_commands(hooks: dict) -> set[tuple[str, str, str | None]]:
    """Extract (event, command, matcher) tuples from a hooks dict."""
    result: set[tuple[str, str, str | None]] = set()
    for event, entries in hooks.items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            matcher = entry.get("matcher")
            for h in entry.get("hooks", []):
                if isinstance(h, dict) and h.get("command"):
                    result.add((event, h["command"], matcher))
    return result


def _find_missing_infrastructure(installed_commands: set[tuple[str, str, str | None]]) -> list[dict]:
    """Find infrastructure hooks not present in installed settings."""
    # Build set of (event, command) from installed — ignore matcher for matching
    installed_event_commands: set[tuple[str, str]] = {
        (event, cmd) for event, cmd, _matcher in installed_commands
    }

    missing: list[dict] = []
    for event, entries in INFRASTRUCTURE_HOOKS.items():
        for entry in entries:
            canonical_cmd = entry["hooks"][0]["command"]
            if (event, canonical_cmd) not in installed_event_commands:
                item: dict = {"command": canonical_cmd, "event": event}
                matcher = entry.get("matcher")
                if matcher is not None:
                    item["matcher"] = matcher
                missing.append(item)
    return missing


def _find_deprecated(installed_commands: set[tuple[str, str, str | None]]) -> list[dict]:
    """Find deprecated pf.sh hook references."""
    deprecated: list[dict] = []
    for event, cmd, matcher in installed_commands:
        if "pf.sh" in cmd:
            item: dict = {"command": cmd, "event": event}
            if matcher is not None:
                item["matcher"] = matcher
            deprecated.append(item)
    return deprecated


def _find_missing_frontmatter(
    installed_commands: set[tuple[str, str, str | None]],
    dist_root: Path,
) -> list[dict]:
    """Find frontmatter-declared hooks not present in installed settings."""
    from pf.hooks.frontmatter import collect_all_frontmatter_hooks

    frontmatter_hooks = collect_all_frontmatter_hooks(dist_root)

    installed_event_commands: set[tuple[str, str]] = {
        (event, cmd) for event, cmd, _matcher in installed_commands
    }

    missing: list[dict] = []
    for event, declarations in frontmatter_hooks.items():
        for decl in declarations:
            if (event, decl.command) not in installed_event_commands:
                item: dict = {"command": decl.command, "event": event}
                if decl.matcher is not None:
                    item["matcher"] = decl.matcher
                missing.append(item)
    return missing


def _build_summary(
    missing_infra: list[dict],
    missing_frontmatter: list[dict],
    deprecated: list[dict],
) -> str:
    """Build human-readable upgrade prompt."""
    if not missing_infra and not missing_frontmatter and not deprecated:
        return ""

    lines: list[str] = ["Hooks are outdated. Run `pf init` to upgrade.\n"]

    if missing_infra:
        lines.append("Missing infrastructure hooks:")
        for h in missing_infra:
            lines.append(f"  - {h['event']}: {h['command']}")

    if missing_frontmatter:
        lines.append("Missing agent/skill hooks:")
        for h in missing_frontmatter:
            lines.append(f"  - {h['event']}: {h['command']}")

    if deprecated:
        lines.append("Deprecated hooks (pf.sh references):")
        for h in deprecated:
            lines.append(f"  - {h['event']}: {h['command']}")

    return "\n".join(lines)


def detect_stale_hooks(
    project_dir: Path,
    dist_root: Path | None = None,
) -> dict:
    """Detect stale, missing, or deprecated hooks in project settings.

    Compares the hooks in .claude/settings.local.json against:
    1. INFRASTRUCTURE_HOOKS (canonical infrastructure hooks)
    2. Frontmatter hooks from agents/*.md and skills/*/SKILL.md

    Args:
        project_dir: Project root directory
        dist_root: Path to pennyfarthing-dist/ (for frontmatter scanning).
                   If None, skips frontmatter check.

    Returns:
        {
            "stale": bool,  # True if any drift detected
            "missing_infrastructure": list[dict],  # {command, event, matcher?}
            "missing_frontmatter": list[dict],      # {command, event, matcher?}
            "deprecated": list[dict],               # {command, event, matcher?}
            "summary": str,  # Human-readable upgrade prompt (empty if clean)
        }
    """
    installed_hooks = _load_installed_hooks(project_dir)
    installed_commands = _extract_commands(installed_hooks)

    missing_infra = _find_missing_infrastructure(installed_commands)
    deprecated = _find_deprecated(installed_commands)

    missing_frontmatter: list[dict] = []
    if dist_root is not None:
        missing_frontmatter = _find_missing_frontmatter(
            installed_commands, dist_root
        )

    stale = bool(missing_infra or missing_frontmatter or deprecated)
    summary = _build_summary(missing_infra, missing_frontmatter, deprecated)

    return {
        "stale": stale,
        "missing_infrastructure": missing_infra,
        "missing_frontmatter": missing_frontmatter,
        "deprecated": deprecated,
        "summary": summary,
    }
