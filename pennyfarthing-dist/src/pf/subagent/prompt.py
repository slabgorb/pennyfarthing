"""Build prompts for spawning native subagents."""

from __future__ import annotations

from pathlib import Path

from pf.prime.tiers import ContextTier, load_tier_components


def build_subagent_prompt(
    agent_name: str,
    story_id: str,
    task_description: str,
    project_root: Path,
    prior_handoff_path: Path | None = None,
) -> str:
    """Build the prompt to inject into the Agent tool for a native subagent.

    Assembles SUBAGENT-tier prime context + task description + optional
    prior handoff document content.
    """
    parts: list[str] = []

    # Load SUBAGENT tier context
    components = load_tier_components(ContextTier.SUBAGENT, agent_name, project_root)
    for key, value in components.items():
        if key in ("token_counts", "total_tokens"):
            continue
        if isinstance(value, str) and value.strip():
            parts.append(f"# {key.replace('_', ' ').title()}\n{value}")

    # Prior phase handoff
    if prior_handoff_path and prior_handoff_path.exists():
        handoff_content = prior_handoff_path.read_text()
        parts.append(
            f"## Prior Phase Context\n\n"
            f"The previous agent completed the prior phase:\n\n"
            f"{handoff_content}"
        )

    # Task section
    parts.append(f"## Task\n\n**Story:** {story_id}\n\n{task_description}")

    return "\n\n".join(parts)
