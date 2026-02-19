"""
Preflight CLI - Fan-out CLI for preflight checks.

Usage:
    python -m pf.preflight <subcommand> [args]

Subcommands:
    finish      Run finish preflight checks
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from pf.preflight.finish import run_finish_preflight


def finish(args: list[str]) -> int:
    """Run finish preflight checks."""
    parser = argparse.ArgumentParser(
        prog="preflight finish",
        description="Run finish preflight checks in parallel",
    )
    parser.add_argument(
        "story_id",
        help="Story identifier (e.g., 31-10)",
    )
    parser.add_argument(
        "--branch", "-b",
        required=True,
        help="Feature branch name",
    )
    parser.add_argument(
        "--jira", "-j",
        help="Jira issue key (optional, skips Jira checks if absent)",
    )
    parser.add_argument(
        "--repo", "-r",
        help="Repository name for PR lookup (optional)",
    )
    parser.add_argument(
        "--project-root", "-p",
        type=Path,
        help="Project root path (defaults to cwd)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "yaml"],
        default="json",
        help="Output format (default: json)",
    )

    parsed = parser.parse_args(args)

    # Run async preflight
    result = asyncio.run(run_finish_preflight(
        story_id=parsed.story_id,
        branch=parsed.branch,
        jira_key=parsed.jira,
        repo=parsed.repo,
        project_root=parsed.project_root,
    ))

    # Output result
    result_dict = result.to_dict()

    if parsed.format == "yaml":
        try:
            import yaml
            print(yaml.dump(result_dict, default_flow_style=False, sort_keys=False))
        except ImportError:
            print("YAML output requires PyYAML. Falling back to JSON.", file=sys.stderr)
            print(json.dumps(result_dict, indent=2))
    else:
        print(json.dumps(result_dict, indent=2))

    # Return non-zero if not ready to finish
    return 0 if result.ready_to_finish else 1


# Subcommand registry
SUBCOMMANDS = {
    "finish": finish,
}


def cli(args: list[str] | None = None) -> int:
    """Main CLI entry point."""
    if args is None:
        args = sys.argv[1:]

    parser = argparse.ArgumentParser(
        prog="preflight",
        description="Preflight checks for Pennyfarthing workflows",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subcommands:
    finish <story_id> --branch <branch> [--jira <key>]
        Run finish preflight checks in parallel

Examples:
    preflight finish 31-10 --branch feat/31-10-feature --jira MSSCI-12345
    preflight finish 63-9 -b feat/63-9-fanout -j MSSCI-12413 -f yaml
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
