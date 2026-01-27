"""
Prime CLI - Unified agent bootstrap for Pennyfarthing.

Usage:
    python -m pennyfarthing_scripts.prime [options]

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

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.prime.loader import (
    load_agent_definition,
    load_behavior_guide,
    load_domain_docs,
    load_session_context,
    load_sidecars,
    load_sprint_context,
)
from pennyfarthing_scripts.prime.models import PrimeResult, WorkflowState
from pennyfarthing_scripts.prime.persona import (
    format_persona_output,
    get_crew_manifest,
    get_user_title,
    is_character_voice_enabled,
    load_persona,
)
from pennyfarthing_scripts.prime.session import cleanup_old_sessions, register_session
from pennyfarthing_scripts.prime.workflow import check_redirect, detect_workflow_state


def _print_header(title: str, quiet: bool) -> None:
    """Print section header (respects quiet mode).

    Args:
        title: Header title
        quiet: If True, suppress output
    """
    if not quiet:
        print()
        print(f"# {title}")


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
    if ws.backlog_count > 0:
        lines.append(f"backlog_count: {ws.backlog_count}")

    return "\n".join(lines)


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

    Returns:
        Exit code (0 for success)
    """
    # Stop immediately for minimal mode
    if minimal:
        if json_output:
            print(json.dumps({"minimal": True}))
        return 0

    root = project_root or get_project_root()

    # Build result for JSON output
    result = PrimeResult(agent_name=agent_name or "")

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
        if agent_content and not json_output:
            _print_header(f"Agent Definition: {agent_name}", quiet)
            print(agent_content)

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

    # ==========================================================================
    # PRIORITY 4: Agent behavior guide
    # ==========================================================================
    if agent_name and not json_output:
        guide_content = load_behavior_guide(root)
        if guide_content:
            _print_header("Agent Behavior Guide", quiet)
            print(guide_content)

    # ==========================================================================
    # PRIORITY 5: Sprint context
    # ==========================================================================
    if not json_output:
        sprint_content = load_sprint_context(root)
        if sprint_content:
            _print_header("Sprint Context", quiet)
            print(sprint_content)

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
        )
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
