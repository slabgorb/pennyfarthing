"""Reviewer assessment template generator.

Produces a correctly-formatted reviewer assessment skeleton with all specialist
dispatch tags positioned so the output passes the approval gate checks in
complete_phase.py without manual reformatting.

Story: 150-13
"""

from __future__ import annotations

from pf.handoff.complete_phase import _SUBAGENT_SETTING_MAP


def _get_enabled_subagents() -> set[str]:
    """Return enabled subagent setting keys from workflow settings."""
    try:
        from pf.settings.settings import get_setting

        toggles = get_setting("workflow.reviewer_subagents") or {}
    except Exception:
        toggles = {}

    enabled: set[str] = set()
    for key in _SUBAGENT_SETTING_MAP:
        if toggles.get(key, True):  # default enabled
            enabled.add(key)
    return enabled


def generate_reviewer_template(enabled_subagents: set[str] | None = None) -> str:
    """Generate a reviewer assessment markdown template.

    Args:
        enabled_subagents: Set of setting keys (e.g. "edge_hunter", "security")
            for subagents that should have dispatch tags included.  If None,
            reads from workflow.reviewer_subagents settings.

    Returns:
        Markdown string with ``## Reviewer Assessment`` containing dispatch
        tags for every enabled specialist, followed by ``## Subagent Results``.
    """
    if enabled_subagents is None:
        enabled_subagents = _get_enabled_subagents()

    lines: list[str] = []
    lines.append("## Reviewer Assessment")
    lines.append("")
    lines.append("**Verdict:** APPROVED | CHANGES_REQUESTED")
    lines.append("")

    # Dispatch tag lines — only for enabled subagents that have tags
    tag_lines: list[str] = []
    for key, (name, tag) in sorted(_SUBAGENT_SETTING_MAP.items()):
        if key in enabled_subagents and tag is not None:
            tag_lines.append(f"**{tag}** {name}: _no findings / summary of findings_")

    if tag_lines:
        lines.append("### Specialist Findings")
        lines.append("")
        lines.extend(tag_lines)
        lines.append("")

    lines.append("**Specialist findings incorporated:** Yes/No")
    lines.append("")
    lines.append("### Rule Compliance")
    lines.append("")
    lines.append("- _Document rule compliance checks here_")
    lines.append("")

    # Subagent Results section
    lines.append("## Subagent Results")
    lines.append("")
    lines.append("| # | Specialist | Received | Status | Findings | Decision |")
    lines.append("|---|-----------|----------|--------|----------|----------|")

    idx = 1
    for key, (name, _tag) in sorted(_SUBAGENT_SETTING_MAP.items()):
        if key in enabled_subagents:
            lines.append(f"| {idx} | {name} | Yes/No | - | - | - |")
            idx += 1

    lines.append("")
    lines.append("**All received:** Yes/No")
    lines.append("")

    return "\n".join(lines)
