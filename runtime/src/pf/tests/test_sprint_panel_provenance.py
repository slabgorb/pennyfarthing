"""Tests for SprintPanel provenance indicator — display layer (Python TUI).

Story 120-6: Sprint panel ignores active sprint preference from sprint registry
Phase: RED (tests should fail — provenance rendering not yet implemented)

Acceptance Criteria covered:
- AC2: Provenance indicator shows active sprint identity [type:name]
- AC3: Default fallback — no provenance indicator shown
- AC4: Switching focus updates the TUI header

Visual spec (from session):
    Sprint Progress [spike:ocsf-rs1]
    ════════════════════════════════
    - Appended to header as [type:name]
    - Use .get('type', '') for safe dict access
    - Escape values with rich.markup.escape() before Text.from_markup()
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from rich.text import Text

from pf.tui.sprint_panel import SprintPanel

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


SAMPLE_PAYLOAD_WITH_REGISTRY: dict[str, Any] = {
    "type": "init",
    "currentStory": None,
    "nextStory": None,
    "epics": [
        {
            "id": "120",
            "title": "Installation, agents and workflows",
            "jiraKey": "PROJ-15400",
            "stories": [
                {
                    "id": "120-6",
                    "title": "Sprint panel active sprint preference",
                    "points": 5,
                    "status": "in_progress",
                    "jiraKey": "PROJ-15411",
                },
            ],
        },
    ],
    "futureEpics": [],
    "sprint": {
        "number": 2608,
        "name": "TO Sprint 2608",
        "done": 89,
        "remaining": 30,
        "inProgress": 5,
        "endDate": "2026-03-06",
        "currentStory": "120-6",
    },
    "metrics": {"velocity": 89, "burndown": []},
    "registry": {
        "name": "ocsf-rs1",
        "type": "spike",
        "description": "OCSF log source research spike",
        "file": "sprint/spikes/ocsf-rs1.yaml",
        "isDefault": False,
    },
}


SAMPLE_PAYLOAD_NO_REGISTRY: dict[str, Any] = {
    "type": "init",
    "currentStory": None,
    "nextStory": None,
    "epics": [
        {
            "id": "120",
            "title": "Installation, agents and workflows",
            "jiraKey": "PROJ-15400",
            "stories": [
                {
                    "id": "120-6",
                    "title": "Sprint panel active sprint preference",
                    "points": 5,
                    "status": "in_progress",
                    "jiraKey": "PROJ-15411",
                },
            ],
        },
    ],
    "futureEpics": [],
    "sprint": {
        "number": 2608,
        "name": "TO Sprint 2608",
        "done": 89,
        "remaining": 30,
        "inProgress": 5,
        "endDate": "2026-03-06",
        "currentStory": "120-6",
    },
    "metrics": {"velocity": 89, "burndown": []},
}


SAMPLE_PAYLOAD_DEFAULT_REGISTRY: dict[str, Any] = {
    **SAMPLE_PAYLOAD_NO_REGISTRY,
    "registry": {
        "name": "default",
        "type": "project",
        "description": "Default sprint",
        "file": "sprint/current-sprint.yaml",
        "isDefault": True,
    },
}


SAMPLE_PAYLOAD_RESEARCH_REGISTRY: dict[str, Any] = {
    **SAMPLE_PAYLOAD_NO_REGISTRY,
    "registry": {
        "name": "auth-deep-dive",
        "type": "research",
        "description": "Authentication patterns research",
        "file": "sprint/research/auth-deep-dive.yaml",
        "isDefault": False,
    },
}


SAMPLE_PAYLOAD_BRACKET_NAME: dict[str, Any] = {
    **SAMPLE_PAYLOAD_NO_REGISTRY,
    "registry": {
        "name": "test[brackets]",
        "type": "spike",
        "description": "Name with Rich markup chars",
        "file": "sprint/spikes/test.yaml",
        "isDefault": False,
    },
}


@pytest.fixture
def mock_client() -> MagicMock:
    """Create a mock FrameClient."""
    client = MagicMock()
    client.subscribe = MagicMock()
    return client


@pytest.fixture
def panel(mock_client: MagicMock) -> SprintPanel:
    """Create a SprintPanel with mock client."""
    return SprintPanel(client=mock_client)


# ---------------------------------------------------------------------------
# AC2: Provenance indicator shows active sprint identity
# ---------------------------------------------------------------------------


class TestProvenanceIndicator:
    """AC2: Header shows [type:name] when non-default sprint is active."""

    def test_header_includes_provenance_for_non_default_sprint(self, panel: SprintPanel) -> None:
        """Header should include [spike:ocsf-rs1] when registry is present."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            panel._rebuild_tree(SAMPLE_PAYLOAD_WITH_REGISTRY)

            # Check that the header update call includes provenance
            mock_header.update.assert_called_once()
            header_text: Text = mock_header.update.call_args[0][0]
            assert "[spike:ocsf-rs1]" in header_text.plain, (
                f"Header should include provenance [spike:ocsf-rs1], got: {header_text.plain}"
            )

    def test_provenance_with_research_type(self, panel: SprintPanel) -> None:
        """Header should show [research:auth-deep-dive] for research sprints."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            panel._rebuild_tree(SAMPLE_PAYLOAD_RESEARCH_REGISTRY)

            mock_header.update.assert_called_once()
            header_text: Text = mock_header.update.call_args[0][0]
            assert "[research:auth-deep-dive]" in header_text.plain, (
                f"Header should include [research:auth-deep-dive], got: {header_text.plain}"
            )


# ---------------------------------------------------------------------------
# AC3: Default fallback — no provenance indicator
# ---------------------------------------------------------------------------


class TestNoProvenanceForDefault:
    """AC3: No provenance indicator for default sprint."""

    def test_no_provenance_when_registry_absent(self, panel: SprintPanel) -> None:
        """Header should NOT include provenance when registry key is absent."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            panel._rebuild_tree(SAMPLE_PAYLOAD_NO_REGISTRY)

            mock_header.update.assert_called_once()
            header_text: Text = mock_header.update.call_args[0][0]
            plain = header_text.plain
            # Should just be normal header with no bracket provenance
            assert "Sprint 2608" in plain
            # There should be no [type:name] pattern
            assert "[spike:" not in plain
            assert "[research:" not in plain
            assert "[project:" not in plain

    def test_no_provenance_when_registry_is_default(self, panel: SprintPanel) -> None:
        """Header should NOT include provenance when isDefault is true."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            panel._rebuild_tree(SAMPLE_PAYLOAD_DEFAULT_REGISTRY)

            mock_header.update.assert_called_once()
            header_text: Text = mock_header.update.call_args[0][0]
            plain = header_text.plain
            assert "Sprint 2608" in plain
            assert "[project:" not in plain


# ---------------------------------------------------------------------------
# Edge case: Brackets in sprint names must be escaped for Rich
# ---------------------------------------------------------------------------


class TestRichMarkupEscaping:
    """Sprint names with brackets must be escaped before Rich rendering."""

    def test_bracket_name_does_not_break_rich_markup(self, panel: SprintPanel) -> None:
        """Names like 'test[brackets]' should be escaped to avoid Rich parse errors."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            # This should not raise MarkupError from Rich
            panel._rebuild_tree(SAMPLE_PAYLOAD_BRACKET_NAME)

            mock_header.update.assert_called_once()
            header_text: Text = mock_header.update.call_args[0][0]
            plain = header_text.plain
            # The escaped name should appear in plaintext
            assert "test[brackets]" in plain, (
                f"Escaped bracket name should appear in header, got: {plain}"
            )

    def test_empty_type_renders_gracefully(self, panel: SprintPanel) -> None:
        """Registry with empty type should not crash or show malformed indicator."""
        payload = {
            **SAMPLE_PAYLOAD_NO_REGISTRY,
            "registry": {
                "name": "unnamed",
                "type": "",
                "description": "",
                "file": "sprint/unnamed.yaml",
                "isDefault": False,
            },
        }
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            # Should not crash
            panel._rebuild_tree(payload)

            mock_header.update.assert_called_once()
            header_text: Text = mock_header.update.call_args[0][0]
            # Should still contain the sprint name in provenance
            assert "unnamed" in header_text.plain

    def test_safe_dict_access_for_missing_fields(self, panel: SprintPanel) -> None:
        """Registry dict missing 'type' or 'name' should use safe .get() defaults."""
        payload = {
            **SAMPLE_PAYLOAD_NO_REGISTRY,
            "registry": {
                "isDefault": False,
                # Intentionally missing 'name' and 'type'
            },
        }
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            # Should not raise KeyError
            panel._rebuild_tree(payload)

            mock_header.update.assert_called_once()


# ---------------------------------------------------------------------------
# AC4: Switching focus updates header provenance
# ---------------------------------------------------------------------------


class TestProvenanceSwitching:
    """AC4: Consecutive _rebuild_tree calls update provenance correctly."""

    def test_provenance_appears_on_switch_to_non_default(self, panel: SprintPanel) -> None:
        """Switching from default to non-default should add provenance."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            # First call: no registry
            panel._rebuild_tree(SAMPLE_PAYLOAD_NO_REGISTRY)
            first_text: Text = mock_header.update.call_args[0][0]
            assert "[spike:" not in first_text.plain

            mock_header.reset_mock()

            # Second call: with registry
            panel._rebuild_tree(SAMPLE_PAYLOAD_WITH_REGISTRY)
            second_text: Text = mock_header.update.call_args[0][0]
            assert "[spike:ocsf-rs1]" in second_text.plain

    def test_provenance_disappears_on_switch_to_default(self, panel: SprintPanel) -> None:
        """Switching from non-default to default should remove provenance."""
        panel._mounted = True

        with patch.object(panel, "query_one") as mock_query:
            mock_tree = MagicMock()
            mock_tree.root.children = []
            mock_tree.size.width = 80
            mock_header = MagicMock()

            def _query_side_effect(selector: str, *args: Any) -> Any:
                if selector == "#sprint-tree":
                    return mock_tree
                if selector == "#sprint-header":
                    return mock_header
                raise Exception(f"Unknown selector: {selector}")

            mock_query.side_effect = _query_side_effect

            # First call: with registry
            panel._rebuild_tree(SAMPLE_PAYLOAD_WITH_REGISTRY)
            first_text: Text = mock_header.update.call_args[0][0]
            assert "[spike:ocsf-rs1]" in first_text.plain

            mock_header.reset_mock()

            # Second call: no registry
            panel._rebuild_tree(SAMPLE_PAYLOAD_NO_REGISTRY)
            second_text: Text = mock_header.update.call_args[0][0]
            assert "[spike:" not in second_text.plain
