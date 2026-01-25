"""
Sprint CLI - Fan-out CLI for sprint operations.

Usage:
    python -m pennyfarthing_scripts.sprint <subcommand> [args]

Subcommands:
    status      Show sprint status
    backlog     Show available stories
    work        Start work on a story
    archive     Archive a completed story
"""

import argparse
import sys


def status(args: list[str]) -> int:
    """Show sprint status."""
    from pennyfarthing_scripts.sprint.status import main as status_main
    return status_main(args)


def backlog(args: list[str]) -> int:
    """Show available stories."""
    from pennyfarthing_scripts.sprint.loader import get_stories_by_status

    stories = get_stories_by_status("backlog")
    print(f"Backlog: {len(stories)} stories")
    print("")
    for story in stories:
        priority = story.get("priority", "P2")
        points = story.get("points", "?")
        print(f"  [{priority}] {story.get('id')}: {story.get('title')} [{points}pts]")
    return 0


def work(args: list[str]) -> int:
    """Start work on a story."""
    from pennyfarthing_scripts.sprint.work import main as work_main
    return work_main(args)


def archive(args: list[str]) -> int:
    """Archive a completed story."""
    from pennyfarthing_scripts.sprint.archive import main as archive_main
    return archive_main(args)


# Subcommand registry
SUBCOMMANDS = {
    "status": status,
    "backlog": backlog,
    "work": work,
    "archive": archive,
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
        prog="sprint",
        description="Sprint CLI for Pennyfarthing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subcommands:
    status [filter]     Show sprint status (optional filter: backlog, in-progress, done)
    backlog             Show available stories
    work [story-id]     Start work on a story (or show available)
    archive <id> [pr]   Archive a completed story

Examples:
    sprint status
    sprint status in-progress
    sprint backlog
    sprint work MSSCI-12345
    sprint work next
    sprint archive 63-7 489
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
        # Default to status
        return status([])

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
