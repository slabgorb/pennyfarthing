"""Tests for ReposPanel — Story 147-5.

Verifies ReposPanel renders per-repo collapsible sections from repos.yaml,
with editable and read-only fields grouped by RepoFieldSpec category,
a global "Project" section, status bar feedback, and proper message posting.

RED state: Tests will fail until ReposPanel is fully implemented.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.tui.repos_panel import REPOS_CSS, ReposPanel

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_REPOS_YAML = {
    "pr_title_format": "{jira_key} - {type}({scope}): {title}",
    "build_order": ["orchestrator", "pennyfarthing"],
    "repos": {
        "orchestrator": {
            "path": ".",
            "type": "orchestrator",
            "default_branch": "main",
            "branch_strategy": "trunk-based",
            "description": "Sprint management",
            "test_command": "pytest",
            "build_command": "",
            "lint_command": "",
            "test_filter_flag": "-k",
            "pr_strategy": "standard",
            "stack_tool": "",
            "simplify": False,
            "owns": ["sprint/**", "docs/**"],
            "never_edit": ["node_modules/**"],
        },
        "pennyfarthing": {
            "path": "pennyfarthing",
            "type": "framework",
            "default_branch": "develop",
            "branch_strategy": "gitflow",
            "description": "Framework source",
            "test_command": "python3 -m pytest",
            "build_command": "pip install -e .",
            "lint_command": "ruff check",
            "test_filter_flag": "-k",
            "pr_strategy": "standard",
            "stack_tool": "",
            "simplify": True,
            "owns": ["pennyfarthing-dist/**"],
            "never_edit": ["node_modules/**", "packages/*/dist/**"],
        },
    },
}


def _build_repo_configs() -> dict[str, Any]:
    """Build RepoConfig objects from sample YAML for use in mocks."""
    from pf.git.repos import _parse_repo_entry

    configs = {}
    for name, data in SAMPLE_REPOS_YAML["repos"].items():
        configs[name] = _parse_repo_entry(name, data)
    return configs


@pytest.fixture
def sample_repos():
    """Return sample RepoConfig dict, patching load_repos_config."""
    configs = _build_repo_configs()
    with patch("pf.tui.repos_panel.load_repos_config", return_value=configs):
        yield configs


@pytest.fixture
def sample_repos_yaml_raw():
    """Return sample raw YAML dict, patching load_repos_yaml_raw."""
    with patch(
        "pf.tui.repos_panel.load_repos_yaml_raw",
        return_value=SAMPLE_REPOS_YAML,
    ):
        yield SAMPLE_REPOS_YAML


@pytest.fixture
def empty_repos():
    """Return empty repo config for edge case testing."""
    with patch("pf.tui.repos_panel.load_repos_config", return_value={}):
        yield {}


@pytest.fixture
def mock_set_repo_field():
    """Mock set_repo_field for save testing."""
    with patch(
        "pf.tui.repos_panel.set_repo_field",
        return_value={"success": True, "data": {}},
    ) as mock:
        yield mock


# ---------------------------------------------------------------------------
# AC-1: New file repos_panel.py exists at correct location
# ---------------------------------------------------------------------------


class TestModuleExists:
    """repos_panel.py exists as pf.tui.repos_panel and is importable."""

    def test_module_importable(self):
        import pf.tui.repos_panel

        assert pf.tui.repos_panel is not None

    def test_repos_panel_class_exists(self):
        assert hasattr(ReposPanel, "__init__")

    def test_repos_css_defined(self):
        assert isinstance(REPOS_CSS, str)


# ---------------------------------------------------------------------------
# AC-2: ReposPanel extends textual.widget.Widget
# ---------------------------------------------------------------------------


class TestClassHierarchy:
    """ReposPanel inherits from textual.widget.Widget."""

    def test_inherits_from_widget(self):
        from textual.widget import Widget

        assert issubclass(ReposPanel, Widget)

    def test_has_default_css(self):
        assert hasattr(ReposPanel, "DEFAULT_CSS")
        assert ReposPanel.DEFAULT_CSS == REPOS_CSS

    def test_has_compose_method(self):
        assert hasattr(ReposPanel, "compose")
        assert callable(ReposPanel.compose)


# ---------------------------------------------------------------------------
# AC-3: One Collapsible section per repo
# ---------------------------------------------------------------------------


class TestCollapsiblePerRepo:
    """Panel renders one Collapsible section per repo from repos.yaml."""

    def test_two_repos_produce_two_collapsibles(self, sample_repos, sample_repos_yaml_raw):
        from textual.widgets import Collapsible

        panel = ReposPanel()
        widgets = list(panel.compose())

        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        # Should have at least 2 repo collapsibles (one per repo)
        repo_collapsibles = [
            c for c in collapsibles if c.title in ("orchestrator", "pennyfarthing")
        ]
        assert len(repo_collapsibles) == 2, (
            f"Expected 2 repo collapsibles, got {len(repo_collapsibles)}: "
            f"{[c.title for c in collapsibles]}"
        )

    def test_collapsible_titles_match_repo_names(self, sample_repos, sample_repos_yaml_raw):
        from textual.widgets import Collapsible

        panel = ReposPanel()
        widgets = list(panel.compose())

        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        titles = {c.title for c in collapsibles}
        assert "orchestrator" in titles
        assert "pennyfarthing" in titles

    def test_empty_repos_no_collapsibles(self, empty_repos, sample_repos_yaml_raw):
        from textual.widgets import Collapsible

        panel = ReposPanel()
        widgets = list(panel.compose())

        collapsibles = [
            w
            for w in _walk_widgets(widgets)
            if isinstance(w, Collapsible) and w.title not in ("Project",)
        ]
        assert len(collapsibles) == 0


# ---------------------------------------------------------------------------
# AC-4: Fields grouped by RepoFieldSpec group
# ---------------------------------------------------------------------------


class TestFieldGrouping:
    """Within each repo section, fields are grouped by RepoFieldSpec group."""

    def test_groups_present_in_repo_section(self, sample_repos, sample_repos_yaml_raw):
        """Each repo collapsible should contain sub-groups (General, Build, PR, Quality, Topology)."""
        from textual.widgets import Collapsible

        panel = ReposPanel()
        widgets = list(panel.compose())

        # Find a repo collapsible
        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        repo_collapsible = next(
            (c for c in collapsibles if c.title == "orchestrator"), None
        )
        assert repo_collapsible is not None, "orchestrator collapsible not found"

        # Within the repo collapsible, there should be group sub-sections
        # Either as nested Collapsibles or as labeled sections
        inner_widgets = list(repo_collapsible.compose())
        inner_collapsibles = [
            w for w in _walk_widgets(inner_widgets) if isinstance(w, Collapsible)
        ]
        group_names = {c.title for c in inner_collapsibles}
        expected_groups = {"General", "Build", "PR", "Quality", "Topology"}
        assert expected_groups.issubset(group_names), (
            f"Missing groups: {expected_groups - group_names}"
        )


# ---------------------------------------------------------------------------
# AC-5: Editable fields save via set_repo_field()
# ---------------------------------------------------------------------------


class TestEditableFields:
    """Editable fields (switch, select, input) save to repos.yaml."""

    def test_switch_rendered_for_bool_fields(self, sample_repos, sample_repos_yaml_raw):
        """simplify field should render as a Switch widget."""
        from textual.widgets import Switch

        panel = ReposPanel()
        widgets = list(panel.compose())

        switches = [w for w in _walk_widgets(widgets) if isinstance(w, Switch)]
        assert len(switches) > 0, "No Switch widgets found — simplify should be a Switch"

    def test_select_rendered_for_enum_fields(self, sample_repos, sample_repos_yaml_raw):
        """branch_strategy and pr_strategy should render as Select widgets."""
        from textual.widgets import Select

        panel = ReposPanel()
        widgets = list(panel.compose())

        selects = [w for w in _walk_widgets(widgets) if isinstance(w, Select)]
        assert len(selects) >= 2, (
            f"Expected at least 2 Select widgets (branch_strategy, pr_strategy per repo), "
            f"got {len(selects)}"
        )

    def test_input_rendered_for_text_fields(self, sample_repos, sample_repos_yaml_raw):
        """description, test_command, etc. should render as Input widgets."""
        from textual.widgets import Input

        panel = ReposPanel()
        widgets = list(panel.compose())

        inputs = [w for w in _walk_widgets(widgets) if isinstance(w, Input)]
        # With 2 repos and multiple input fields each, should have many inputs
        assert len(inputs) >= 4, (
            f"Expected at least 4 Input widgets, got {len(inputs)}"
        )

    def test_switch_change_calls_set_repo_field(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Toggling a switch should call set_repo_field."""
        from textual.widgets import Switch

        panel = ReposPanel()
        # Simulate a switch change event
        switch = Switch(value=False, id="repo-orchestrator-simplify")
        event = Switch.Changed(switch, value=True)
        panel.on_switch_changed(event)
        mock_set_repo_field.assert_called_once()

    def test_select_change_calls_set_repo_field(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Changing a select should call set_repo_field."""
        from textual.widgets import Select

        panel = ReposPanel()
        select = Select(
            [("Trunk-Based", "trunk-based"), ("Gitflow", "gitflow")],
            value="trunk-based",
            id="repo-orchestrator-branch-strategy",
        )
        event = Select.Changed(select, value="gitflow")
        panel.on_select_changed(event)
        mock_set_repo_field.assert_called_once()

    def test_input_submit_calls_set_repo_field(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Submitting an input should call set_repo_field."""
        from textual.widgets import Input

        panel = ReposPanel()
        input_widget = Input(value="new desc", id="repo-orchestrator-description")
        event = Input.Submitted(input_widget, value="new desc")
        panel.on_input_submitted(event)
        mock_set_repo_field.assert_called_once()


# ---------------------------------------------------------------------------
# AC-6: Read-only fields display as Label widgets
# ---------------------------------------------------------------------------


class TestReadOnlyFields:
    """Read-only topology fields display as Label widgets showing current value."""

    def test_readonly_fields_rendered_as_labels(self, sample_repos, sample_repos_yaml_raw):
        """owns, never_edit, symlinks should render as Label (not Input/Switch/Select)."""
        from textual.widgets import Label

        panel = ReposPanel()
        widgets = list(panel.compose())

        labels = [w for w in _walk_widgets(widgets) if isinstance(w, Label)]
        # Should have labels for topology fields
        assert len(labels) > 0, "No Label widgets found for read-only fields"

    def test_readonly_fields_show_values(self, sample_repos, sample_repos_yaml_raw):
        """Read-only labels should display the actual values from the repo config."""
        from textual.widgets import Label

        panel = ReposPanel()
        widgets = list(panel.compose())

        labels = [w for w in _walk_widgets(widgets) if isinstance(w, Label)]
        # Find a label that shows owns content (sprint/**, docs/**)
        label_texts = []
        for label in labels:
            if hasattr(label, "renderable"):
                label_texts.append(str(label.renderable))

        # At least one label should contain a path pattern from owns
        owns_found = any("sprint/**" in t or "docs/**" in t for t in label_texts)
        assert owns_found, (
            f"No label found showing owns values. Label texts: {label_texts[:10]}"
        )


# ---------------------------------------------------------------------------
# AC-7: Global settings section at top ("Project")
# ---------------------------------------------------------------------------


class TestGlobalSection:
    """Global settings section at top for pr_title_format."""

    def test_project_section_exists(self, sample_repos, sample_repos_yaml_raw):
        """A 'Project' collapsible or section should appear at the top."""
        from textual.widgets import Collapsible

        panel = ReposPanel()
        widgets = list(panel.compose())

        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        project_sections = [c for c in collapsibles if c.title == "Project"]
        assert len(project_sections) == 1, (
            f"Expected 1 'Project' section, got {len(project_sections)}: "
            f"{[c.title for c in collapsibles]}"
        )

    def test_project_section_contains_pr_title_format(
        self, sample_repos, sample_repos_yaml_raw
    ):
        """Project section should contain pr_title_format field."""
        from textual.widgets import Collapsible, Input

        panel = ReposPanel()
        widgets = list(panel.compose())

        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        project = next((c for c in collapsibles if c.title == "Project"), None)
        assert project is not None

        inner = list(project.compose())
        inputs = [w for w in _walk_widgets(inner) if isinstance(w, Input)]
        assert len(inputs) >= 1, "Project section should have at least one Input (pr_title_format)"

    def test_project_section_appears_before_repos(
        self, sample_repos, sample_repos_yaml_raw
    ):
        """Project section should come before repo sections."""
        from textual.widgets import Collapsible

        panel = ReposPanel()
        widgets = list(panel.compose())

        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        titles = [c.title for c in collapsibles]

        if "Project" in titles and "orchestrator" in titles:
            assert titles.index("Project") < titles.index("orchestrator"), (
                f"Project should appear before repos. Order: {titles}"
            )


# ---------------------------------------------------------------------------
# AC-8: Status bar at bottom for save feedback
# ---------------------------------------------------------------------------


class TestStatusBar:
    """Status bar at bottom shows save/error feedback."""

    def test_status_bar_exists(self, sample_repos, sample_repos_yaml_raw):
        """A status Static widget should exist at the bottom."""
        from textual.widgets import Static

        panel = ReposPanel()
        widgets = list(panel.compose())

        statics = [w for w in _walk_widgets(widgets) if isinstance(w, Static)]
        status_widgets = [s for s in statics if getattr(s, "id", None) == "repos-status"]
        assert len(status_widgets) == 1, (
            f"Expected 1 status widget with id='repos-status', "
            f"found {len(status_widgets)}"
        )

    def test_save_shows_green_feedback(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Successful save should show green status message."""
        panel = ReposPanel()
        panel._show_status = MagicMock()

        # Simulate save
        from pf.tui.repos_meta import REPO_FIELDS_META

        spec = REPO_FIELDS_META["description"]
        panel._save_and_notify("orchestrator", spec, "new value")

        panel._show_status.assert_called_once()
        call_args = panel._show_status.call_args[0][0]
        assert "green" in call_args.lower() or "saved" in call_args.lower()

    def test_error_shows_red_feedback(self, sample_repos, sample_repos_yaml_raw):
        """Failed save should show red status message."""
        with patch(
            "pf.tui.repos_panel.set_repo_field",
            return_value={"success": False, "error": "Invalid field"},
        ):
            panel = ReposPanel()
            panel._show_status = MagicMock()

            from pf.tui.repos_meta import REPO_FIELDS_META

            spec = REPO_FIELDS_META["description"]
            panel._save_and_notify("orchestrator", spec, "bad value")

            panel._show_status.assert_called_once()
            call_args = panel._show_status.call_args[0][0]
            assert "red" in call_args.lower() or "error" in call_args.lower()


# ---------------------------------------------------------------------------
# AC-9: Panel registered in TUI
# ---------------------------------------------------------------------------


class TestPanelRegistration:
    """ReposPanel is registered in the TUI app and accessible via pf bc repos."""

    def test_repos_in_panel_registry(self):
        """PANEL_REGISTRY should include ('repos', 'Repos')."""
        from pf.tui.app import PANEL_REGISTRY

        keys = [key for key, _ in PANEL_REGISTRY]
        assert "repos" in keys, (
            f"'repos' not found in PANEL_REGISTRY keys: {keys}"
        )

    def test_repos_in_panel_display_names(self):
        """PANEL_DISPLAY_NAMES should include 'repos'."""
        from pf.tui.app import PANEL_DISPLAY_NAMES

        assert "repos" in PANEL_DISPLAY_NAMES, (
            f"'repos' not in PANEL_DISPLAY_NAMES: {list(PANEL_DISPLAY_NAMES.keys())}"
        )

    def test_repos_in_panel_icons(self):
        """PANEL_ICONS should have an entry for 'repos'."""
        from pf.tui.base_panel import PANEL_ICONS

        assert "repos" in PANEL_ICONS, (
            f"'repos' not in PANEL_ICONS: {list(PANEL_ICONS.keys())}"
        )


# ---------------------------------------------------------------------------
# AC-10: REPOS_CSS defined with appropriate styling
# ---------------------------------------------------------------------------


class TestCSS:
    """REPOS_CSS is defined with appropriate styling mirroring SettingsPanel."""

    def test_css_is_nonempty(self):
        assert len(REPOS_CSS) > 0, "REPOS_CSS should not be empty"

    def test_css_targets_repos_panel(self):
        assert "ReposPanel" in REPOS_CSS, "REPOS_CSS should target ReposPanel"

    def test_css_has_setting_row_styles(self):
        """Should style setting rows (mirroring SettingsPanel pattern)."""
        assert ".setting-row" in REPOS_CSS or ".field-row" in REPOS_CSS, (
            "REPOS_CSS should style rows"
        )

    def test_css_has_status_bar_style(self):
        """Should style the status bar at bottom."""
        assert "#repos-status" in REPOS_CSS, (
            "REPOS_CSS should style #repos-status"
        )


# ---------------------------------------------------------------------------
# AC-11: SettingChanged-like message posted on changes
# ---------------------------------------------------------------------------


class TestMessagePosting:
    """RepoFieldChanged message posted on field changes."""

    def test_repo_field_changed_message_class_exists(self):
        assert hasattr(ReposPanel, "RepoFieldChanged")

    def test_repo_field_changed_has_required_attrs(self):
        msg = ReposPanel.RepoFieldChanged("orchestrator", "description", "new")
        assert msg.repo_name == "orchestrator"
        assert msg.field == "description"
        assert msg.value == "new"

    def test_save_posts_repo_field_changed(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Saving a field should post RepoFieldChanged message."""
        panel = ReposPanel()
        panel.post_message = MagicMock()
        panel._show_status = MagicMock()

        from pf.tui.repos_meta import REPO_FIELDS_META

        spec = REPO_FIELDS_META["description"]
        panel._save_and_notify("orchestrator", spec, "updated desc")

        panel.post_message.assert_called_once()
        msg = panel.post_message.call_args[0][0]
        assert isinstance(msg, ReposPanel.RepoFieldChanged)
        assert msg.repo_name == "orchestrator"
        assert msg.field == "description"
        assert msg.value == "updated desc"


# ---------------------------------------------------------------------------
# Event handler tests (widget ID → repo_name + field resolution)
# ---------------------------------------------------------------------------


class TestEventHandlers:
    """Widget event handlers correctly resolve repo_name and field from widget ID."""

    def test_has_on_switch_changed(self):
        assert hasattr(ReposPanel, "on_switch_changed")

    def test_has_on_select_changed(self):
        assert hasattr(ReposPanel, "on_select_changed")

    def test_has_on_input_submitted(self):
        assert hasattr(ReposPanel, "on_input_submitted")

    def test_unknown_widget_id_ignored(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Events from unknown widget IDs should not call set_repo_field."""
        from textual.widgets import Switch

        panel = ReposPanel()
        switch = Switch(value=False, id="unknown-widget")
        event = Switch.Changed(switch, value=True)
        panel.on_switch_changed(event)
        mock_set_repo_field.assert_not_called()

    def test_none_widget_id_ignored(
        self, sample_repos, sample_repos_yaml_raw, mock_set_repo_field
    ):
        """Events with None widget ID should not crash."""
        from textual.widgets import Switch

        panel = ReposPanel()
        switch = Switch(value=False)
        switch.id = None
        event = Switch.Changed(switch, value=True)
        panel.on_switch_changed(event)
        mock_set_repo_field.assert_not_called()


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases: single repo, missing optional fields."""

    def test_single_repo(self, sample_repos_yaml_raw):
        """Single repo should produce exactly one repo collapsible."""
        from textual.widgets import Collapsible

        from pf.git.repos import _parse_repo_entry

        single = {"solo": _parse_repo_entry("solo", {"type": "api", "default_branch": "main", "branch_strategy": "trunk-based"})}
        with patch("pf.tui.repos_panel.load_repos_config", return_value=single):
            panel = ReposPanel()
            widgets = list(panel.compose())

        collapsibles = [w for w in _walk_widgets(widgets) if isinstance(w, Collapsible)]
        repo_collapsibles = [c for c in collapsibles if c.title == "solo"]
        assert len(repo_collapsibles) == 1

    def test_repo_with_empty_optional_fields(self, sample_repos_yaml_raw):
        """Repo with empty strings and empty lists should render without errors."""

        from pf.git.repos import _parse_repo_entry

        minimal = {"bare": _parse_repo_entry("bare", {"type": "library", "default_branch": "main", "branch_strategy": "trunk-based"})}
        with patch("pf.tui.repos_panel.load_repos_config", return_value=minimal):
            panel = ReposPanel()
            widgets = list(panel.compose())

        # Should not raise — just verify we get output
        assert len(widgets) > 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _walk_widgets(widgets: list) -> list:
    """Recursively collect widgets from a compose result.

    Handles both Widget instances and generator results from context managers.
    """
    result = []
    for w in widgets:
        result.append(w)
        if hasattr(w, "compose"):
            try:
                inner = list(w.compose())
                result.extend(_walk_widgets(inner))
            except Exception:
                pass
    return result
