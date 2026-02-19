"""
Backward-compatibility shim — schema validation hook moved to hooks/schema_validation.py.

This file will be removed in a future version.
"""

from pf.hooks.schema_validation import main  # noqa: F401

if __name__ == "__main__":
    main()
