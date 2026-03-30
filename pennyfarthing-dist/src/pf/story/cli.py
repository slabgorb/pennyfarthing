"""
Story CLI - Fan-out CLI for story operations.

Usage:
    python -m pf.story <subcommand> [args]

Subcommands:
    size        Show sizing guidelines
    template    Show story templates
    create      Create a new story
"""

import argparse
import sys


def size(args: list[str]) -> int:
    """Show sizing guidelines."""
    from pf.story.size import main as size_main

    return size_main(args)


def template(args: list[str]) -> int:
    """Show story templates."""
    from pf.story.template import main as template_main

    return template_main(args)


def create(args: list[str]) -> int:
    """Create a new story."""
    from pf.story.create import main as create_main

    return create_main(args)


# Subcommand registry
SUBCOMMANDS = {
    "size": size,
    "template": template,
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
        prog="story",
        description="Story CLI for Pennyfarthing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subcommands:
    size [points]       Show sizing guidelines (optionally for specific points)
    template [type]     Show story templates (optionally for specific type)
    create              Create a new story

Examples:
    story size
    story size 3
    story template feature
    story create PROJ-12000 "Add feature" 3 --type feature
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
