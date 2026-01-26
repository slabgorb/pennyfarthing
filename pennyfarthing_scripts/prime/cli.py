"""
Prime CLI - Load essential project context at agent activation.

Usage:
    python -m pennyfarthing_scripts.prime [options]

Options:
    --agent <name>  Load agent definition and sidecar
    --minimal       Skip all context (fastest)
    --full          Include domain docs from .claude/project/
    --quiet         Suppress section headers
"""

from __future__ import annotations

import argparse
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


def _print_header(title: str, quiet: bool) -> None:
    """Print section header (respects quiet mode).

    Args:
        title: Header title
        quiet: If True, suppress output
    """
    if not quiet:
        print()
        print(f"# {title}")


def prime(
    agent_name: str | None = None,
    minimal: bool = False,
    full: bool = False,
    quiet: bool = False,
    project_root: Path | None = None,
) -> int:
    """Load and print context.

    Loads context in priority order (optimized for attention):
    1. Agent definition (HIGHEST PRIORITY)
    2. Behavior guide
    3. Sprint context
    4. Session context (header + last assessment)
    5. Sidecars (patterns, gotchas, decisions - LOWEST PRIORITY)
    6. Domain docs (--full only)

    Args:
        agent_name: Name of agent to load context for
        minimal: If True, skip all context (fastest)
        full: If True, include domain docs
        quiet: If True, suppress section headers
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Exit code (0 for success)
    """
    # Stop immediately for minimal mode
    if minimal:
        return 0

    root = project_root or get_project_root()

    # ==========================================================================
    # PRIORITY 1: Agent definition (HIGHEST ATTENTION ZONE)
    # ==========================================================================
    if agent_name:
        agent_content = load_agent_definition(agent_name, root)
        if agent_content:
            _print_header(f"Agent Definition: {agent_name}", quiet)
            print(agent_content)

    # ==========================================================================
    # PRIORITY 2: Agent behavior guide
    # ==========================================================================
    if agent_name:
        guide_content = load_behavior_guide(root)
        if guide_content:
            _print_header("Agent Behavior Guide", quiet)
            print(guide_content)

    # ==========================================================================
    # PRIORITY 3: Sprint context
    # ==========================================================================
    sprint_content = load_sprint_context(root)
    if sprint_content:
        _print_header("Sprint Context", quiet)
        print(sprint_content)

    # ==========================================================================
    # PRIORITY 4: Session context
    # ==========================================================================
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
    # PRIORITY 5: Sidecars (LOWEST PRIORITY)
    # ==========================================================================
    if agent_name:
        sidecars = load_sidecars(agent_name, root)
        for filename, content in sidecars.items():
            _print_header(f"Agent Sidecar: {filename}", quiet)
            print(content)

    # ==========================================================================
    # PRIORITY 6: Domain docs (--full only)
    # ==========================================================================
    if full:
        domain_docs = load_domain_docs(root)
        for filename, content in domain_docs:
            _print_header(filename, quiet)
            print(content)

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
        description="Load essential project context at agent activation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Loads context in priority order (optimized for attention):
  1. Agent definition (HIGHEST PRIORITY)
  2. Behavior guide
  3. Sprint context
  4. Session context (header + last assessment)
  5. Sidecars (patterns, gotchas, decisions - LOWEST)
  6. Domain docs (--full only)

Examples:
    prime --agent dev
    prime --agent tea --full
    prime --minimal
    prime --quiet --agent sm
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

    parsed = parser.parse_args(args)

    try:
        return prime(
            agent_name=parsed.agent,
            minimal=parsed.minimal,
            full=parsed.full,
            quiet=parsed.quiet,
        )
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
