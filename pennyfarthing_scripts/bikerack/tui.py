"""BikeRack TUI — Terminal-native dashboard built on Textual.

Story 103-1: Textual app scaffold with basic layout.
"""

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import VerticalScroll
from textual.widgets import Footer, Header, Static


class BikeRackApp(App):
    """BikeRack TUI application shell."""

    TITLE = "BikeRack"

    BINDINGS = [
        Binding("q", "quit", "Quit"),
    ]

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("● Disconnected", id="connection-status")
        with VerticalScroll(id="main-content"):
            yield Static("No active panel", id="placeholder")
        yield Footer()
