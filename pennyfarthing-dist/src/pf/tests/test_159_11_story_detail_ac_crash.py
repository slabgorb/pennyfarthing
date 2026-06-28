"""RED tests for story 159-11 — StoryDetailScreen crashes on string-form ACs (gh #131).

Bug: ``StoryDetailScreen.compose`` counts done ACs with
``sum(1 for ac in acs if ac.get("done"))`` (story_detail_screen.py:187), which
assumes every acceptance criterion is a dict shaped ``{"text": ..., "done": ...}``.
Some projects store ``acceptance_criteria`` as a list of plain strings (free-text),
so ``.get()`` is called on a ``str`` and raises
``AttributeError: 'str' object has no attribute 'get'`` inside textual's
``widget._compose`` — blanking the whole detail screen the moment the user drills
into such a story.

Root cause is a data-shape mismatch in the render layer, NOT input sanitization.
The fix must normalize AC shape: a string AC simply has no "done" state.

Acceptance criteria:
1. StoryDetailScreen renders without crashing when ``acceptance_criteria`` is a
   list of plain strings.
2. StoryDetailScreen still renders the AC progress bar correctly when ACs are
   dict-form ``{text, done}``.
3. A regression test covers the string-form AC case.

These tests drive ``compose()`` directly (a sync generator) — no Textual app
lifecycle needed, so a failure is the real bug, not a harness artifact. They are
fix-agnostic: they pass whether Dev guards with ``isinstance`` or normalizes the
list up front.

The same dict-shape assumption lives in ``story_detail_widget.py`` —
``StoryDetailWidget`` (used by both StoryDetailScreen AND the ProgressPanel
drill-through) calls ``ac.get("done")`` at L43/L115-116 and ``ac.get("text")`` at
L117. It is a live, reachable second crash path for the exact same data, so it is
covered here too; a fix that touches only the screen leaves the widget crashing
(SOUL #1/#2 — the normalization belongs in one shared place).
"""

from __future__ import annotations

from typing import Any

from textual.widgets import Collapsible

from pf.tui.story_detail_screen import StoryDetailScreen
from pf.tui.story_detail_widget import StoryDetailWidget


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compose(story_data: dict[str, Any]) -> list[Any]:
    """Instantiate the screen and fully drive its compose() generator.

    No ``id`` key is supplied, so ``_enrich`` short-circuits (no file I/O) and the
    data reaches ``compose()`` verbatim — isolating the AC-shape bug.
    """
    screen = StoryDetailScreen(story_data)
    return list(screen.compose())


def _ac_widget(widgets: list[Any]) -> Any | None:
    """Return the AC progress-bar Static (id='dossier-ac'), or None if omitted."""
    return next((w for w in widgets if getattr(w, "id", None) == "dossier-ac"), None)


def _plain(static_widget: Any) -> str:
    """Read a Static's rendered Text as plain text.

    Textual stores the content on the name-mangled ``_Static__content`` attribute;
    there is no public accessor outside an app render cycle (``.renderable`` does
    not exist in the pinned Textual version), so we read it directly.
    """
    content = getattr(static_widget, "_Static__content")
    return content.plain if hasattr(content, "plain") else str(content)


# ---------------------------------------------------------------------------
# AC1 / AC3 — string-form ACs must not crash the screen (RED today)
# ---------------------------------------------------------------------------


class TestStringFormAcs:
    """String-form acceptance_criteria must render, not explode."""

    def test_string_form_acs_do_not_crash(self) -> None:
        """A list of plain-string ACs must compose without raising.

        RED today: ``ac.get("done")`` raises AttributeError on the first str.
        """
        widgets = _compose(
            {"title": "Robustify loop callbacks", "acceptance_criteria": ["do a thing", "do another"]}
        )
        # Reached here => no AttributeError. Also prove compose produced output.
        assert widgets, "compose() must yield widgets for a story with string ACs"

    def test_string_form_acs_render_section_with_zero_done(self) -> None:
        """String ACs have no 'done' state, so the bar shows 0 of N done.

        Pins that the fix does NOT 'recover' by silently dropping the AC section,
        and that a string AC counts as not-done.
        """
        widgets = _compose(
            {"title": "X", "acceptance_criteria": ["first", "second", "third"]}
        )
        ac = _ac_widget(widgets)
        assert ac is not None, "AC section must still render for string-form ACs"
        plain = _plain(ac)
        assert "0/3" in plain, f"expected 0 of 3 done for string ACs, got: {plain!r}"


# ---------------------------------------------------------------------------
# Mixed-shape ACs — count only the done dicts, never crash (RED today)
# ---------------------------------------------------------------------------


class TestMixedFormAcs:
    """A list mixing strings and dicts must count only the done dict entries."""

    def test_mixed_form_acs_do_not_crash_and_count_dict_done(self) -> None:
        """One done dict among strings/undone dicts => 1 of 3 done, no crash.

        RED today: the leading string hits ``.get`` and raises before counting.
        """
        widgets = _compose(
            {
                "title": "X",
                "acceptance_criteria": [
                    "a plain string criterion",
                    {"text": "a done one", "done": True},
                    {"text": "an undone one", "done": False},
                ],
            }
        )
        ac = _ac_widget(widgets)
        assert ac is not None, "AC section must render for mixed-shape ACs"
        plain = _plain(ac)
        assert "1/3" in plain, f"expected 1 of 3 done for mixed ACs, got: {plain!r}"

    def test_non_dict_non_str_ac_does_not_crash(self) -> None:
        """A render path must fail soft on any unexpected AC element (rule #1).

        ``None`` (or any non-dict) has no 'done' state and must count as not-done
        rather than crash the entire detail screen. RED today: ``None.get`` raises.
        """
        widgets = _compose({"title": "X", "acceptance_criteria": [None]})
        ac = _ac_widget(widgets)
        assert ac is not None, "AC section must render even for an unexpected AC shape"
        plain = _plain(ac)
        assert "0/1" in plain, f"expected 0 of 1 done for a non-dict AC, got: {plain!r}"


# ---------------------------------------------------------------------------
# Regression guards — dict-form behavior must be preserved (green on arrival)
# ---------------------------------------------------------------------------


class TestDictFormRegressionGuards:
    """Dict-form ACs already work; these pin that the fix does not regress them."""

    def test_dict_form_acs_render_correct_count(self) -> None:
        """One done of two dict ACs => '1/2' and '50%' in the rendered bar."""
        widgets = _compose(
            {
                "title": "Y",
                "acceptance_criteria": [
                    {"text": "a", "done": True},
                    {"text": "b", "done": False},
                ],
            }
        )
        ac = _ac_widget(widgets)
        assert ac is not None, "AC section must render for dict-form ACs"
        plain = _plain(ac)
        assert "1/2" in plain, f"expected 1 of 2 done, got: {plain!r}"
        assert "50%" in plain, f"expected 50% progress, got: {plain!r}"

    def test_empty_acs_omits_section(self) -> None:
        """No acceptance_criteria => the AC section is omitted entirely (no div-by-zero)."""
        widgets = _compose({"title": "Z", "acceptance_criteria": []})
        assert _ac_widget(widgets) is None, "AC section must be omitted when there are no ACs"


# ---------------------------------------------------------------------------
# StoryDetailWidget — the sibling render path (ProgressPanel drill-through)
# ---------------------------------------------------------------------------


def _compose_widget(story_data: dict[str, Any]) -> list[Any]:
    """Drive StoryDetailWidget.compose() fully (sync generator, no app)."""
    return list(StoryDetailWidget(story_data).compose())


def _ac_collapsible(widgets: list[Any]) -> Collapsible | None:
    """Return the Acceptance Criteria Collapsible, or None if omitted.

    The AC section is the only Collapsible whose title starts with
    'Acceptance Criteria'.
    """
    for w in widgets:
        if isinstance(w, Collapsible) and str(getattr(w, "title", "")).startswith(
            "Acceptance Criteria"
        ):
            return w
    return None


def _collapsible_body(collapsible: Collapsible) -> str:
    """Plain text of the Collapsible's inner Static (the per-AC checklist)."""
    parts: list[str] = []
    for child in getattr(collapsible, "_contents_list", []) or []:
        content = getattr(child, "_Static__content", None)
        if content is not None:
            parts.append(content.plain if hasattr(content, "plain") else str(content))
    return "".join(parts)


class TestStoryDetailWidgetAcShapes:
    """StoryDetailWidget shares the AC-shape bug and is a live drill-through path."""

    def test_widget_string_form_acs_do_not_crash(self) -> None:
        """String-form ACs must compose without raising.

        RED today: L43 ``ac.get("done")`` raises AttributeError on the first str.
        """
        widgets = _compose_widget(
            {"title": "X", "acceptance_criteria": ["alpha", "beta"]}
        )
        assert widgets, "compose() must yield widgets for a story with string ACs"

    def test_widget_string_form_acs_render_text_and_zero_done(self) -> None:
        """A string AC has no 'done' state and renders its own text as the criterion.

        Pins both the count (0 of 2) and that the string content is shown — a fix
        that only guards ``.get("done")`` but leaves ``ac.get("text", "")`` would
        render blank checklist rows (degraded, not crashing). RED today (crash).
        """
        widgets = _compose_widget(
            {"title": "X", "acceptance_criteria": ["alpha criterion", "beta criterion"]}
        )
        col = _ac_collapsible(widgets)
        assert col is not None, "AC section must render for string-form ACs"
        assert "0/2" in str(col.title), f"expected 0 of 2 done, got title: {col.title!r}"
        body = _collapsible_body(col)
        assert "alpha criterion" in body, f"string AC text must be shown, got: {body!r}"
        assert "beta criterion" in body, f"string AC text must be shown, got: {body!r}"

    def test_widget_mixed_form_acs_count_and_mark(self) -> None:
        """Mixed string + dict ACs: count only dict-done, render both, no crash.

        RED today: the leading string raises before the section is built.
        """
        widgets = _compose_widget(
            {
                "title": "X",
                "acceptance_criteria": [
                    "a plain string",
                    {"text": "a done one", "done": True},
                ],
            }
        )
        col = _ac_collapsible(widgets)
        assert col is not None, "AC section must render for mixed-shape ACs"
        assert "1/2" in str(col.title), f"expected 1 of 2 done, got title: {col.title!r}"
        body = _collapsible_body(col)
        assert "a plain string" in body, f"string AC text must be shown, got: {body!r}"
        assert "a done one" in body, f"dict AC text must be shown, got: {body!r}"

    def test_widget_dict_form_acs_render_count_and_marks(self) -> None:
        """Regression guard (green on arrival): dict ACs keep correct count + marks."""
        widgets = _compose_widget(
            {
                "title": "Y",
                "acceptance_criteria": [
                    {"text": "aaa", "done": True},
                    {"text": "bbb", "done": False},
                ],
            }
        )
        col = _ac_collapsible(widgets)
        assert col is not None, "AC section must render for dict-form ACs"
        assert "1/2" in str(col.title), f"expected 1 of 2 done, got title: {col.title!r}"
        body = _collapsible_body(col)
        assert "aaa" in body and "bbb" in body, f"AC texts must be shown, got: {body!r}"
        assert "✓ aaa" in body, f"done AC must show a check mark, got: {body!r}"
