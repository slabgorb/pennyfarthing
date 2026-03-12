"""
Story sizing utilities.

Provides guidelines and helpers for sizing stories.
"""

from typing import Any

# Sizing guidelines
SIZING_GUIDELINES = {
    1: {
        "scale": "Trivial",
        "complexity": "Single file, minimal testing",
        "examples": ["Config change", "Typo fix", "Simple bug fix"],
        "workflow": "trivial",
    },
    2: {
        "scale": "Trivial",
        "complexity": "Few files, some testing",
        "examples": ["Small fix", "Minor enhancement"],
        "workflow": "trivial",
    },
    3: {
        "scale": "Small",
        "complexity": "Few files, some testing",
        "examples": ["Validation", "Single component"],
        "workflow": "tdd",
    },
    5: {
        "scale": "Medium",
        "complexity": "Multiple files, comprehensive testing",
        "examples": ["New page", "API endpoint"],
        "workflow": "tdd",
    },
    8: {
        "scale": "Large",
        "complexity": "Significant scope, extensive testing",
        "examples": ["Integration", "Major refactor"],
        "workflow": "tdd",
    },
    13: {
        "scale": "SPLIT",
        "complexity": "Too complex for single story",
        "examples": ["Break into smaller stories"],
        "workflow": None,
    },
}


def get_sizing_guidelines(points: int | None = None) -> dict[int, dict[str, Any]]:
    """Get sizing guidelines.

    Args:
        points: Optional specific point value to get

    Returns:
        Dict of sizing guidelines
    """
    if points is not None:
        if points in SIZING_GUIDELINES:
            return {points: SIZING_GUIDELINES[points]}
        return {}
    return SIZING_GUIDELINES


def format_size_info(size_info: dict[int, dict[str, Any]]) -> str:
    """Format sizing info as human-readable string.

    Args:
        size_info: Sizing info dict

    Returns:
        Formatted string
    """
    lines = []

    for points, info in sorted(size_info.items()):
        lines.append(f"{points} points - {info['scale']}")
        lines.append(f"  Complexity: {info['complexity']}")
        lines.append(f"  Examples: {', '.join(info['examples'])}")
        if info.get("workflow"):
            lines.append(f"  Workflow: {info['workflow']}")
        lines.append("")

    return "\n".join(lines)


def main(args: list[str] | None = None) -> int:
    """CLI entry point for story size.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse

    parser = argparse.ArgumentParser(description="Story sizing guidelines")
    parser.add_argument("points", nargs="?", type=int, help="Specific point value")

    parsed = parser.parse_args(args)

    guidelines = get_sizing_guidelines(parsed.points)
    print(format_size_info(guidelines))

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
