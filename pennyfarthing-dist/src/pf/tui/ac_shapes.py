"""Acceptance-criteria shape normalization for TUI render paths.

Story 159-11 (gh #131): some projects store ``acceptance_criteria`` as plain
strings (free-text) rather than ``{"text": ..., "done": ...}`` dicts. The TUI
render paths must treat any non-dict AC as not-done and render its own text,
instead of calling ``.get()`` on a ``str`` and crashing inside textual's
``widget._compose``.

This is the single normalization layer shared by ``story_detail_screen`` and
``story_detail_widget`` so the dict-shape assumption lives in exactly one place
(SOUL #2).
"""

from __future__ import annotations

from typing import Any


def ac_is_done(ac: Any) -> bool:
    """Return True only for a dict-form AC explicitly marked done.

    A string (or any non-dict) acceptance criterion has no "done" state, so it
    counts as not done — never raises on a non-dict.
    """
    return isinstance(ac, dict) and bool(ac.get("done"))


def ac_done_count(acs: list[Any]) -> int:
    """Count the done acceptance criteria, tolerating string-form (and any
    non-dict) entries."""
    return sum(1 for ac in acs if ac_is_done(ac))


def ac_label(ac: Any) -> str:
    """Return the display text for an acceptance criterion.

    A string AC is its own label; a dict AC uses its ``text`` field; anything
    else degrades to ``str(ac)`` rather than crashing.
    """
    if isinstance(ac, str):
        return ac
    if isinstance(ac, dict):
        return str(ac.get("text", ""))
    return str(ac)
