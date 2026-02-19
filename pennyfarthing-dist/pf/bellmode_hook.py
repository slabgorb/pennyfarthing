"""
Backward-compatibility shim — bell mode hook moved to hooks/bell_mode.py.

This file will be removed in a future version.
"""

# Re-export public API from new location for existing tests/imports
from pf.hooks.bell_mode import (  # noqa: F401
    _check_tandem_files as check_tandem_files,
)
from pf.hooks.bell_mode import (
    main,
)


def format_tandem_message(persona_name: str, observation_text: str) -> str:
    """Format a tandem observation as a bell mode injection message."""
    return f"[Tandem] {persona_name}: {observation_text}"


if __name__ == "__main__":
    main()
