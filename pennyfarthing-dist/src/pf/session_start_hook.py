"""
Backward-compatibility shim — session start hook moved to hooks/session_start.py.

This file will be removed in a future version.
"""

from pf.hooks.session_start import main  # noqa: F401

if __name__ == "__main__":
    main()
