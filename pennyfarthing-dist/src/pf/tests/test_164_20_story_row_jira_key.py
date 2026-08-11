"""Story 164-20: sprint board TUI story rows show em-dash instead of their jira key.

gh #141. Story dicts reach ``_build_story_label()`` straight from sprint YAML,
where the Jira key lives under ``jira:``. The label builder only read
``jiraKey`` (the camelCase name that ``ws_push.fetch_sprint()`` applies to
*epics* only), so every story row rendered an em-dash.

Acceptance Criteria:
- [AC1] Story rows render their ``jira:`` value in the Jira-key column when present
- [AC2] With no ``jira``/``jiraKey``, the column falls back to the story ``id``
        (no regression for stories/epics where id == the key)
- [AC3] Regression: a short-form-id story carrying a separate Jira key
        (id ``40-1`` / ``83-1`` with ``MSSCI-*``/``PROJ-*``) renders the key, not em-dash
"""

from __future__ import annotations

from typing import Any

from pf.tui.sprint_panel import _EPIC_ID_WIDTH, _build_epic_label, _build_story_label

EM_DASH = "—"


def _story(**overrides: Any) -> dict[str, Any]:
    story: dict[str, Any] = {
        "id": "164-20",
        "title": "Sprint board story jira key",
        "points": 2,
        "status": "backlog",
    }
    story.update(overrides)
    return story


class TestStoryRowRendersYamlJiraField:
    """AC1: the raw YAML ``jira`` field is what the column must show."""

    def test_yaml_jira_field_is_rendered(self) -> None:
        label = _build_story_label(_story(jira="PROJ-14466"), "")
        assert "PROJ-14466" in label.plain

    def test_yaml_jira_field_replaces_em_dash(self) -> None:
        label = _build_story_label(_story(jira="PROJ-14466"), "")
        assert EM_DASH not in label.plain, (
            "story with a jira: field must not render the em-dash placeholder"
        )

    def test_normalized_jira_key_still_wins(self) -> None:
        """A normalized payload (``jiraKey``) keeps precedence over raw ``jira``."""
        label = _build_story_label(_story(jiraKey="PROJ-14466", jira="STALE-1"), "")
        assert "PROJ-14466" in label.plain
        assert "STALE-1" not in label.plain

    def test_empty_jira_key_falls_through_to_jira(self) -> None:
        label = _build_story_label(_story(jiraKey="", jira="PROJ-14467"), "")
        assert "PROJ-14467" in label.plain

    def test_none_jira_key_falls_through_to_jira(self) -> None:
        label = _build_story_label(_story(jiraKey=None, jira="PROJ-14468"), "")
        assert "PROJ-14468" in label.plain

    def test_long_jira_value_truncated_with_ellipsis(self) -> None:
        long_key = "A" * (_EPIC_ID_WIDTH + 6)
        label = _build_story_label(_story(jira=long_key), "")
        assert "…" in label.plain
        assert long_key not in label.plain
        assert EM_DASH not in label.plain


class TestStoryRowFallsBackToId:
    """AC2: no key at all → show the story id, not a placeholder."""

    def test_missing_both_keys_falls_back_to_id(self) -> None:
        label = _build_story_label(_story(id="164-20"), "")
        assert "164-20" in label.plain
        assert EM_DASH not in label.plain, "id must be used as the key when none is set"

    def test_null_jira_key_falls_back_to_id(self) -> None:
        label = _build_story_label(_story(id="103-1", jiraKey=None), "")
        assert EM_DASH not in label.plain
        # id appears twice: ordinal column + jira column
        assert label.plain.count("103-1") == 2

    def test_empty_string_keys_fall_back_to_id(self) -> None:
        label = _build_story_label(_story(id="103-2", jiraKey="", jira=""), "")
        assert label.plain.count("103-2") == 2

    def test_no_id_and_no_key_still_shows_em_dash(self) -> None:
        """Safety net: nothing to show → placeholder, and no crash."""
        story = {"title": "Orphan", "points": 1, "status": "backlog"}
        label = _build_story_label(story, "")
        assert EM_DASH in label.plain

    def test_id_equals_jira_renders_once_in_key_column(self) -> None:
        """id == jira (old-style stories) — no double-rendering regression."""
        label = _build_story_label(_story(id="164-20", jira="164-20"), "")
        assert label.plain.count("164-20") == 2


class TestShortFormIdRegression:
    """AC3: short ordinal id + separate Jira key — the gh #141 reproduction."""

    def test_short_id_with_mssci_key(self) -> None:
        label = _build_story_label(_story(id="40-1", jira="MSSCI-18070", status="done"), "")
        assert "MSSCI-18070" in label.plain
        assert EM_DASH not in label.plain

    def test_short_id_with_proj_key(self) -> None:
        label = _build_story_label(_story(id="83-1", jira="PROJ-14466", status="done"), "")
        assert "PROJ-14466" in label.plain
        assert EM_DASH not in label.plain

    def test_sibling_story_without_key_uses_its_own_id(self) -> None:
        keyed = _build_story_label(_story(id="83-1", jira="PROJ-14466"), "")
        unkeyed = _build_story_label(_story(id="83-2"), "")
        assert "PROJ-14466" in keyed.plain
        assert "83-2" in unkeyed.plain
        assert EM_DASH not in unkeyed.plain

    def test_epic_row_behaviour_unchanged(self) -> None:
        """Epic labels already resolved correctly — must not regress."""
        with_key = _build_epic_label("40", "Short form epic", 4, 6, jira_key="MSSCI-18070")
        assert "MSSCI-18070" in with_key.plain
        without_key = _build_epic_label("40", "Short form epic", 4, 6)
        assert EM_DASH not in without_key.plain
