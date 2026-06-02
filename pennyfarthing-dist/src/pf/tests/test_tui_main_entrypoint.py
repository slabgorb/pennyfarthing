"""`python -m pf.tui` must apply the same terminal setup as `pf launch tui`.

The `__main__` entry is used by the detached launch path (and any direct
`python -m pf.tui` invocation). It must route through `pf.tui.app.main`, which
detects the image protocol and installs the tmux Kitty-graphics DCS-passthrough
patch. A bare `TuiApp().run()` skips all of that, so portraits leak raw kitty
escapes under tmux — and it silently ignored --port/--project-dir too.
"""

from __future__ import annotations

import pf.tui.__main__ as entry


def test_dunder_main_delegates_to_app_main(monkeypatch):
    calls = {}

    def fake_main(port=None, project_dir=None):
        calls["port"] = port
        calls["project_dir"] = project_dir

    monkeypatch.setattr("pf.tui.app.main", fake_main)
    monkeypatch.setattr("sys.argv", ["pf.tui", "--port", "50028"])

    entry.main()

    # Delegated to app.main (which applies the tmux passthrough patch) ...
    assert calls, "python -m pf.tui did not delegate to pf.tui.app.main"
    # ... and parsed the port instead of ignoring it.
    assert calls["port"] == 50028


def test_dunder_main_parses_project_dir(monkeypatch):
    calls = {}
    monkeypatch.setattr(
        "pf.tui.app.main",
        lambda port=None, project_dir=None: calls.update(port=port, project_dir=project_dir),
    )
    monkeypatch.setattr("sys.argv", ["pf.tui", "--project-dir", "/tmp/proj"])

    entry.main()

    assert str(calls["project_dir"]) == "/tmp/proj"
