"""
Frontmatter hook declarations for agents and skills.

Parses hook declarations from YAML frontmatter in agent .md files and
skill SKILL.md files. Enables co-locating hook definitions with the
components that need them, reducing settings.local.json to infrastructure-only.

Story: MSSCI-15494 (126-6)
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from pathlib import Path

import yaml

# Infrastructure hooks that stay in settings.local.json.
# Everything else lives in agent/skill frontmatter.
INFRASTRUCTURE_HOOKS: set[str] = {
    "session-start",
    "session-stop",
    "pre-edit-check",
    "context-warning",
    "bell-mode",
    "agent-reload",
}


@dataclass
class HookDeclaration:
    """A single hook declaration from frontmatter."""

    event: str  # SessionStart, Stop, PreToolUse, PostToolUse
    command: str  # e.g. "pf hooks reflector-check"
    matcher: str | None = None  # tool name regex, e.g. "Edit|Write"


# Valid event types for Claude Code hooks
VALID_EVENTS: set[str] = {"SessionStart", "Stop", "PreToolUse", "PostToolUse"}


def parse_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from markdown content.

    Returns:
        Parsed frontmatter dict, or empty dict if no valid frontmatter.
    """
    if not content.startswith("---\n"):
        return {}
    end = content.find("\n---", 3)
    if end == -1:
        return {}
    fm_text = content[4:end]
    try:
        return yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return {}


def _parse_hooks_from_dict(hooks_dict: dict) -> list[HookDeclaration]:
    """Parse a hooks dict (event -> list of hook entries) into HookDeclarations."""
    result: list[HookDeclaration] = []
    if not isinstance(hooks_dict, dict):
        return result
    for event, entries in hooks_dict.items():
        if event not in VALID_EVENTS:
            continue
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            command = entry.get("command")
            if not command:
                continue
            matcher = entry.get("matcher")
            result.append(HookDeclaration(event=event, command=command, matcher=matcher))
    return result


def parse_agent_hooks(content: str) -> list[HookDeclaration]:
    """Extract hook declarations from agent .md frontmatter.

    Agent frontmatter hooks format:
    ---
    hooks:
      PreToolUse:
        - command: pf hooks schema-validation
          matcher: Write
      Stop:
        - command: pf hooks reflector-check
    ---

    Returns:
        List of HookDeclaration objects.
    """
    fm = parse_frontmatter(content)
    hooks_dict = fm.get("hooks")
    if not hooks_dict:
        return []
    return _parse_hooks_from_dict(hooks_dict)


def parse_skill_hooks(content: str) -> list[HookDeclaration]:
    """Extract hook declarations from skill SKILL.md frontmatter.

    Skill frontmatter hooks format:
    ---
    name: pf-sprint
    description: Sprint management
    hooks:
      PostToolUse:
        - command: pf hooks sprint-yaml
          matcher: Edit|Write
    ---

    Returns:
        List of HookDeclaration objects.
    """
    fm = parse_frontmatter(content)
    hooks_dict = fm.get("hooks")
    if not hooks_dict:
        return []
    return _parse_hooks_from_dict(hooks_dict)


def collect_all_frontmatter_hooks(
    dist_root: Path,
) -> dict[str, list[HookDeclaration]]:
    """Collect all frontmatter hooks from agents and skills.

    Scans agents/*.md and skills/*/SKILL.md for hook declarations.

    Args:
        dist_root: Path to pennyfarthing-dist/

    Returns:
        Dict keyed by event type (SessionStart, Stop, PreToolUse, PostToolUse)
        with lists of HookDeclaration objects.
    """
    result: dict[str, list[HookDeclaration]] = {}
    seen: set[tuple[str, str, str | None]] = set()

    def _add(hook: HookDeclaration) -> None:
        key = (hook.event, hook.command, hook.matcher)
        if key in seen:
            return
        seen.add(key)
        result.setdefault(hook.event, []).append(hook)

    # Scan agents
    agents_dir = dist_root / "agents"
    if agents_dir.is_dir():
        for f in sorted(agents_dir.glob("*.md")):
            if f.name == "README.md":
                continue
            content = f.read_text()
            for hook in parse_agent_hooks(content):
                _add(hook)

    # Scan skills
    skills_dir = dist_root / "skills"
    if skills_dir.is_dir():
        for skill_dir in sorted(skills_dir.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                skill_md = skill_dir / "skill.md"
            if not skill_md.exists():
                continue
            content = skill_md.read_text()
            for hook in parse_skill_hooks(content):
                _add(hook)

    return result


def to_settings_format(hooks: list[HookDeclaration]) -> list[dict]:
    """Convert HookDeclarations to Claude Code settings.local.json format.

    Each HookDeclaration becomes:
    {
        "matcher": "Edit|Write",  # omitted if None
        "hooks": [{"type": "command", "command": "pf hooks ..."}]
    }

    Returns:
        List of hook entry dicts in Claude Code format.
    """
    entries: list[dict] = []
    for hook in hooks:
        entry: dict = {
            "hooks": [{"type": "command", "command": hook.command}],
        }
        if hook.matcher is not None:
            entry["matcher"] = hook.matcher
        entries.append(entry)
    return entries


def _normalize_pf_command(cmd: str) -> str:
    """Normalize bare 'pf hooks X' to '.pennyfarthing/bin/pf hooks X' for dedup."""
    if cmd.startswith("pf hooks ") and not cmd.startswith(".pennyfarthing/"):
        return ".pennyfarthing/bin/" + cmd
    return cmd


def merge_with_infrastructure(
    infrastructure: dict,
    frontmatter_hooks: dict[str, list[HookDeclaration]],
) -> dict:
    """Merge frontmatter hooks with infrastructure settings.

    Takes the minimal infrastructure settings dict and adds
    frontmatter-declared hooks to the appropriate event arrays.

    Args:
        infrastructure: Base settings dict with infrastructure hooks
        frontmatter_hooks: Collected frontmatter hooks by event type

    Returns:
        Complete settings dict with both infrastructure and component hooks.
    """
    result = copy.deepcopy(infrastructure)
    if not frontmatter_hooks:
        return result
    hooks_section = result.setdefault("hooks", {})

    for event, declarations in frontmatter_hooks.items():
        existing = hooks_section.get(event, [])
        # Collect existing commands for dedup, normalizing bare "pf hooks"
        # to ".pennyfarthing/bin/pf hooks" so both forms match.
        existing_commands: set[str] = set()
        for entry in existing:
            for h in entry.get("hooks", []):
                cmd = h.get("command", "")
                existing_commands.add(_normalize_pf_command(cmd))

        new_entries = []
        for decl in declarations:
            if _normalize_pf_command(decl.command) in existing_commands:
                continue
            new_entries.append(decl)

        if new_entries:
            hooks_section[event] = existing + to_settings_format(new_entries)

    return result


def count_hooks_in_settings(settings: dict) -> int:
    """Count total hook entries in a settings dict.

    Counts each hook entry (not individual hook commands within an entry).

    Returns:
        Total number of hook entries across all event types.
    """
    total = 0
    hooks = settings.get("hooks", {})
    for _event, entries in hooks.items():
        if isinstance(entries, list):
            total += len(entries)
    return total
