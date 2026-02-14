"""BikeRack TUI — Terminal-native dashboard built on Textual.

Story 103-1: Textual app scaffold with basic layout.
Story 103-4: Connection status indicator in TUI header.
Story 103-6: SprintPanel as default panel on launch.
Story 103-7: /bc TUI panel focus — subscribe to /ws/focus, switch panels.
Story 103-9: Panel header chrome — icon + name indicator for active panel.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.reactive import reactive
from textual.widgets import Footer, Header, Static

from pennyfarthing_scripts.bc.focus import get_last_panel, save_last_panel
from pennyfarthing_scripts.bikerack.base_panel import get_panel_icon
from pennyfarthing_scripts.bikerack.sprint_panel import SprintPanel
from pennyfarthing_scripts.bikerack.ws_client import ConnectionState, WheelHubClient

STATE_DISPLAY: dict[ConnectionState, str] = {
    ConnectionState.CONNECTED: "[green]● Connected[/green]",
    ConnectionState.DISCONNECTED: "[red]● Disconnected[/red]",
    ConnectionState.RECONNECTING: "[yellow]● Reconnecting…[/yellow]",
    ConnectionState.CONNECTING: "[yellow]● Connecting…[/yellow]",
}

# Human-readable display names for panels
PANEL_DISPLAY_NAMES: dict[str, str] = {
    "sprint": "Sprint",
    "git": "Git",
    "diffs": "Diffs",
    "todo": "Todo",
    "workflow": "Workflow",
    "background": "Background",
    "audit-log": "Audit Log",
    "changed": "Changed",
    "ac": "Acceptance Criteria",
    "debug": "Debug",
    "settings": "Settings",
    "tty": "TTY",
}


class PanelIndicator(Static):
    """Displays the active panel's Nerd Font icon and name."""

    panel_key: reactive[str] = reactive("sprint")

    def watch_panel_key(self, key: str) -> None:
        """Update display when the active panel changes."""
        icon = get_panel_icon(key)
        name = PANEL_DISPLAY_NAMES.get(key, key.title())
        if icon:
            self.update(f"[bold]{icon} {name}[/bold]")
        else:
            self.update(f"[bold]{name}[/bold]")


class ConnectionStatus(Static):
    """Displays WheelHub connection state with colored indicator."""

    connection_state: reactive[ConnectionState] = reactive(
        ConnectionState.DISCONNECTED
    )

    def watch_connection_state(self, state: ConnectionState) -> None:
        """Update display when connection state changes."""
        self.update(STATE_DISPLAY.get(state, "● Unknown"))


class BikeRackApp(App):
    """BikeRack TUI application shell."""

    TITLE = "BikeRack"

    BINDINGS = [
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, client=None, **kwargs):
        super().__init__(**kwargs)
        self._client = client
        self._focused_panel: str | None = None
        self._previous_panel: str | None = None

    def compose(self) -> ComposeResult:
        yield Header()
        yield PanelIndicator(id="panel-indicator")
        yield ConnectionStatus(
            STATE_DISPLAY[ConnectionState.DISCONNECTED],
            id="connection-status",
        )
        with VerticalScroll(id="main-content"):
            yield SprintPanel(client=self._client, id="sprint-panel")
        yield Footer()

    async def on_mount(self) -> None:
        result = get_last_panel()
        if result.get("success") and result.get("last_panel"):
            self._focused_panel = result["last_panel"]

        # Set initial panel indicator
        self._update_panel_indicator(self._focused_panel or "sprint")

        if self._client is not None:
            self._client.on_state_change(self._on_ws_state_change)
            self._client.subscribe("focus", self._handle_focus_message)
            self.run_worker(self._client.connect(), exclusive=True, name="ws-client")

    def _update_panel_indicator(self, panel_key: str) -> None:
        """Update the panel indicator widget with the given panel key."""
        try:
            indicator = self.query_one("#panel-indicator", PanelIndicator)
            indicator.panel_key = panel_key
        except Exception:
            pass

    def _handle_focus_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming focus channel messages.

        Expected format: {type: 'init'|'update', focus: '<panel>'|null}
        Only 'update' messages trigger panel switches (matching React hook).
        """
        if message is None or not isinstance(message, dict):
            return
        if message.get("type") != "update":
            return
        if "focus" not in message:
            return

        focus = message["focus"]
        if focus is not None:
            self._previous_panel = self._focused_panel
            self._focused_panel = focus
            save_last_panel(focus, project_dir=None)
            self._update_panel_indicator(focus)
        else:
            self._focused_panel = None
            self._previous_panel = None

    def _on_ws_state_change(self, state: ConnectionState) -> None:
        """Handle WheelHub connection state changes."""
        try:
            widget = self.query_one("#connection-status", ConnectionStatus)
            widget.connection_state = state
        except Exception:
            pass


DEFAULT_PORT = 2898


def main(port: int | None = None, project_dir: Path | None = None) -> None:
    """Launch BikeRack TUI as a standalone application.

    Args:
        port: Explicit WheelHub port. If None, reads from .bikerack-port file.
        project_dir: Project directory for port file discovery. Defaults to cwd.
    """
    if port is None:
        if project_dir is not None:
            port_file = project_dir / ".bikerack-port"
            if port_file.exists():
                try:
                    port = int(port_file.read_text().strip())
                except (ValueError, OSError):
                    port = DEFAULT_PORT
            else:
                port = DEFAULT_PORT
        else:
            port = DEFAULT_PORT

    client = WheelHubClient(port=port)
    app = BikeRackApp(client=client)
    app.run()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BikeRack TUI")
    parser.add_argument("--port", type=int, default=None, help="WheelHub port")
    parser.add_argument("--project-dir", type=str, default=None, help="Project directory")
    args = parser.parse_args()

    project_dir = Path(args.project_dir) if args.project_dir else None
    main(port=args.port, project_dir=project_dir)
