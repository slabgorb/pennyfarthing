"""Cross-panel event bus for Frame TUI TUI (Story 110-1).

Defines Textual Message subclasses for inter-panel communication.
"""

from __future__ import annotations

from textual.message import Message


class PanelEvent(Message):
    """Base message class for cross-panel communication."""

    pass


class NavigateToFile(PanelEvent):
    """Navigate to a specific file in the diffs panel."""

    def __init__(self, path: str) -> None:
        super().__init__()
        self.path = path
