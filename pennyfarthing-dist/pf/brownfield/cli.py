"""
Brownfield CLI - Analyze existing codebases.

Usage:
    python -m pf.brownfield <subcommand> [args]

Subcommands:
    scan        Scan codebase and generate documentation
"""

import argparse
import asyncio
import sys
from pathlib import Path

from pf.brownfield.discover import (
    DepthLevel,
    discover,
)


def scan(args: list[str]) -> int:
    """Scan codebase and generate documentation."""
    parser = argparse.ArgumentParser(
        prog="brownfield scan",
        description="Scan codebase and generate AI-ready documentation",
    )
    parser.add_argument(
        "path",
        nargs="?",
        default=".",
        help="Path to scan (default: current directory)",
    )
    parser.add_argument(
        "--depth",
        choices=["quick", "standard", "deep"],
        default="standard",
        help="Scan depth level",
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory for generated docs",
    )

    parsed = parser.parse_args(args)

    path = Path(parsed.path).resolve()
    depth = DepthLevel(parsed.depth)
    output_dir = Path(parsed.output) if parsed.output else None

    result = asyncio.run(discover(path, depth, output_dir))

    if not result.success:
        print(f"Error: {result.error}", file=sys.stderr)
        return 1

    print(f"Discovery complete: {result.project_name}")
    print(f"Type: {result.project_type.value}")
    print(f"Tech stack: {len(result.tech_stack)} items detected")

    return 0


# Subcommand registry
SUBCOMMANDS = {
    "scan": scan,
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
        prog="brownfield",
        description="Brownfield codebase discovery for Pennyfarthing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subcommands:
    scan [path] [opts]      Scan codebase and generate docs

Examples:
    brownfield scan
    brownfield scan /path/to/project
    brownfield scan --depth deep
    brownfield scan . --output docs/brownfield
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
