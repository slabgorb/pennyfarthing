"""Base panel abstraction for BikeRack TUI.

Story 103-5: Base panel class that panels inherit from. Handles:
subscribe to WebSocket channel by key, receive JSON payload, call
render method, display Rich output in main content area.
"""

from __future__ import annotations

from typing import Any

from rich.text import Text
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
    "progress": ("\uf200", "P"),     # nf-fa-pie_chart
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


def render_progress_bar(percent: int | float, width: int = 20, warn_high: bool = False) -> Text:
    """Render a Unicode progress bar with color based on percentage.

    Args:
        percent: Value 0-100.
        width: Number of bar characters (default 20).
        warn_high: If True, use red at high values (for resource usage).
                   If False (default), use blue at 100% (for completion).

    Returns:
        Rich Text like ``[████████░░░░░░░░░░░░] 22%``
    """
    percent = max(0, min(100, int(percent)))
    filled = round(width * percent / 100)
    empty = width - filled

    if warn_high:
        if percent < 50:
            style = "green"
        elif percent <= 80:
            style = "yellow"
        else:
            style = "red"
    else:
        style = "blue"

    bar = Text()
    bar.append("[")
    bar.append("█" * filled, style=style)
    bar.append("░" * empty, style="dim")
    bar.append(f"] {percent}%")
    return bar


def format_duration(seconds: int | float) -> str:
    """Format seconds into human-friendly duration string.

    Returns:
        ``47s``, ``2m 14s``, ``1h 5m``.
    """
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m"


def humanize_theme(slug: str) -> str:
    """Convert a theme slug to a display name.

    ``princess-bride`` → ``Princess Bride``
    """
    if not slug:
        return ""
    return slug.replace("-", " ").replace("_", " ").title()


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

    def _thread_safe_update(self, content: Any) -> None:
        """Update widget content, safe from both main and worker threads."""
        try:
            self.app.call_from_thread(self.update, content)
        except RuntimeError:
            # Already on the main thread (e.g., in tests)
            self.update(content)

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming WebSocket message.

        Stores payload, calls render_panel, updates widget display.
        Uses thread-safe update since WS handlers may run in a worker thread.
        No-op after unmount or if message is None.
        """
        if not self._mounted or message is None:
            return
        self._last_payload = message
        rendered = self.render_panel(message)
        try:
            self._thread_safe_update(rendered)
        except Exception:
            pass

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render panel content from payload.

        Subclasses override this to return Rich renderables
        (Table, Tree, Text, etc.).
        """
        raise NotImplementedError("Subclasses must implement render_panel()")
