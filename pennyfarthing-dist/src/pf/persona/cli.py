"""Persona CLI — query active agent persona data.

Usage:
    pf persona current [AGENT] [--json]
"""

from __future__ import annotations

import click


@click.group()
def persona():
    """Agent persona queries.

    \b
    Commands:
      current  - Show current agent persona
    """
    pass


@persona.command("current")
@click.argument("agent_name", required=False, default=None)
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def persona_current(agent_name: str | None, output_json: bool):
    """Show the current agent persona from the active theme.

    \b
    Arguments:
      AGENT  - Agent name (sm, tea, dev, etc.). Auto-detects if omitted.

    \b
    JSON Output (--json):
      {
        "agent": string,
        "character": string,
        "theme": string,
        "style": string | null,
        "crew": [{"agent": string, "character": string, "displayName": string}]
      }

    \b
    Error Response (--json, exit 1):
      {"error": string, "code": "NO_THEME", "detail": null}
    """
    from pf.common.config import get_project_root
    from pf.prime.persona import get_crew_manifest, load_persona

    root = get_project_root()

    if not agent_name:
        agent_name = "sm"  # Default fallback

    persona_obj, theme_name = load_persona(agent_name, root)

    if not persona_obj or not theme_name:
        if output_json:
            import json

            click.echo(json.dumps({
                "error": "No theme configured",
                "code": "NO_THEME",
                "detail": None,
            }, indent=2))
            raise SystemExit(1)
        click.echo("No theme configured. Use 'pf theme set <name>' first.")
        raise SystemExit(1)

    crew = get_crew_manifest(root)
    crew_list = [
        {
            "agent": m.agent,
            "character": m.character,
            "displayName": getattr(m, "display_name", f"{m.character} ({m.agent.upper()})"),
        }
        for m in crew
    ]

    result = {
        "agent": agent_name,
        "character": persona_obj.character,
        "theme": theme_name,
        "style": getattr(persona_obj, "style", None),
        "crew": crew_list,
    }

    if output_json:
        import json

        click.echo(json.dumps(result, indent=2))
    else:
        click.echo(f"Agent: {agent_name}")
        click.echo(f"Character: {persona_obj.character}")
        click.echo(f"Theme: {theme_name}")
        if result["style"]:
            click.echo(f"Style: {result['style']}")
