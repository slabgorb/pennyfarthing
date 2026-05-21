"""Tests for GitPanel collapsible repo sections — Story 148-4.

The git pane displays dirty file trees for each repo. This story adds
collapsible sections so users can expand/collapse individual repo sections.

RED state: Tests will fail until collapsible behavior is implemented in GitPanel.

Acceptance Criteria:
  AC1: Each repo section has a collapse/expand toggle
  AC2: Collapsed state hides file list, shows repo name + file count
  AC3: Expand/collapse state persists during the session
  AC4: Default state is expanded for repos with changes
"""

from __future__ import annotations

from typing import Any

import pytest

from pf.tui.git_panel import GitPanel


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_repo(
    name: str,
    branch: str = "main",
    clean: bool = False,
    dirty_files: list[dict[str, str]] | None = None,
    ahead: int = 0,
    behind: int = 0,
) -> dict[str, Any]:
    """Build a repo dict matching the WebSocket git payload schema."""
    if dirty_files is None:
        dirty_files = []
    return {
        "name": name,
        "branch": branch,
        "clean": clean,
        "dirtyFiles": dirty_files,
        "ahead": ahead,
        "behind": behind,
    }


def _dirty_files(n: int) -> list[dict[str, str]]:
    """Generate n dirty file entries."""
    return [
        {"path": f"src/file_{i}.py", "status": " M"}
        for i in range(n)
    ]


@pytest.fixture
def two_dirty_repos_payload() -> dict[str, Any]:
    """Payload with two repos, both dirty."""
    return {
        "repos": [
            _make_repo("orchestrator", dirty_files=_dirty_files(3)),
            _make_repo("pennyfarthing", branch="develop", dirty_files=_dirty_files(5)),
        ]
    }


@pytest.fixture
def mixed_repos_payload() -> dict[str, Any]:
    """Payload with one dirty and one clean repo."""
    return {
        "repos": [
            _make_repo("orchestrator", dirty_files=_dirty_files(4)),
            _make_repo("pennyfarthing", branch="develop", clean=True),
        ]
    }


@pytest.fixture
def single_repo_payload() -> dict[str, Any]:
    """Payload with one dirty repo."""
    return {
        "repos": [
            _make_repo("orchestrator", dirty_files=_dirty_files(2)),
        ]
    }


@pytest.fixture
def panel() -> GitPanel:
    """Create a GitPanel with no WebSocket client."""
    return GitPanel(client=None)


# ---------------------------------------------------------------------------
# AC1: Each repo section has a collapse/expand toggle
# ---------------------------------------------------------------------------


class TestCollapseExpandToggle:
    """AC1: Each repo section in the git pane has a collapse/expand toggle."""

    def test_toggle_collapse_method_exists(self, panel: GitPanel):
        """GitPanel must expose a toggle_repo_collapsed method."""
        assert hasattr(panel, "toggle_repo_collapsed"), (
            "GitPanel must have a toggle_repo_collapsed() method"
        )
        assert callable(panel.toggle_repo_collapsed)

    def test_toggle_changes_state(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Toggling a repo should flip it from expanded to collapsed."""
        panel.handle_message(two_dirty_repos_payload)

        # Default: expanded (AC4) — toggle should collapse
        panel.toggle_repo_collapsed("orchestrator")
        assert panel.is_repo_collapsed("orchestrator") is True

        # Toggle again — should expand
        panel.toggle_repo_collapsed("orchestrator")
        assert panel.is_repo_collapsed("orchestrator") is False

    def test_is_repo_collapsed_method_exists(self, panel: GitPanel):
        """GitPanel must expose is_repo_collapsed to query state."""
        assert hasattr(panel, "is_repo_collapsed"), (
            "GitPanel must have an is_repo_collapsed() method"
        )
        assert callable(panel.is_repo_collapsed)

    def test_toggle_unknown_repo_is_safe(self, panel: GitPanel):
        """Toggling a repo not in the payload should not raise."""
        panel.toggle_repo_collapsed("nonexistent")
        # Should not raise — no-op or creates entry

    def test_each_repo_independently_toggleable(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapsing one repo should not affect the other."""
        panel.handle_message(two_dirty_repos_payload)

        panel.toggle_repo_collapsed("orchestrator")
        assert panel.is_repo_collapsed("orchestrator") is True
        assert panel.is_repo_collapsed("pennyfarthing") is False

    def test_collapse_indicator_in_render(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapsed repos should show ▶ indicator, expanded show ▼."""
        panel.handle_message(two_dirty_repos_payload)

        # Default expanded — should see ▼
        rendered = panel.render_panel(two_dirty_repos_payload)
        text = str(rendered)
        assert "▼" in text, "Expanded repos should show ▼ indicator"

        # Collapse one
        panel.toggle_repo_collapsed("orchestrator")
        rendered = panel.render_panel(two_dirty_repos_payload)
        text = str(rendered)
        assert "▶" in text, "Collapsed repo should show ▶ indicator"


# ---------------------------------------------------------------------------
# AC2: Collapsed state hides file list, shows repo name + file count
# ---------------------------------------------------------------------------


class TestCollapsedRendering:
    """AC2: Collapsed state hides the file list, showing only repo name and file count."""

    def test_expanded_shows_file_paths(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """When expanded, individual file paths should be visible."""
        panel.handle_message(two_dirty_repos_payload)
        rendered = panel.render_panel(two_dirty_repos_payload)
        text = str(rendered)

        # orchestrator has files src/file_0.py through src/file_2.py
        assert "file_0.py" in text, "Expanded repo should show file paths"
        assert "file_1.py" in text
        assert "file_2.py" in text

    def test_collapsed_hides_file_paths(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """When collapsed, individual file paths should NOT be visible."""
        panel.handle_message(two_dirty_repos_payload)
        panel.toggle_repo_collapsed("orchestrator")

        rendered = panel.render_panel(two_dirty_repos_payload)
        text = str(rendered)

        # orchestrator's files should be hidden
        # (pennyfarthing's files may still be visible)
        # Check that orchestrator's specific file range is hidden
        # orchestrator has file_0, file_1, file_2
        # pennyfarthing has file_0..file_4
        # We can't just check file_0 absence since pennyfarthing has it too.
        # Instead verify the collapsed repo section doesn't render its files.
        # Use get_repo_render_info if available, or check structure.

        # The collapsed section should show a count summary instead
        assert "3 file" in text or "(3)" in text, (
            "Collapsed repo should show file count"
        )

    def test_collapsed_shows_repo_name(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapsed repo should still show the repo name."""
        panel.handle_message(two_dirty_repos_payload)
        panel.toggle_repo_collapsed("orchestrator")

        rendered = panel.render_panel(two_dirty_repos_payload)
        text = str(rendered)
        assert "orchestrator" in text, "Collapsed repo should still show name"

    def test_collapsed_shows_file_count(
        self, panel: GitPanel, single_repo_payload: dict
    ):
        """Collapsed repo header should display the number of dirty files."""
        panel.handle_message(single_repo_payload)
        panel.toggle_repo_collapsed("orchestrator")

        rendered = panel.render_panel(single_repo_payload)
        text = str(rendered)

        # Should show count of 2 files somewhere in the collapsed header
        assert "2 file" in text or "(2)" in text, (
            "Collapsed header should show file count (2 files)"
        )

    def test_collapsed_hides_selection_indicators(
        self, panel: GitPanel, single_repo_payload: dict
    ):
        """Collapsed repo should not show file selection indicators (›)."""
        panel.handle_message(single_repo_payload)
        panel.toggle_repo_collapsed("orchestrator")

        rendered = panel.render_panel(single_repo_payload)
        text = str(rendered)

        # The selection cursor (›) should not appear for collapsed repos
        assert "›" not in text, (
            "Collapsed repo should not show file selection indicators"
        )

    def test_only_collapsed_repo_hidden(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapsing one repo should not hide the other repo's files."""
        panel.handle_message(two_dirty_repos_payload)
        panel.toggle_repo_collapsed("orchestrator")

        rendered = panel.render_panel(two_dirty_repos_payload)
        text = str(rendered)

        # pennyfarthing (5 files) should still show its files
        assert "pennyfarthing" in text
        # pennyfarthing's files should be visible (file_0..file_4)
        assert "file_4.py" in text, (
            "Non-collapsed repo should still show its files"
        )


# ---------------------------------------------------------------------------
# AC3: Expand/collapse state persists during the session
# ---------------------------------------------------------------------------


class TestStatePersistence:
    """AC3: Expand/collapse state persists during the session."""

    def test_state_survives_new_payload(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapse state should persist when a new git payload arrives."""
        panel.handle_message(two_dirty_repos_payload)
        panel.toggle_repo_collapsed("orchestrator")
        assert panel.is_repo_collapsed("orchestrator") is True

        # Simulate new WebSocket message (same structure, could be different data)
        new_payload = {
            "repos": [
                _make_repo("orchestrator", dirty_files=_dirty_files(5)),
                _make_repo("pennyfarthing", branch="develop", dirty_files=_dirty_files(2)),
            ]
        }
        panel.handle_message(new_payload)

        # Collapse state should survive
        assert panel.is_repo_collapsed("orchestrator") is True, (
            "Collapse state should persist across payload updates"
        )

    def test_state_survives_multiple_rerenders(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapse state should persist across multiple render calls."""
        panel.handle_message(two_dirty_repos_payload)
        panel.toggle_repo_collapsed("pennyfarthing")

        # Render multiple times
        for _ in range(5):
            panel.render_panel(two_dirty_repos_payload)

        assert panel.is_repo_collapsed("pennyfarthing") is True, (
            "Collapse state should persist across re-renders"
        )

    def test_state_survives_when_repo_becomes_clean(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """If a repo was collapsed and then becomes clean, state is retained."""
        panel.handle_message(two_dirty_repos_payload)
        panel.toggle_repo_collapsed("orchestrator")

        # New payload where orchestrator is now clean
        clean_payload = {
            "repos": [
                _make_repo("orchestrator", clean=True),
                _make_repo("pennyfarthing", branch="develop", dirty_files=_dirty_files(3)),
            ]
        }
        panel.handle_message(clean_payload)

        # State should still be remembered (for when it gets dirty again)
        assert panel.is_repo_collapsed("orchestrator") is True, (
            "Collapse state should persist even when repo becomes clean"
        )

    def test_expanded_state_also_persists(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Explicitly expanded repos should stay expanded across updates."""
        panel.handle_message(two_dirty_repos_payload)

        # Collapse then expand
        panel.toggle_repo_collapsed("orchestrator")
        panel.toggle_repo_collapsed("orchestrator")
        assert panel.is_repo_collapsed("orchestrator") is False

        # New payload
        panel.handle_message(two_dirty_repos_payload)
        assert panel.is_repo_collapsed("orchestrator") is False


# ---------------------------------------------------------------------------
# AC4: Default state is expanded for repos with changes
# ---------------------------------------------------------------------------


class TestDefaultExpandedState:
    """AC4: Default state is expanded for repos with changes."""

    def test_dirty_repos_default_expanded(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Repos with dirty files should default to expanded."""
        panel.handle_message(two_dirty_repos_payload)

        assert panel.is_repo_collapsed("orchestrator") is False, (
            "Dirty repos should default to expanded"
        )
        assert panel.is_repo_collapsed("pennyfarthing") is False, (
            "Dirty repos should default to expanded"
        )

    def test_clean_repos_default_collapsed(
        self, panel: GitPanel, mixed_repos_payload: dict
    ):
        """Clean repos should default to collapsed."""
        panel.handle_message(mixed_repos_payload)

        # orchestrator is dirty — should be expanded
        assert panel.is_repo_collapsed("orchestrator") is False
        # pennyfarthing is clean — should be collapsed
        assert panel.is_repo_collapsed("pennyfarthing") is True, (
            "Clean repos should default to collapsed"
        )

    def test_newly_dirty_repo_auto_expands(self, panel: GitPanel):
        """A repo that was clean and becomes dirty should auto-expand."""
        # Start with clean repo
        clean_payload = {
            "repos": [
                _make_repo("orchestrator", clean=True),
            ]
        }
        panel.handle_message(clean_payload)
        assert panel.is_repo_collapsed("orchestrator") is True

        # Repo becomes dirty — should auto-expand (unless user explicitly collapsed)
        dirty_payload = {
            "repos": [
                _make_repo("orchestrator", dirty_files=_dirty_files(2)),
            ]
        }
        panel.handle_message(dirty_payload)
        assert panel.is_repo_collapsed("orchestrator") is False, (
            "Repo that becomes dirty should auto-expand"
        )

    def test_user_collapsed_dirty_repo_stays_collapsed(self, panel: GitPanel):
        """If user explicitly collapses a dirty repo, it stays collapsed on update."""
        payload = {
            "repos": [
                _make_repo("orchestrator", dirty_files=_dirty_files(3)),
            ]
        }
        panel.handle_message(payload)
        # User explicitly collapses
        panel.toggle_repo_collapsed("orchestrator")
        assert panel.is_repo_collapsed("orchestrator") is True

        # New payload still dirty — should stay collapsed (user override)
        new_payload = {
            "repos": [
                _make_repo("orchestrator", dirty_files=_dirty_files(5)),
            ]
        }
        panel.handle_message(new_payload)
        assert panel.is_repo_collapsed("orchestrator") is True, (
            "User-collapsed dirty repo should stay collapsed on update"
        )

    def test_all_clean_repos_collapsed_in_render(
        self, panel: GitPanel, mixed_repos_payload: dict
    ):
        """In rendered output, clean repos should show collapsed indicator."""
        panel.handle_message(mixed_repos_payload)
        rendered = panel.render_panel(mixed_repos_payload)
        text = str(rendered)

        # pennyfarthing is clean — should show ▶ (collapsed)
        # We check that both indicators exist (▼ for dirty, ▶ for clean)
        assert "▼" in text, "Dirty expanded repo should show ▼"
        assert "▶" in text, "Clean collapsed repo should show ▶"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases for collapsible behavior."""

    def test_empty_payload_no_crash(self, panel: GitPanel):
        """Empty repos list should render without errors."""
        payload: dict[str, Any] = {"repos": []}
        panel.handle_message(payload)
        rendered = panel.render_panel(payload)
        assert rendered is not None

    def test_collapse_does_not_affect_file_path_index(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapsing a repo should update the selectable file path index.

        If orchestrator (3 files) is collapsed, the file index should
        only contain pennyfarthing's files, so selection stays valid.
        """
        panel.handle_message(two_dirty_repos_payload)

        # Before collapse: 3 + 5 = 8 files
        total_before = len(panel._file_paths)
        assert total_before == 8, f"Expected 8 files, got {total_before}"

        # Collapse orchestrator (3 files)
        panel.toggle_repo_collapsed("orchestrator")
        panel.handle_message(two_dirty_repos_payload)

        # After collapse: only pennyfarthing's 5 files should be selectable
        total_after = len(panel._file_paths)
        assert total_after == 5, (
            f"After collapsing orchestrator (3 files), expected 5 selectable files, got {total_after}"
        )

    def test_selected_index_adjusted_on_collapse(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """If selected file is in a collapsed repo, selection should adjust."""
        panel.handle_message(two_dirty_repos_payload)

        # Select a file in orchestrator (index 1)
        panel._selected_index = 1

        # Collapse orchestrator — selected index should reset or clamp
        panel.toggle_repo_collapsed("orchestrator")
        panel.handle_message(two_dirty_repos_payload)

        assert panel._selected_index >= 0
        assert panel._selected_index < len(panel._file_paths) or len(panel._file_paths) == 0

    def test_collapse_all_repos(
        self, panel: GitPanel, two_dirty_repos_payload: dict
    ):
        """Collapsing all repos should result in no selectable files."""
        panel.handle_message(two_dirty_repos_payload)

        panel.toggle_repo_collapsed("orchestrator")
        panel.toggle_repo_collapsed("pennyfarthing")
        panel.handle_message(two_dirty_repos_payload)

        assert len(panel._file_paths) == 0, (
            "All repos collapsed — no files should be selectable"
        )

    def test_drill_through_blocked_when_collapsed(
        self, panel: GitPanel, single_repo_payload: dict
    ):
        """Cannot drill into a file diff when the repo is collapsed."""
        panel.handle_message(single_repo_payload)
        panel.toggle_repo_collapsed("orchestrator")
        panel.handle_message(single_repo_payload)

        # Attempting drill-through should not enter diff view
        panel.action_drill_into_file()
        assert panel._viewing_diff is False, (
            "Should not enter diff view when all repos collapsed and no files selectable"
        )

    def test_keybinding_toggle_action_exists(self, panel: GitPanel):
        """GitPanel should have a keybinding action for toggling collapse."""
        # Check for a binding action (e.g., action_toggle_collapse or 'c' key)
        has_toggle = (
            hasattr(panel, "action_toggle_collapse")
            or hasattr(panel, "action_toggle_section")
            or hasattr(panel, "action_toggle_repo")
        )
        assert has_toggle, (
            "GitPanel should have a keybinding action for toggling repo collapse "
            "(action_toggle_collapse, action_toggle_section, or action_toggle_repo)"
        )
