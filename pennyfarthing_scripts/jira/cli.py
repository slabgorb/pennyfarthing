"""
Jira CLI - Fan-out CLI for Jira operations.

Usage:
    python -m pennyfarthing_scripts.jira <subcommand> [args]

Subcommands:
    view        View issue details
    claim       Claim a story
    sync        Sync epic to Jira
    bidirectional   Bidirectional sync
    create      Create epic or story
"""

import argparse
import sys
from typing import Any


def view(args: list[str]) -> int:
    """View issue details."""
    import subprocess

    if not args:
        print("Usage: jira view <issue-key>", file=sys.stderr)
        return 1

    result = subprocess.run(
        ["jira", "issue", "view", args[0]],
        capture_output=False,
    )
    return result.returncode


def claim(args: list[str]) -> int:
    """Claim a story."""
    from pennyfarthing_scripts.jira.claim import main as claim_main
    return claim_main(args)


def sync(args: list[str]) -> int:
    """Sync epic to Jira."""
    from pennyfarthing_scripts.jira.sync import main as sync_main
    return sync_main(args)


def bidirectional(args: list[str]) -> int:
    """Bidirectional sync."""
    from pennyfarthing_scripts.jira.bidirectional import main as bidirectional_main
    return bidirectional_main(args)


def create(args: list[str]) -> int:
    """Create epic or story."""
    if not args:
        print("Usage: jira create <epic|story> [args]", file=sys.stderr)
        return 1

    subcommand = args[0]
    remaining = args[1:]

    if subcommand == "epic":
        from pennyfarthing_scripts.jira.epic import main as epic_main
        return epic_main(remaining)
    elif subcommand == "story":
        from pennyfarthing_scripts.jira.story import main as story_main
        return story_main(remaining)
    else:
        print(f"Unknown create subcommand: {subcommand}", file=sys.stderr)
        print("Usage: jira create <epic|story> [args]", file=sys.stderr)
        return 1


# Subcommand registry
SUBCOMMANDS = {
    "view": view,
    "claim": claim,
    "sync": sync,
    "bidirectional": bidirectional,
    "create": create,
}


def cli(args: list[str] | None = None) -> int:
    """Main CLI entry point.

    Args:
        args: Command line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code
    """
    if args is None:
        args = sys.argv[1:]

    parser = argparse.ArgumentParser(
        prog="jira",
        description="Jira CLI for Pennyfarthing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subcommands:
    view <key>              View issue details
    claim <key> [--claim]   Check/claim a story
    sync <epic> [opts]      Sync epic to Jira
    bidirectional [opts]    Bidirectional sync
    create epic <id>        Create epic from YAML
    create story <key>      Sync single story

Examples:
    jira view MSSCI-12345
    jira claim MSSCI-12345 --claim
    jira sync 63 --transition --points
    jira bidirectional --all --dry-run
    jira create epic epic-63
""",
    )

    parser.add_argument(
        "subcommand",
        nargs="?",
        choices=list(SUBCOMMANDS.keys()),
        help="Subcommand to run",
    )
    parser.add_argument(
        "args",
        nargs=argparse.REMAINDER,
        help="Arguments for subcommand",
    )

    parsed = parser.parse_args(args)

    if not parsed.subcommand:
        parser.print_help()
        return 0

    handler = SUBCOMMANDS.get(parsed.subcommand)
    if handler:
        return handler(parsed.args)
    else:
        print(f"Unknown subcommand: {parsed.subcommand}", file=sys.stderr)
        return 1


def main(args: list[str] | None = None) -> int:
    """Alias for cli()."""
    return cli(args)


if __name__ == "__main__":
    sys.exit(cli())
