"""
Prime CLI - Unified agent bootstrap for Pennyfarthing.

Usage:
    python -m pf.prime [options]

Options:
    --agent <name>    Load agent definition and sidecar
    --minimal         Skip all context (fastest)
    --full            Include domain docs from .claude/project/
    --quiet           Suppress section headers
    --json            Output JSON (for Cyclist integration)
    --no-persona      Skip persona loading
    --no-workflow     Skip workflow detection
    --no-register     Skip session registration
    --session-id ID   Use explicit session ID
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing import Any

from pf.common.config import get_project_root
from pf.prime.loader import (
    load_agent_definition,
    load_behavior_guide,
    load_domain_docs,
    load_gate_recovery_guide,
    load_output_style,
    load_session_context,
    load_sidecars,
    load_soul,
    load_sprint_context,
    load_team_mode_guide,
)
from pf.prime.models import PrimeComponent, PrimeResult, WorkflowState
from pf.prime.persona import (
    format_persona_compressed,
    format_persona_output,
    get_crew_manifest,
    get_user_title,
    is_character_voice_enabled,
    load_persona,
)
from pf.prime.session import cleanup_old_sessions, register_session
from pf.prime.tiers import ContextTier, load_tier_components, tier_from_string
from pf.prime.workflow import (
    check_redirect,
    detect_workflow_state,
    get_phase_gate_recovery,
    get_phase_team_config,
)


def _print_header(title: str, quiet: bool) -> None:
    """Print section header (respects quiet mode).

    Args:
        title: Header title
        quiet: If True, suppress output
    """
    if not quiet:
        print()
        print(f"# {title}")


def _emit_greeting(agent_name: str, persona: Any, root: Path) -> None:
    """Emit agent greeting to stderr so it's visible to the user.

    Writes to stderr to bypass stdout capture in hook contexts where
    stdout is redirected for HookResponse JSON parsing.

    Args:
        agent_name: Agent role name (e.g. "dev")
        persona: Persona object with .character attribute, or None
        root: Project root path
    """
    if persona and hasattr(persona, "character"):
        print(f"    Agent:   {persona.character} ({agent_name})", file=sys.stderr)
    else:
        print(f"    Agent:   {agent_name}", file=sys.stderr)


def _format_workflow_state_text(result: PrimeResult) -> str:
    """Format workflow state as text output.

    Args:
        result: PrimeResult with workflow status

    Returns:
        Formatted text block
    """
    if not result.workflow_status:
        return ""

    ws = result.workflow_status
    lines = [
        f"state: {ws.state.value}",
    ]

    if ws.story_id:
        lines.append(f"story_id: {ws.story_id}")
    if ws.phase:
        lines.append(f"phase: {ws.phase}")
    if ws.phase_owner:
        lines.append(f"phase_owner: {ws.phase_owner}")
    if ws.workflow:
        lines.append(f"workflow: {ws.workflow}")
    if ws.current_step is not None:
        lines.append(f"current_step: {ws.current_step}")
    if ws.total_steps is not None:
        lines.append(f"total_steps: {ws.total_steps}")
    if ws.step_name:
        lines.append(f"step_name: {ws.step_name}")
    if ws.backlog_count > 0:
        lines.append(f"backlog_count: {ws.backlog_count}")

    return "\n".join(lines)


def _component_header(name: str, agent_name: str | None) -> str:
    """Get section header text for a component."""
    headers = {
        "workflow_state": "Workflow State",
        "agent_definition": f"Agent Definition: {agent_name}",
        "persona": f"Persona: {agent_name}",
        "persona_compressed": f"Persona: {agent_name} (compressed)",
        "soul": "Project Principles (SOUL.md)",
        "output_style": "Output Style",
        "behavior_guide": "Agent Behavior Guide",
        "team_mode_guide": "Team Mode Guide",
        "gate_recovery_guide": "Gate Recovery Guide",
        "sprint_context": "Sprint Context",
        "repos_topology": "Repos Topology",
        "session_header": "Active Session",
        "session_assessment": "Session Assessment",
        "sidecars": f"Agent Sidecar: {agent_name}",
    }
    return headers.get(name, name.replace("_", " ").title())


def _component_source(name: str, agent_name: str | None, root: Path) -> str | None:
    """Get the relative source file path for a component."""
    paths: dict[str, str | None] = {
        "workflow_state": None,
        "agent_definition": f".pennyfarthing/agents/{agent_name}.md",
        "persona": None,
        "persona_compressed": None,
        "soul": "SOUL.md",
        "output_style": None,  # dynamic based on config
        "behavior_guide": ".pennyfarthing/guides/agent-behavior.md",
        "team_mode_guide": ".pennyfarthing/guides/team-mode.md",
        "gate_recovery_guide": ".pennyfarthing/guides/gate-recovery.md",
        "sprint_context": "sprint/current-sprint.yaml",
        "repos_topology": ".pennyfarthing/repos.yaml",
        "session_header": None,
        "session_assessment": None,
        "sidecars": f".pennyfarthing/sidecars/{agent_name}/",
    }
    return paths.get(name)


def _format_component_text(key: str, value: Any, result: PrimeResult) -> str:
    """Format a component value as context text.

    Handles special cases like WorkflowStatus objects that need
    custom formatting rather than raw str().
    """
    if key == "workflow_state" and result.workflow_status:
        return _format_workflow_state_text(result)
    if isinstance(value, str):
        return value
    return str(value)


def _build_json_result(
    result: PrimeResult,
    tier: ContextTier,
    agent_name: str | None,
    root: Path,
) -> None:
    """Populate result with context text, token counts, and components for JSON output.

    Loads tier components, assembles context text with section headers,
    and builds the components list with source paths.
    """
    components = load_tier_components(tier, agent_name or "", root)
    token_counts = components.get("token_counts", {})

    context_parts: list[str] = []
    component_list: list[PrimeComponent] = []

    for key, value in components.items():
        if key in ("token_counts", "total_tokens"):
            continue
        text = _format_component_text(key, value, result)
        if not text.strip():
            continue
        header = _component_header(key, agent_name)
        context_parts.append(f"# {header}\n{text}")
        component_list.append(
            PrimeComponent(
                name=key,
                tokens=token_counts.get(key, 0),
                source=_component_source(key, agent_name, root),
            )
        )

    result.context = "\n\n".join(context_parts) if context_parts else None
    result.tier = tier.value
    result.token_counts = token_counts
    result.total_tokens = components.get("total_tokens", 0)
    result.components = component_list


def _prime_tiered(
    agent_name: str | None,
    tier: ContextTier,
    quiet: bool,
    json_output: bool,
    no_workflow: bool,
    no_register: bool,
    session_id: str | None,
    root: Path,
    result: PrimeResult,
    greeting: bool = False,
) -> int:
    """Handle reduced tier context loading (REFRESH, HANDOFF, MINIMAL).

    This is a separate path from the FULL tier to ensure reduced output.

    Args:
        agent_name: Name of agent to load context for
        tier: Context tier level (REFRESH, HANDOFF, or MINIMAL)
        quiet: If True, suppress section headers
        json_output: If True, output JSON instead of text
        no_workflow: If True, skip workflow detection
        no_register: If True, skip session registration
        session_id: Explicit session ID
        root: Project root path
        result: PrimeResult to populate
        greeting: If True, emit agent greeting to stderr

    Returns:
        Exit code (0 for success)
    """
    # Session registration (if enabled)
    if agent_name and not no_register:
        cleanup_old_sessions(root)
        session_info = register_session(agent_name, session_id, root)
        result.session_id = session_info.session_id

    # Workflow state (always included in all tiers)
    if not no_workflow:
        workflow_status = detect_workflow_state(root)
        result.workflow_status = workflow_status

        if agent_name and workflow_status.state == WorkflowState.IN_PROGRESS_STATE:
            redirect = check_redirect(workflow_status, agent_name)
            if redirect:
                result.redirect_to, result.redirect_reason = redirect

        if not json_output:
            _print_header("Workflow State", quiet)
            print(_format_workflow_state_text(result))

    # MINIMAL tier: Just workflow state + note
    if tier == ContextTier.MINIMAL:
        if not json_output:
            print()
            print("<!-- Minimal context: see conversation history for full agent context -->")

        if json_output:
            _build_json_result(result, tier, agent_name, root)
            print(json.dumps(result.to_dict(), indent=2))

        return 0

    # REFRESH tier: Dynamic state only
    if tier == ContextTier.REFRESH:
        if not json_output:
            # Sprint context
            sprint_content = load_sprint_context(root)
            if sprint_content:
                _print_header("Sprint Context", quiet)
                print(sprint_content)

            # Session header only (not full assessment)
            session_result = load_session_context(root)
            if session_result:
                filename, header, _ = session_result
                _print_header(f"Active Session: {filename}", quiet)
                if header:
                    print(header)

            # Note about full context
            print()
            print("<!-- Full context already in conversation history -->")

        if json_output:
            _build_json_result(result, tier, agent_name, root)
            print(json.dumps(result.to_dict(), indent=2))

        return 0

    # HANDOFF tier: Agent essentials for new agent
    if tier == ContextTier.HANDOFF:
        if agent_name:
            # Agent definition
            agent_content = load_agent_definition(agent_name, root)
            if agent_content is None:
                if json_output:
                    print(json.dumps({"error": f"Agent '{agent_name}' not found"}))
                else:
                    print(f"Error: Agent '{agent_name}' not found", file=sys.stderr)
                return 1

            if not json_output:
                _print_header(f"Agent Definition: {agent_name}", quiet)
                print(agent_content)

            # Compressed persona
            if is_character_voice_enabled(root):
                persona, theme = load_persona(agent_name, root)
                if persona and theme:
                    result.persona = persona
                    result.theme = theme
                    if not json_output:
                        _print_header(f"Persona: {persona.character} ({agent_name})", quiet)
                        print(format_persona_compressed(persona, theme, agent_name))

            # Greeting: visible to user via stderr (bypasses stdout capture)
            if greeting:
                _emit_greeting(agent_name, result.persona, root)

        if not json_output:
            # Note about behavior guides
            print()
            print("<!-- Behavior guides in conversation history -->")

        # Redirect marker
        if result.redirect_to and not json_output:
            print()
            print("=" * 60)
            print(f"REDIRECT: You ({agent_name}) should hand off to {result.redirect_to}")
            print(f"Reason: {result.redirect_reason}")
            print("=" * 60)

        if json_output:
            _build_json_result(result, tier, agent_name, root)
            print(json.dumps(result.to_dict(), indent=2))

        return 0

    return 0


def prime(
    agent_name: str | None = None,
    minimal: bool = False,
    full: bool = False,
    quiet: bool = False,
    json_output: bool = False,
    no_persona: bool = False,
    no_workflow: bool = False,
    no_register: bool = False,
    session_id: str | None = None,
    project_root: Path | None = None,
    tier: str | None = None,
    greeting: bool = False,
) -> int:
    """Load and print context.

    Loads context in priority order (optimized for attention):
    1. Workflow State (HIGHEST PRIORITY - routing decision)
    2. Agent definition
    3. Persona (character voice)
    4. Behavior guide
    5. Crew manifest (handoff reference)
    6. Sprint context
    7. Session context (header + last assessment)
    8. Sidecars (patterns, gotchas, decisions)
    9. Domain docs (--full only)
    10. Redirect marker (if wrong agent)

    Context tiers (--tier):
    - FULL: All components (~4000 tokens) - default
    - REFRESH: Dynamic state only (~600 tokens)
    - HANDOFF: Agent essentials (~700 tokens)
    - MINIMAL: Routing only (~200 tokens)

    Args:
        agent_name: Name of agent to load context for
        minimal: If True, skip all context (fastest)
        full: If True, include domain docs
        quiet: If True, suppress section headers
        json_output: If True, output JSON instead of text
        no_persona: If True, skip persona loading
        no_workflow: If True, skip workflow detection
        no_register: If True, skip session registration
        session_id: Explicit session ID (generated if not provided)
        project_root: Project root path (auto-detected if not provided)
        tier: Context tier level (FULL, REFRESH, HANDOFF, MINIMAL)

    Returns:
        Exit code (0 for success)
    """
    # Stop immediately for minimal mode
    if minimal:
        if json_output:
            print(json.dumps({"minimal": True}))
        return 0

    root = project_root or get_project_root()

    # Run config migration (upgrade path — consolidate legacy config files)
    from pf.config_migration import migrate_config

    migrate_config(root)

    # Build result for JSON output
    result = PrimeResult(agent_name=agent_name or "")

    # Parse tier if specified
    context_tier: ContextTier | None = None
    if tier:
        try:
            context_tier = tier_from_string(tier)
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1

    # ==========================================================================
    # TIERED CONTEXT PATH (REFRESH, HANDOFF, MINIMAL)
    # ==========================================================================
    if context_tier and context_tier != ContextTier.FULL:
        return _prime_tiered(
            agent_name=agent_name,
            tier=context_tier,
            quiet=quiet,
            json_output=json_output,
            no_workflow=no_workflow,
            no_register=no_register,
            session_id=session_id,
            root=root,
            result=result,
            greeting=greeting,
        )

    # ==========================================================================
    # Session registration (if enabled)
    # ==========================================================================
    if agent_name and not no_register:
        # Clean up old sessions first
        cleanup_old_sessions(root)
        # Register this session
        session_info = register_session(agent_name, session_id, root)
        result.session_id = session_info.session_id

    # ==========================================================================
    # PRIORITY 1: Workflow State (HIGHEST ATTENTION ZONE - routing decision)
    # ==========================================================================
    if not no_workflow:
        workflow_status = detect_workflow_state(root)
        result.workflow_status = workflow_status

        # Check for redirect
        if agent_name and workflow_status.state == WorkflowState.IN_PROGRESS_STATE:
            redirect = check_redirect(workflow_status, agent_name)
            if redirect:
                result.redirect_to, result.redirect_reason = redirect

        if not json_output:
            _print_header("Workflow State", quiet)
            print(_format_workflow_state_text(result))

    # ==========================================================================
    # PRIORITY 2: Agent definition
    # ==========================================================================
    if agent_name:
        agent_content = load_agent_definition(agent_name, root)
        if agent_content is None:
            # Agent not found - exit with error
            if json_output:
                print(json.dumps({"error": f"Agent '{agent_name}' not found"}))
            else:
                print(f"Error: Agent '{agent_name}' not found", file=sys.stderr)
            return 1
        if not json_output:
            _print_header(f"Agent Definition: {agent_name}", quiet)
            print(agent_content)

    # ==========================================================================
    # PRIORITY 2.5: SOUL.md project principles (optional)
    # ==========================================================================
    if not json_output:
        soul_content = load_soul(root)
        if soul_content:
            _print_header("Project Principles (SOUL.md)", quiet)
            print(soul_content)

    # ==========================================================================
    # PRIORITY 2.6: Output Style (optional)
    # ==========================================================================
    if not json_output:
        style_result = load_output_style(root)
        if style_result:
            style_name, style_content = style_result
            _print_header(f"Output Style: {style_name}", quiet)
            print(style_content)

    # ==========================================================================
    # PRIORITY 3: Persona (if enabled)
    # ==========================================================================
    if agent_name and not no_persona and is_character_voice_enabled(root):
        persona, theme = load_persona(agent_name, root)
        if persona and theme:
            result.persona = persona
            result.theme = theme

            if not json_output:
                crew = get_crew_manifest(root)
                result.crew = crew
                user_title = get_user_title(root)
                _print_header(f"Persona: {persona.character} ({agent_name})", quiet)
                print(format_persona_output(persona, theme, agent_name, crew, user_title))

    # Greeting: visible to user via stderr (bypasses stdout capture in hooks)
    if greeting and agent_name:
        _emit_greeting(agent_name, result.persona, root)

    # Emit agent_start event to BikeRack (Story 143-16)
    if agent_name:
        try:
            from pf.wheelhub.subagent_events import emit_subagent_event

            ws = result.workflow_status
            emit_subagent_event(
                "agent_start",
                agent=agent_name,
                story_id=ws.story_id if ws else "",
                workflow=ws.workflow if ws else "",
                phase=ws.phase if ws else "",
            )
        except Exception:
            pass

    # ==========================================================================
    # PRIORITY 4: Agent behavior guide
    # ==========================================================================
    if agent_name and not json_output:
        guide_content = load_behavior_guide(root)
        if guide_content:
            _print_header("Agent Behavior Guide", quiet)
            print(guide_content)

    # ==========================================================================
    # PRIORITY 4b: Team mode guide (only when workflow phase has team: block)
    # ==========================================================================
    if agent_name and not json_output and result.workflow_status:
        ws = result.workflow_status
        if ws.workflow and ws.phase:
            team_config = get_phase_team_config(ws.workflow, ws.phase, root)
            if team_config:
                team_guide = load_team_mode_guide(root)
                if team_guide:
                    _print_header("Team Mode Guide", quiet)
                    print(team_guide)

    # ==========================================================================
    # PRIORITY 4c: Gate recovery guide (only when phase gate has recovery config)
    # ==========================================================================
    if agent_name and not json_output and result.workflow_status:
        ws = result.workflow_status
        if ws.workflow and ws.phase:
            if get_phase_gate_recovery(ws.workflow, ws.phase, root):
                gate_guide = load_gate_recovery_guide(root)
                if gate_guide:
                    _print_header("Gate Recovery Guide", quiet)
                    print(gate_guide)

    # ==========================================================================
    # PRIORITY 5: Sprint context
    # ==========================================================================
    if not json_output:
        sprint_content = load_sprint_context(root)
        if sprint_content:
            _print_header("Sprint Context", quiet)
            print(sprint_content)

    # ==========================================================================
    # PRIORITY 5.5: Repos Topology
    # ==========================================================================
    if not json_output:
        from pf.prime.loader import load_repos_topology

        topology_content = load_repos_topology(root)
        if topology_content:
            _print_header("Repos Topology", quiet)
            print(topology_content)

    # ==========================================================================
    # PRIORITY 6: Session context
    # ==========================================================================
    if not json_output:
        session_result = load_session_context(root)
        if session_result:
            filename, header, assessment = session_result
            _print_header(f"Active Session: {filename}", quiet)

            # Print header
            if header:
                print(header)

            # Print last assessment with separator
            if assessment:
                print()
                print("---")
                print(assessment)

    # ==========================================================================
    # PRIORITY 7: Sidecars (LOWEST PRIORITY)
    # ==========================================================================
    if agent_name and not json_output:
        sidecars = load_sidecars(agent_name, root)
        for filename, content in sidecars.items():
            _print_header(f"Agent Sidecar: {filename}", quiet)
            print(content)

    # ==========================================================================
    # PRIORITY 8: Domain docs (--full only)
    # ==========================================================================
    if full and not json_output:
        domain_docs = load_domain_docs(root)
        for filename, content in domain_docs:
            _print_header(filename, quiet)
            print(content)

    # ==========================================================================
    # PRIORITY 9: Redirect marker (if wrong agent activated)
    # ==========================================================================
    if result.redirect_to and not json_output:
        print()
        print("=" * 60)
        print(f"REDIRECT: You ({agent_name}) should hand off to {result.redirect_to}")
        print(f"Reason: {result.redirect_reason}")
        print("=" * 60)

    # ==========================================================================
    # JSON output
    # ==========================================================================
    if json_output:
        _build_json_result(result, context_tier or ContextTier.FULL, agent_name, root)
        print(json.dumps(result.to_dict(), indent=2))

    return 0


def main(args: list[str] | None = None) -> int:
    """CLI entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code
    """
    parser = argparse.ArgumentParser(
        prog="prime",
        description="Unified agent bootstrap for Pennyfarthing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Loads context in priority order (optimized for attention):
  1. Workflow State (HIGHEST - routing decision)
  2. Agent definition
  3. Persona (character voice)
  4. Behavior guide
  5. Crew manifest (handoff reference)
  6. Sprint context
  7. Session context (header + last assessment)
  8. Sidecars (patterns, gotchas, decisions)
  9. Domain docs (--full only)
  10. Redirect marker (if wrong agent)

Examples:
    prime --agent sm
    prime --agent dev --json
    prime --agent tea --full
    prime --minimal
    prime --quiet --agent sm
    prime --agent dev --no-persona
    prime --agent dev --session-id abc123
""",
    )

    parser.add_argument(
        "--agent",
        metavar="NAME",
        help="Load agent definition and sidecar",
    )
    parser.add_argument(
        "--minimal",
        action="store_true",
        help="Skip all context (fastest)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Include domain docs from .claude/project/",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress section headers",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output JSON (for Cyclist integration)",
    )
    parser.add_argument(
        "--no-persona",
        action="store_true",
        help="Skip persona loading (disable character voice)",
    )
    parser.add_argument(
        "--no-workflow",
        action="store_true",
        help="Skip workflow state detection",
    )
    parser.add_argument(
        "--no-register",
        action="store_true",
        help="Skip session registration",
    )
    parser.add_argument(
        "--session-id",
        metavar="ID",
        help="Use explicit session ID",
    )
    parser.add_argument(
        "--tier",
        metavar="TIER",
        type=lambda x: x.upper(),
        choices=["FULL", "REFRESH", "HANDOFF", "MINIMAL"],
        help="Context tier: FULL (~4000 tokens), REFRESH (~600), HANDOFF (~700), MINIMAL (~200)",
    )
    parser.add_argument(
        "--greeting",
        action="store_true",
        help="Emit agent greeting to stderr",
    )

    parsed = parser.parse_args(args)

    try:
        return prime(
            agent_name=parsed.agent,
            minimal=parsed.minimal,
            full=parsed.full,
            quiet=parsed.quiet,
            json_output=parsed.json_output,
            no_persona=parsed.no_persona,
            no_workflow=parsed.no_workflow,
            no_register=parsed.no_register,
            session_id=parsed.session_id,
            tier=parsed.tier,
            greeting=parsed.greeting,
        )
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())


# ---------------------------------------------------------------------------
# Click command for `pf prime` registration
# ---------------------------------------------------------------------------
try:
    import click

    @click.command("prime")
    @click.argument("name", required=False)
    @click.option("--session-id", help="Use explicit session ID")
    @click.option("--no-persona", is_flag=True, help="Skip persona loading")
    @click.option("--json", "output_json", is_flag=True, help="Output as JSON")
    @click.option("--minimal", is_flag=True, help="Skip all context (fastest)")
    @click.option("--full", is_flag=True, help="Include domain docs")
    @click.option("--quiet", is_flag=True, help="Suppress section headers")
    @click.option("--greeting", is_flag=True, help="Emit agent greeting to stderr")
    @click.option(
        "--tier",
        type=click.Choice(["full", "refresh", "handoff", "minimal"], case_sensitive=False),
        help="Context tier level",
    )
    def prime_cmd(
        name: str | None,
        session_id: str | None,
        no_persona: bool,
        output_json: bool,
        minimal: bool,
        full: bool,
        quiet: bool,
        greeting: bool,
        tier: str | None,
    ):
        """Load agent context (unified bootstrap).

        Equivalent to `pf agent start` — loads agent definition, persona,
        behavior guide, sprint context, session context, and sidecar memory.

        \b
        Arguments:
          NAME  - Agent name (sm, tea, dev, reviewer, etc.)
        """
        exit_code = prime(
            agent_name=name,
            session_id=session_id,
            no_persona=no_persona,
            json_output=output_json,
            minimal=minimal,
            full=full,
            quiet=quiet,
            greeting=greeting,
            tier=tier,
        )
        raise SystemExit(exit_code)

except ImportError:
    # Click not available — CLI registration skipped (argparse fallback still works)
    pass
