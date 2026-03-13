"""Generate AGENT_COMMAND block for handoff markers.

Replaces handoff-marker.sh with a Python implementation that reuses
the existing context.py module for environment detection.

Story: 105-4 (Script-First Handoff)
"""

from __future__ import annotations

from pf.context_window import check_context


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

    # Emit handoff event to BikeRack (Story 143-16)
    try:
        from pf.frame.subagent_events import emit_subagent_event

        emit_subagent_event("handoff", next_agent=next_agent)
    except Exception:
        pass

    ctx = check_context()

    pct = ctx.usable_percent if not ctx.error else "unknown"

    if pct != "unknown" and pct >= 60:
        context_warning = f" (context: {pct}% - consider /clear before continuing)"
    elif pct != "unknown":
        context_warning = f" (context: {pct}%)"
    else:
        context_warning = ""

    saddle_mode = getattr(ctx, "saddle_mode", False)

    if saddle_mode:
        saddle_cmd = f"pf saddle start {next_agent}"
        if ctx.relay_mode:
            return _block(
                relay=True,
                saddle_command=saddle_cmd,
                fallback=f"Run `{saddle_cmd}` to continue",
                context_percent=pct,
            )
        else:
            return _block(
                fallback=f"Run `{saddle_cmd}` to continue{context_warning}",
                relay_mode=False,
                context_percent=pct,
            )

    cmd = f"/pf-{next_agent}"

    if not ctx.relay_mode:
        # Relay off — user invokes next agent manually
        return _block(
            fallback=f"Run `{cmd}` to continue{context_warning}",
            relay_mode=False,
            context_percent=pct,
        )

    # Relay on — agent invokes next agent via Skill tool
    return _block(
        relay=True,
        invoke=cmd,
        fallback=f"Run `{cmd}` to continue",
        context_percent=pct,
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
