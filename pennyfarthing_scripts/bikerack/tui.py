"""BikeRack TUI — Terminal-native dashboard built on Textual.

Story 103-1: Textual app scaffold with basic layout.
Story 103-4: Connection status indicator in TUI header.
"""

from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.reactive import reactive
from textual.widgets import Footer, Header, Static

from pennyfarthing_scripts.bikerack.ws_client import ConnectionState


STATE_DISPLAY: dict[ConnectionState, str] = {
    ConnectionState.CONNECTED: "[green]● Connected[/green]",
    ConnectionState.DISCONNECTED: "[red]● Disconnected[/red]",
    ConnectionState.RECONNECTING: "[yellow]● Reconnecting…[/yellow]",
    ConnectionState.CONNECTING: "[yellow]● Connecting…[/yellow]",
}


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

    def compose(self) -> ComposeResult:
        yield Header()
        yield ConnectionStatus(
            STATE_DISPLAY[ConnectionState.DISCONNECTED],
            id="connection-status",
        )
        with VerticalScroll(id="main-content"):
            yield Static("No active panel", id="placeholder")
        yield Footer()

    async def on_mount(self) -> None:
        if self._client is not None:
            self._client.on_state_change(self._on_ws_state_change)
            self.run_worker(self._client.connect(), exclusive=True, name="ws-client")

    def _on_ws_state_change(self, state: ConnectionState) -> None:
        """Handle WheelHub connection state changes."""
        try:
            widget = self.query_one("#connection-status", ConnectionStatus)
            widget.connection_state = state
        except Exception:
            pass
