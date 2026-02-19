"""Cross-panel event bus for BikeRack TUI (Story 110-1).

Defines Textual Message subclasses for inter-panel communication.
First use case: NavigateToFile posted by ChangedPanel, handled by App
to switch to DiffsPanel filtered to that file.
"""

from __future__ import annotations

from textual.message import Message


class PanelEvent(Message):
    """Base message class for cross-panel communication."""

    pass


class NavigateToFile(PanelEvent):
    """Navigate to a specific file in the diffs panel.

    Posted by ChangedPanel when user presses Enter on a selected file.
    Handled by BikeRackApp to switch to DiffsPanel and navigate to that file.
    """

    def __init__(self, path: str) -> None:
        super().__init__()
        self.path = path
