"""Demo script generator — step-by-step presenter walkthrough (story 145-4).

Transforms GeneratedContent into presenter-friendly demo scripts with
scene breakdowns, timing estimates, and story-type-specific formatting.

Pure mechanical Python — no AI, no external calls.
"""

from __future__ import annotations

from typing import Any

from pf.demo.models import GeneratedContent, StoryType


def generate_demo_script(generated_content: GeneratedContent) -> dict[str, Any]:
    """Generate a presenter-ready demo script from generated content.

    Args:
        generated_content: Output from the Content Generator (145-3).

    Returns:
        {success: True, data: str} with Markdown content on success,
        {success: False, error: str} on failure.
    """
    try:
        gc = generated_content

        if not gc.demo_script or not gc.demo_script.strip():
            return {"success": False, "error": "Empty demo_script field — cannot generate script"}

        formatter = _FORMATTERS.get(gc.story_type, _format_backend)
        md = formatter(gc)

        return {"success": True, "data": md}
    except Exception as exc:
        return {"success": False, "error": f"Script generation failed: {exc}"}


# ---------------------------------------------------------------------------
# Story-type formatters
# ---------------------------------------------------------------------------


def _format_ui(gc: GeneratedContent) -> str:
    """Format a UI story demo script with interaction focus."""
    lines = [
        f"# Demo Script — Story {gc.story_id}",
        "",
        "## Scene 1: Setup (30 sec)",
        "",
        f"**Presenter says:** \"{gc.problem_statement}\"",
        "",
        "**Show:** The application screen before the changes",
        "",
        "**Click:** Navigate to the relevant screen",
        "",
        "## Scene 2: Act 1 (2 min)",
        "",
        f"**Presenter says:** \"{gc.what_changed}\"",
        "",
        f"**Show:** {gc.demo_script}",
        "",
        "**Click:** Walk through the new interface elements",
        "",
        "## Scene 3: Act 2 (1 min)",
        "",
        f"**Presenter says:** \"{gc.why_this_approach}\"",
        "",
        "**Show:** The updated interface in action",
        "",
        "**Click:** Demonstrate the key interactions and visual feedback",
        "",
        "## Scene 4: Closing (30 sec)",
        "",
        "**Presenter says:** \"That covers the changes. The new interface is live and ready for users.\"",
        "",
        "**Show:** Final state of the screen",
    ]
    return "\n".join(lines)


def _format_backend(gc: GeneratedContent) -> str:
    """Format a backend story demo script with architecture narrative."""
    before_after_line = ""
    if gc.before_after:
        before_after_line = f"\n**Presenter says:** \"{gc.before_after}\"\n"

    lines = [
        f"# Demo Script — Story {gc.story_id}",
        "",
        "## Scene 1: Setup (30 sec)",
        "",
        f"**Presenter says:** \"{gc.problem_statement}\"",
        "",
        "**Show:** Overview of the system before changes",
        "",
        "## Scene 2: Act 1 (2 min)",
        "",
        f"**Presenter says:** \"{gc.what_changed}\"",
        "",
        f"**Show:** {gc.demo_script}",
        "",
        "## Scene 3: Act 2 (1 min)",
        "",
        f"**Presenter says:** \"{gc.why_this_approach}\"",
    ]

    if before_after_line:
        lines.append(before_after_line)

    lines.extend([
        "**Show:** How the system now handles requests",
        "",
        "## Scene 4: Closing (30 sec)",
        "",
        "**Presenter says:** \"The system is now live with these improvements.\"",
        "",
        "**Show:** Updated system overview",
    ])
    return "\n".join(lines)


def _format_infrastructure(gc: GeneratedContent) -> str:
    """Format an infrastructure story demo script with system-level focus."""
    lines = [
        f"# Demo Script — Story {gc.story_id}",
        "",
        "## Scene 1: Setup (30 sec)",
        "",
        f"**Presenter says:** \"{gc.problem_statement}\"",
        "",
        "**Show:** The previous deployment pipeline",
        "",
        "## Scene 2: Act 1 (2 min)",
        "",
        f"**Presenter says:** \"{gc.what_changed}\"",
        "",
        f"**Show:** {gc.demo_script}",
        "",
        "## Scene 3: Act 2 (1 min)",
        "",
        f"**Presenter says:** \"{gc.why_this_approach}\"",
        "",
        "**Show:** The automated pipeline running end to end",
        "",
        "## Scene 4: Closing (30 sec)",
        "",
        "**Presenter says:** \"The new system is deployed and operational.\"",
        "",
        "**Show:** Production dashboard showing the system running",
    ]
    return "\n".join(lines)


def _format_refactor(gc: GeneratedContent) -> str:
    """Format a refactor story demo script with before/after comparison."""
    before_after_section = ""
    if gc.before_after:
        before_after_section = f"\n**Presenter says:** \"{gc.before_after}\"\n"

    lines = [
        f"# Demo Script — Story {gc.story_id}",
        "",
        "## Scene 1: Setup (30 sec)",
        "",
        f"**Presenter says:** \"{gc.problem_statement}\"",
        "",
        "**Show:** The state of the system before the refactor",
        "",
        "## Scene 2: Act 1 (2 min)",
        "",
        f"**Presenter says:** \"{gc.what_changed}\"",
        "",
        f"**Show:** {gc.demo_script}",
        "",
        "## Scene 3: Act 2 (1 min)",
        "",
    ]

    if before_after_section:
        lines.append(f"**Presenter says:** \"{gc.before_after}\"")
        lines.append("")
    else:
        lines.append(f"**Presenter says:** \"{gc.why_this_approach}\"")
        lines.append("")

    lines.extend([
        "**Show:** The improvements after the refactor",
        "",
        "## Scene 4: Closing (30 sec)",
        "",
        "**Presenter says:** \"The refactor is complete and the system is cleaner and faster.\"",
        "",
        "**Show:** Final comparison of before and after",
    ])
    return "\n".join(lines)


def _format_bugfix(gc: GeneratedContent) -> str:
    """Format a bugfix story demo script with problem-solution framing."""
    lines = [
        f"# Demo Script — Story {gc.story_id}",
        "",
        "## Scene 1: Setup (30 sec)",
        "",
        f"**Presenter says:** \"{gc.problem_statement}\"",
        "",
        "**Show:** The issue as users experienced it",
        "",
        "## Scene 2: Act 1 (2 min)",
        "",
        f"**Presenter says:** \"{gc.what_changed}\"",
        "",
        f"**Show:** {gc.demo_script}",
        "",
        "## Scene 3: Act 2 (1 min)",
        "",
    ]

    if gc.before_after:
        lines.append(f"**Presenter says:** \"{gc.before_after}\"")
    else:
        lines.append(f"**Presenter says:** \"{gc.why_this_approach}\"")

    lines.extend([
        "",
        "**Show:** The fix in action, the problem is now resolved",
        "",
        "## Scene 4: Closing (30 sec)",
        "",
        "**Presenter says:** \"The issue is fixed and users can now proceed without problems.\"",
        "",
        "**Show:** The system working correctly after the fix",
    ])
    return "\n".join(lines)


_FORMATTERS: dict[StoryType, Any] = {
    StoryType.UI: _format_ui,
    StoryType.BACKEND: _format_backend,
    StoryType.INFRASTRUCTURE: _format_infrastructure,
    StoryType.REFACTOR: _format_refactor,
    StoryType.BUGFIX: _format_bugfix,
}
