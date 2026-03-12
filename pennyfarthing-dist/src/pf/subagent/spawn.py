"""Build spawn configurations for the Agent tool."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pf.subagent.loader import (
    get_agent_model,
    get_agent_tool_restrictions,
    get_native_agent_path,
)
from pf.subagent.prompt import build_subagent_prompt


def build_spawn_config(
    agent_name: str,
    story_id: str,
    task_description: str,
    project_root: Path,
    prior_handoff_path: Path | None = None,
) -> dict[str, Any]:
    """Assemble a complete spawn configuration for the Agent tool.

    Returns a dict with agent_name, model, prompt, allowed_tools,
    native_agent_path — or status='error' if the agent is not found.
    """
    native_path = get_native_agent_path(agent_name, project_root)
    if native_path is None:
        return {
            "status": "error",
            "error": f"Native agent '{agent_name}' not found",
        }

    model = get_agent_model(agent_name, project_root) or "sonnet"
    tools = get_agent_tool_restrictions(agent_name, project_root) or []

    prompt = build_subagent_prompt(
        agent_name=agent_name,
        story_id=story_id,
        task_description=task_description,
        project_root=project_root,
        prior_handoff_path=prior_handoff_path,
    )

    return {
        "status": "ready",
        "agent_name": agent_name,
        "model": model,
        "prompt": prompt,
        "allowed_tools": tools,
        "native_agent_path": native_path,
    }
