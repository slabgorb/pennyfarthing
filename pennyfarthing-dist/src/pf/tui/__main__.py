"""Entry point for ``python -m pf.tui``.

Delegates to :func:`pf.tui.app.main` so terminal setup — image-protocol
detection and the tmux Kitty-graphics DCS-passthrough patch — is applied the
same way as ``pf launch tui --foreground``. A bare ``TuiApp().run()`` skipped
all of it, so portraits leaked raw kitty escapes under tmux, and --port /
--project-dir were ignored.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pf.tui import app


def main() -> None:
    parser = argparse.ArgumentParser(prog="pf.tui", description="Launch the Frame TUI.")
    parser.add_argument("--port", type=int, default=None, help="Frame port")
    parser.add_argument("--project-dir", type=Path, default=None, help="Project directory")
    args = parser.parse_args()
    app.main(port=args.port, project_dir=args.project_dir)


if __name__ == "__main__":
    main()
