"""Tests for settings metadata completeness — Story 148-7.

Verifies that EVERY setting in DEFAULTS has explicit metadata in SETTINGS_META
with human-readable labels, descriptions, proper groups, and correct widget types.
No auto-inferred fallbacks allowed.

RED state: Tests will fail until all SETTINGS_META entries are explicit.
"""

from __future__ import annotations

import pytest

from pf.settings.settings import DEFAULTS
from pf.tui.settings_meta import (
    HIDDEN_KEYS,
    SETTINGS_META,
    SettingSpec,
    _flatten_defaults,
    build_setting_specs,
)


# ---------------------------------------------------------------------------
# Helper: get all non-hidden setting keys from DEFAULTS
# ---------------------------------------------------------------------------

def _visible_default_keys() -> list[str]:
    """Return all dot-path keys from DEFAULTS that aren't hidden."""
    flat = _flatten_defaults(DEFAULTS)
    visible = []
    for dot_key, _value in flat:
        top_key = dot_key.split(".")[0]
        if dot_key not in HIDDEN_KEYS and top_key not in HIDDEN_KEYS:
            visible.append(dot_key)
    return visible


# ---------------------------------------------------------------------------
# AC1: All DEFAULTS entries have explicit SETTINGS_META entries
# ---------------------------------------------------------------------------

class TestAC1ExplicitMetadata:
    """Every visible setting in DEFAULTS must have an explicit SETTINGS_META entry."""

    def test_all_defaults_have_explicit_meta(self):
        """No setting should rely on auto-inferred fallback."""
        visible_keys = _visible_default_keys()
        missing = [k for k in visible_keys if k not in SETTINGS_META]
        assert missing == [], (
            f"Settings missing explicit SETTINGS_META entries (auto-inferred): {missing}"
        )

    def test_no_auto_inferred_specs_in_build(self):
        """build_setting_specs() should never produce auto-inferred specs.

        An auto-inferred spec has an empty description and a label derived
        from the key rather than set explicitly. After the rework, every
        spec returned should come from SETTINGS_META.
        """
        specs = build_setting_specs()
        for spec in specs:
            assert spec.key in SETTINGS_META, (
                f"Setting '{spec.key}' was auto-inferred by build_setting_specs() "
                f"instead of using an explicit SETTINGS_META entry"
            )

    @pytest.mark.parametrize("key", _visible_default_keys())
    def test_each_default_has_meta_entry(self, key: str):
        """Parametrized: each visible DEFAULTS key has a SETTINGS_META entry."""
        assert key in SETTINGS_META, (
            f"Setting '{key}' in DEFAULTS has no explicit SETTINGS_META entry"
        )


# ---------------------------------------------------------------------------
# AC2: Settings organized into logical groups with clear category labels
# ---------------------------------------------------------------------------

class TestAC2GroupOrganization:
    """Settings must be organized into meaningful, clearly-labeled groups."""

    EXPECTED_GROUPS = {"General", "Workflow", "TUI", "Jira"}

    def test_all_specs_have_non_empty_group(self):
        """Every spec must have a group assigned."""
        specs = build_setting_specs()
        for spec in specs:
            assert spec.group, f"Setting '{spec.key}' has an empty group"

    def test_expected_groups_exist(self):
        """The settings panel should have at least these groups."""
        specs = build_setting_specs()
        groups = {spec.group for spec in specs}
        for expected in self.EXPECTED_GROUPS:
            assert expected in groups, (
                f"Expected group '{expected}' not found in settings groups: {groups}"
            )

    def test_jira_settings_in_jira_group(self):
        """Jira-related settings must be in a 'Jira' group, not 'General'."""
        specs = build_setting_specs()
        jira_specs = [s for s in specs if s.key.startswith("jira.")]
        assert len(jira_specs) > 0, "No jira settings found in build_setting_specs()"
        for spec in jira_specs:
            assert spec.group == "Jira", (
                f"Jira setting '{spec.key}' is in group '{spec.group}' "
                f"instead of 'Jira'"
            )

    def test_tui_settings_in_tui_group(self):
        """TUI-related settings must be in the 'TUI' group."""
        specs = build_setting_specs()
        tui_specs = [s for s in specs if s.key.startswith("tui.")]
        for spec in tui_specs:
            assert spec.group == "TUI", (
                f"TUI setting '{spec.key}' is in group '{spec.group}' "
                f"instead of 'TUI'"
            )

    def test_workflow_settings_in_workflow_group(self):
        """Workflow settings must be in 'Workflow' (or 'TUI' for tui_statusbar)."""
        specs = build_setting_specs()
        allowed_groups = {"Workflow", "TUI"}
        workflow_specs = [s for s in specs if s.key.startswith("workflow.")]
        for spec in workflow_specs:
            assert spec.group in allowed_groups, (
                f"Workflow setting '{spec.key}' is in unexpected group '{spec.group}'"
            )

    def test_no_orphan_general_group(self):
        """Settings that belong to a namespace shouldn't fall into 'General'
        just because auto-inference defaulted them there."""
        specs = build_setting_specs()
        general_specs = [s for s in specs if s.group == "General"]
        for spec in general_specs:
            # General is only valid for top-level keys (no dot in key)
            assert "." not in spec.key or spec.key in SETTINGS_META, (
                f"Namespaced setting '{spec.key}' fell into 'General' group "
                f"(likely auto-inferred instead of explicit metadata)"
            )


# ---------------------------------------------------------------------------
# AC3: Each setting has human-readable label and description
# ---------------------------------------------------------------------------

class TestAC3LabelsAndDescriptions:
    """Every setting must have a human-readable label and description."""

    def test_all_specs_have_non_empty_label(self):
        """Every setting spec must have a meaningful label."""
        specs = build_setting_specs()
        for spec in specs:
            assert spec.label, f"Setting '{spec.key}' has an empty label"

    def test_all_specs_have_non_empty_description(self):
        """Every setting spec must have a description explaining what it does."""
        specs = build_setting_specs()
        for spec in specs:
            assert spec.description, (
                f"Setting '{spec.key}' has an empty description"
            )

    def test_labels_are_not_auto_derived(self):
        """Labels should be human-written, not auto-derived from key names.

        Auto-derived labels look like 'Pr Mode' (from 'pr_mode') instead of
        'PR Mode'. Check that labels don't match the auto-derive pattern.
        """
        specs = build_setting_specs()
        for spec in specs:
            short = spec.key.rsplit(".", 1)[-1]
            auto_label = short.replace("_", " ").title()
            # If the label matches auto-derive AND there's no explicit meta,
            # it was auto-inferred
            if spec.key not in SETTINGS_META:
                assert spec.label != auto_label, (
                    f"Setting '{spec.key}' has auto-derived label '{spec.label}' — "
                    f"needs a human-readable label"
                )

    @pytest.mark.parametrize("key", _visible_default_keys())
    def test_each_setting_has_description(self, key: str):
        """Parametrized: each visible setting has a non-empty description."""
        if key in SETTINGS_META:
            assert SETTINGS_META[key].description, (
                f"Setting '{key}' has SETTINGS_META entry but empty description"
            )
        else:
            pytest.fail(
                f"Setting '{key}' has no SETTINGS_META entry — "
                f"cannot verify description"
            )


# ---------------------------------------------------------------------------
# AC4: New settings properly categorized with correct widget types
# ---------------------------------------------------------------------------

class TestAC4WidgetTypes:
    """Widget types must match the nature of the setting value."""

    def test_boolean_defaults_use_switch_widget(self):
        """Settings with boolean defaults should use 'switch' widget."""
        flat = _flatten_defaults(DEFAULTS)
        specs = build_setting_specs()
        spec_map = {s.key: s for s in specs}

        for dot_key, value in flat:
            if not isinstance(value, bool):
                continue
            top = dot_key.split(".")[0]
            if dot_key in HIDDEN_KEYS or top in HIDDEN_KEYS:
                continue
            if dot_key in spec_map:
                assert spec_map[dot_key].widget_type == "switch", (
                    f"Boolean setting '{dot_key}' uses widget '{spec_map[dot_key].widget_type}' "
                    f"instead of 'switch'"
                )

    def test_select_widgets_have_options(self):
        """Settings with 'select' widget type must have options defined."""
        specs = build_setting_specs()
        for spec in specs:
            if spec.widget_type == "select":
                options = spec.get_options()
                assert len(options) >= 2, (
                    f"Select setting '{spec.key}' has fewer than 2 options: {options}"
                )

    def test_select_options_have_labels_and_values(self):
        """Each select option must be a (label, value) tuple."""
        specs = build_setting_specs()
        for spec in specs:
            if spec.widget_type != "select":
                continue
            for option in spec.get_options():
                assert isinstance(option, tuple) and len(option) == 2, (
                    f"Option in '{spec.key}' is not a (label, value) tuple: {option}"
                )
                label, value = option
                assert isinstance(label, str) and label, (
                    f"Option label in '{spec.key}' is empty or not a string: {label}"
                )

    def test_jira_url_uses_input_widget(self):
        """jira.url should be an input widget since it's a free-form URL."""
        assert "jira.url" in SETTINGS_META, (
            "jira.url must have explicit SETTINGS_META entry"
        )
        assert SETTINGS_META["jira.url"].widget_type == "input", (
            f"jira.url should use 'input' widget, "
            f"got '{SETTINGS_META['jira.url'].widget_type}'"
        )

    def test_jira_project_uses_input_widget(self):
        """jira.project should be an input widget for the project key."""
        assert "jira.project" in SETTINGS_META, (
            "jira.project must have explicit SETTINGS_META entry"
        )
        assert SETTINGS_META["jira.project"].widget_type == "input", (
            f"jira.project should use 'input' widget, "
            f"got '{SETTINGS_META['jira.project'].widget_type}'"
        )

    def test_no_unknown_widget_types(self):
        """All widget types must be one of the recognized types."""
        valid_types = {"switch", "select", "input"}
        specs = build_setting_specs()
        for spec in specs:
            assert spec.widget_type in valid_types, (
                f"Setting '{spec.key}' has unknown widget type '{spec.widget_type}'"
            )


# ---------------------------------------------------------------------------
# Integration: build_setting_specs() coherence
# ---------------------------------------------------------------------------

class TestBuildSettingSpecsCoherence:
    """Verify build_setting_specs() produces a coherent, complete spec list."""

    def test_spec_count_matches_visible_defaults(self):
        """The number of specs should match the number of visible DEFAULTS."""
        visible = _visible_default_keys()
        specs = build_setting_specs()
        assert len(specs) == len(visible), (
            f"Expected {len(visible)} specs for visible defaults, "
            f"got {len(specs)}. "
            f"Visible keys: {visible}, "
            f"Spec keys: {[s.key for s in specs]}"
        )

    def test_no_duplicate_keys_in_specs(self):
        """Each setting key should appear exactly once."""
        specs = build_setting_specs()
        keys = [s.key for s in specs]
        duplicates = [k for k in keys if keys.count(k) > 1]
        assert not duplicates, f"Duplicate keys in specs: {set(duplicates)}"

    def test_hidden_keys_excluded(self):
        """Hidden keys should not appear in built specs."""
        specs = build_setting_specs()
        spec_keys = {s.key for s in specs}
        for hidden in HIDDEN_KEYS:
            assert hidden not in spec_keys, (
                f"Hidden key '{hidden}' appeared in build_setting_specs()"
            )
