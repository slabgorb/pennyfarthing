"""
Backward-compatibility shim — pretooluse hook moved to hooks/cyclist_pretooluse.py.

This file will be removed in a future version.
"""

from pennyfarthing_scripts.hooks.cyclist_pretooluse import main  # noqa: F401

if __name__ == "__main__":
    main()
