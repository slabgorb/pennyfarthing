"""Generate AGENT_COMMAND block for handoff markers.

Replaces handoff-marker.sh with a Python implementation that reuses
the existing context.py module for environment detection.

Story: 105-4 (Script-First Handoff)
"""

from __future__ import annotations

from pennyfarthing_scripts.context import check_context


def generate_marker(
    next_agent: str | None = None,
    *,
    error: str | None = None,
) -> str:
    """Generate an AGENT_COMMAND block for agent handoff.

    Args:
        next_agent: Agent to hand off to (e.g., "dev", "tea", "reviewer").
        error: If set, generates an error block instead of a handoff.

    Returns:
        YAML-formatted AGENT_COMMAND block string.
    """
    if error:
        return _block(fallback=error, error=True)

    if not next_agent:
        return _block(fallback="No next agent specified", error=True)

    ctx = check_context()

    cmd = f"/pf-{next_agent}"
    pct = ctx.usable_percent if not ctx.error else "unknown"

    if pct != "unknown" and pct >= 60:
        context_warning = f" (context: {pct}% - consider /clear before continuing)"
    elif pct != "unknown":
        context_warning = f" (context: {pct}%)"
    else:
        context_warning = ""

    if not ctx.relay_mode:
        # Relay off — ask for confirmation
        if ctx.is_cyclist:
            return _block(
                marker="<!-- CYCLIST:QUESTION:yesno -->",
                question=f"Ready to hand off to {cmd}?",
                fallback=f"Run `{cmd}` to continue",
            )
        return _block(
            fallback=f"Run `{cmd}` to continue{context_warning}",
            relay_mode=False,
            context_percent=pct,
        )

    # Relay on — auto-handoff
    # Cyclist uses its feedback loop (QuickActions → slash command injection).
    # Non-Cyclist: we're already in the session, invoke the agent directly.
    marker = None
    if ctx.use_tirepump:
        marker = f"<!-- CYCLIST:CONTEXT_CLEAR:{cmd} -->" if ctx.is_cyclist else None
    else:
        marker = f"<!-- CYCLIST:HANDOFF:{cmd} -->" if ctx.is_cyclist else None

    if ctx.is_cyclist:
        return _block(
            marker=marker,
            fallback=f"Run `{cmd}` to continue",
        )

    # Non-Cyclist relay: return structured action for the agent to act on.
    # The calling agent reads the `action` field and executes accordingly.
    if ctx.use_tirepump:
        return _block(
            action="tirepump_handoff",
            next_agent=next_agent,
            fallback=f"Context is high ({pct}%). Run /clear then {cmd}",
            context_percent=pct,
            relay_mode=True,
        )

    return _block(
        action="inline_handoff",
        next_agent=next_agent,
        activation_command=f"pf agent start {next_agent} --tier handoff --quiet",
        fallback=f"Run `{cmd}` to continue",
        context_percent=pct,
        relay_mode=True,
    )


def _block(**fields: object) -> str:
    """Format an AGENT_COMMAND YAML block."""
    lines = ["---", "AGENT_COMMAND:"]
    for key, value in fields.items():
        if isinstance(value, bool):
            lines.append(f"  {key}: {str(value).lower()}")
        elif isinstance(value, str) and value:
            lines.append(f'  {key}: "{value}"')
        elif value == "":
            lines.append(f'  {key}: ""')
        else:
            lines.append(f"  {key}: {value}")
    lines.append("---")
    return "\n".join(lines)
