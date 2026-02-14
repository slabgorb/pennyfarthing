"""Base panel abstraction for BikeRack TUI.

Story 103-5: Base panel class that panels inherit from. Handles:
subscribe to WebSocket channel by key, receive JSON payload, call
render method, display Rich output in main content area.
"""

from __future__ import annotations

from typing import Any

from textual.widgets import Static

# Nerd Font icon registry: panel_name → (nerd_font_icon, ascii_fallback)
PANEL_ICONS: dict[str, tuple[str, str]] = {
    "sprint": ("\uf0e7", "#"),       # nf-fa-bolt
    "git": ("\ue725", "G"),          # nf-dev-git_branch
    "diffs": ("\uf440", "D"),        # nf-oct-diff
    "todo": ("\uf046", "T"),         # nf-fa-check_square_o
    "workflow": ("\uf126", "W"),     # nf-fa-code_fork
    "background": ("\uf110", "B"),   # nf-fa-spinner
    "audit-log": ("\uf15c", "L"),    # nf-fa-file_text
    "changed": ("\uf044", "C"),      # nf-fa-pencil_square_o
    "ac": ("\uf00c", "A"),           # nf-fa-check
    "debug": ("\uf188", "d"),        # nf-fa-bug
    "settings": ("\uf013", "S"),     # nf-fa-gear
    "tty": ("\uf120", ">"),          # nf-fa-terminal
}


def get_panel_icon(panel_name: str, use_nerd_font: bool = True) -> str:
    """Return icon for a panel name.

    Args:
        panel_name: Panel identifier (e.g. "sprint", "git").
        use_nerd_font: If True, return Nerd Font glyph; otherwise ASCII fallback.

    Returns:
        Icon string, or empty string if panel_name is unknown.
    """
    entry = PANEL_ICONS.get(panel_name)
    if entry is None:
        return ""
    return entry[0] if use_nerd_font else entry[1]


class BasePanel(Static):
    """Base class for BikeRack TUI panels.

    Subclasses set ``channel`` as a class attribute and implement
    ``render_panel(payload)`` to return a Rich renderable.
    """

    #: WebSocket channel this panel subscribes to (override in subclass)
    channel: str = ""

    #: Human-readable panel name shown in header chrome
    panel_name: str = ""

    #: Nerd Font icon for this panel type (with ASCII fallback)
    icon: str = ""

    def __init__(self, client=None, **kwargs):
        super().__init__(**kwargs)
        self._client = client
        self._last_payload: dict[str, Any] | None = None
        self._mounted = False

    def on_mount(self) -> None:
        """Subscribe to channel via client on mount."""
        self._mounted = True
        if self._client is not None and self.channel:
            self._client.subscribe(self.channel, self.handle_message)

    def on_unmount(self) -> None:
        """Mark panel as unmounted — messages ignored after this."""
        self._mounted = False

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming WebSocket message.

        Stores payload, calls render_panel, updates widget display.
        No-op after unmount or if message is None.
        """
        if not self._mounted or message is None:
            return
        self._last_payload = message
        rendered = self.render_panel(message)
        try:
            self.update(rendered)
        except Exception:
            pass

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render panel content from payload.

        Subclasses override this to return Rich renderables
        (Table, Tree, Text, etc.).
        """
        raise NotImplementedError("Subclasses must implement render_panel()")
