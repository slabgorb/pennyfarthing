"""Tests for RepoFieldSpec registry — Story 147-4.

Verifies repos_meta.py provides a typed registry for repo field specifications,
mirroring the SettingSpec pattern in settings_meta.py but scoped to per-repo
fields in repos.yaml.

RED state: Tests will fail until REPO_FIELDS_META and build_repo_field_specs()
are properly populated.
"""

from __future__ import annotations

import pytest

from pf.bikerack.repos_meta import (
    GLOBAL_REPO_FIELDS,
    REPO_FIELDS_META,
    RepoFieldSpec,
    build_repo_field_specs,
)


# ---------------------------------------------------------------------------
# AC-2: RepoFieldSpec dataclass structure
# ---------------------------------------------------------------------------


class TestRepoFieldSpecDataclass:
    """RepoFieldSpec has required and optional fields with correct defaults."""

    def test_required_fields_only(self):
        spec = RepoFieldSpec(
            field="description",
            label="Description",
            widget_type="input",
        )
        assert spec.field == "description"
        assert spec.label == "Description"
        assert spec.widget_type == "input"

    def test_default_group_is_general(self):
        spec = RepoFieldSpec(field="x", label="X", widget_type="input")
        assert spec.group == "General"

    def test_default_options_is_none(self):
        spec = RepoFieldSpec(field="x", label="X", widget_type="input")
        assert spec.options is None

    def test_default_description_is_empty(self):
        spec = RepoFieldSpec(field="x", label="X", widget_type="input")
        assert spec.description == ""

    def test_default_read_only_is_false(self):
        spec = RepoFieldSpec(field="x", label="X", widget_type="input")
        assert spec.read_only is False

    def test_all_fields_settable(self):
        spec = RepoFieldSpec(
            field="type",
            label="Type",
            widget_type="select",
            group="General",
            options=[("Orchestrator", "orchestrator"), ("Framework", "framework")],
            description="Repository type",
            read_only=True,
        )
        assert spec.field == "type"
        assert spec.label == "Type"
        assert spec.widget_type == "select"
        assert spec.group == "General"
        assert spec.options == [("Orchestrator", "orchestrator"), ("Framework", "framework")]
        assert spec.description == "Repository type"
        assert spec.read_only is True


# ---------------------------------------------------------------------------
# AC-3: REPO_FIELDS_META dict populated with all required fields
# ---------------------------------------------------------------------------


class TestRepoFieldsMetaRegistry:
    """REPO_FIELDS_META maps field names to RepoFieldSpec instances."""

    def test_registry_is_not_empty(self):
        assert len(REPO_FIELDS_META) > 0, "REPO_FIELDS_META should be populated"

    def test_registry_values_are_repo_field_specs(self):
        for key, spec in REPO_FIELDS_META.items():
            assert isinstance(spec, RepoFieldSpec), f"{key} should be a RepoFieldSpec"

    def test_registry_keys_match_field_names(self):
        for key, spec in REPO_FIELDS_META.items():
            assert key == spec.field, f"Key '{key}' should match spec.field '{spec.field}'"

    # --- AC-5: Required fields per group ---

    # General group
    def test_description_field_exists(self):
        assert "description" in REPO_FIELDS_META

    def test_type_field_exists(self):
        assert "type" in REPO_FIELDS_META

    def test_branch_strategy_field_exists(self):
        assert "branch_strategy" in REPO_FIELDS_META

    def test_default_branch_field_exists(self):
        assert "default_branch" in REPO_FIELDS_META

    # Build group
    def test_test_command_field_exists(self):
        assert "test_command" in REPO_FIELDS_META

    def test_build_command_field_exists(self):
        assert "build_command" in REPO_FIELDS_META

    def test_lint_command_field_exists(self):
        assert "lint_command" in REPO_FIELDS_META

    def test_test_filter_flag_field_exists(self):
        assert "test_filter_flag" in REPO_FIELDS_META

    # PR group
    def test_pr_strategy_field_exists(self):
        assert "pr_strategy" in REPO_FIELDS_META

    def test_stack_tool_field_exists(self):
        assert "stack_tool" in REPO_FIELDS_META

    # Quality group
    def test_simplify_field_exists(self):
        assert "simplify" in REPO_FIELDS_META

    # Topology group
    def test_owns_field_exists(self):
        assert "owns" in REPO_FIELDS_META

    def test_never_edit_field_exists(self):
        assert "never_edit" in REPO_FIELDS_META

    def test_symlinks_field_exists(self):
        assert "symlinks" in REPO_FIELDS_META

    def test_minimum_field_count(self):
        """At least 14 fields per AC-5 table."""
        assert len(REPO_FIELDS_META) >= 14


# ---------------------------------------------------------------------------
# AC-5: Widget types per field
# ---------------------------------------------------------------------------


class TestWidgetTypes:
    """Each field has the correct widget_type per AC-5 specification."""

    def test_description_is_input(self):
        assert REPO_FIELDS_META["description"].widget_type == "input"

    def test_type_is_select(self):
        assert REPO_FIELDS_META["type"].widget_type == "select"

    def test_branch_strategy_is_select(self):
        assert REPO_FIELDS_META["branch_strategy"].widget_type == "select"

    def test_default_branch_is_input(self):
        assert REPO_FIELDS_META["default_branch"].widget_type == "input"

    def test_test_command_is_input(self):
        assert REPO_FIELDS_META["test_command"].widget_type == "input"

    def test_build_command_is_input(self):
        assert REPO_FIELDS_META["build_command"].widget_type == "input"

    def test_lint_command_is_input(self):
        assert REPO_FIELDS_META["lint_command"].widget_type == "input"

    def test_test_filter_flag_is_input(self):
        assert REPO_FIELDS_META["test_filter_flag"].widget_type == "input"

    def test_pr_strategy_is_select(self):
        assert REPO_FIELDS_META["pr_strategy"].widget_type == "select"

    def test_stack_tool_is_input(self):
        assert REPO_FIELDS_META["stack_tool"].widget_type == "input"

    def test_simplify_is_switch(self):
        assert REPO_FIELDS_META["simplify"].widget_type == "switch"

    def test_owns_is_readonly(self):
        assert REPO_FIELDS_META["owns"].widget_type == "readonly"

    def test_never_edit_is_readonly(self):
        assert REPO_FIELDS_META["never_edit"].widget_type == "readonly"

    def test_symlinks_is_readonly(self):
        assert REPO_FIELDS_META["symlinks"].widget_type == "readonly"


# ---------------------------------------------------------------------------
# AC-5: Read-only flags
# ---------------------------------------------------------------------------


class TestReadOnlyFlags:
    """Topology fields and type are read-only; others are editable."""

    def test_type_is_read_only(self):
        assert REPO_FIELDS_META["type"].read_only is True

    def test_owns_is_read_only(self):
        assert REPO_FIELDS_META["owns"].read_only is True

    def test_never_edit_is_read_only(self):
        assert REPO_FIELDS_META["never_edit"].read_only is True

    def test_symlinks_is_read_only(self):
        assert REPO_FIELDS_META["symlinks"].read_only is True

    def test_description_is_not_read_only(self):
        assert REPO_FIELDS_META["description"].read_only is False

    def test_branch_strategy_is_not_read_only(self):
        assert REPO_FIELDS_META["branch_strategy"].read_only is False

    def test_default_branch_is_not_read_only(self):
        assert REPO_FIELDS_META["default_branch"].read_only is False

    def test_test_command_is_not_read_only(self):
        assert REPO_FIELDS_META["test_command"].read_only is False

    def test_simplify_is_not_read_only(self):
        assert REPO_FIELDS_META["simplify"].read_only is False

    def test_pr_strategy_is_not_read_only(self):
        assert REPO_FIELDS_META["pr_strategy"].read_only is False


# ---------------------------------------------------------------------------
# AC-5: Groups per field
# ---------------------------------------------------------------------------


class TestFieldGroups:
    """Each field is assigned to the correct group per AC-5 table."""

    def test_description_in_general(self):
        assert REPO_FIELDS_META["description"].group == "General"

    def test_type_in_general(self):
        assert REPO_FIELDS_META["type"].group == "General"

    def test_branch_strategy_in_general(self):
        assert REPO_FIELDS_META["branch_strategy"].group == "General"

    def test_default_branch_in_general(self):
        assert REPO_FIELDS_META["default_branch"].group == "General"

    def test_test_command_in_build(self):
        assert REPO_FIELDS_META["test_command"].group == "Build"

    def test_build_command_in_build(self):
        assert REPO_FIELDS_META["build_command"].group == "Build"

    def test_lint_command_in_build(self):
        assert REPO_FIELDS_META["lint_command"].group == "Build"

    def test_test_filter_flag_in_build(self):
        assert REPO_FIELDS_META["test_filter_flag"].group == "Build"

    def test_pr_strategy_in_pr(self):
        assert REPO_FIELDS_META["pr_strategy"].group == "PR"

    def test_stack_tool_in_pr(self):
        assert REPO_FIELDS_META["stack_tool"].group == "PR"

    def test_simplify_in_quality(self):
        assert REPO_FIELDS_META["simplify"].group == "Quality"

    def test_owns_in_topology(self):
        assert REPO_FIELDS_META["owns"].group == "Topology"

    def test_never_edit_in_topology(self):
        assert REPO_FIELDS_META["never_edit"].group == "Topology"

    def test_symlinks_in_topology(self):
        assert REPO_FIELDS_META["symlinks"].group == "Topology"


# ---------------------------------------------------------------------------
# AC-5: Select widget options
# ---------------------------------------------------------------------------


class TestSelectOptions:
    """Select widgets have the correct options lists."""

    def test_type_has_required_options(self):
        spec = REPO_FIELDS_META["type"]
        assert spec.options is not None
        values = [v for _, v in spec.options]
        assert "orchestrator" in values
        assert "framework" in values
        assert "api" in values
        assert "ui" in values
        assert "cli" in values
        assert "library" in values

    def test_branch_strategy_options(self):
        spec = REPO_FIELDS_META["branch_strategy"]
        assert spec.options is not None
        values = [v for _, v in spec.options]
        assert "trunk-based" in values
        assert "gitflow" in values

    def test_pr_strategy_options(self):
        spec = REPO_FIELDS_META["pr_strategy"]
        assert spec.options is not None
        values = [v for _, v in spec.options]
        assert "standard" in values
        assert "stacked" in values

    def test_input_fields_have_no_options(self):
        """Input widgets should not have options lists."""
        for key, spec in REPO_FIELDS_META.items():
            if spec.widget_type == "input":
                assert spec.options is None, f"{key} is input but has options"

    def test_switch_fields_have_no_options(self):
        """Switch widgets should not have options lists."""
        for key, spec in REPO_FIELDS_META.items():
            if spec.widget_type == "switch":
                assert spec.options is None, f"{key} is switch but has options"


# ---------------------------------------------------------------------------
# AC-5: Descriptions
# ---------------------------------------------------------------------------


class TestDescriptions:
    """Each field spec should have a non-empty description."""

    def test_all_specs_have_descriptions(self):
        for key, spec in REPO_FIELDS_META.items():
            assert spec.description != "", f"Field '{key}' has no description"


# ---------------------------------------------------------------------------
# AC-4: build_repo_field_specs() returns ordered list
# ---------------------------------------------------------------------------


class TestBuildRepoFieldSpecs:
    """build_repo_field_specs() returns an ordered list of all specs."""

    def test_returns_list(self):
        result = build_repo_field_specs()
        assert isinstance(result, list)

    def test_returns_non_empty(self):
        result = build_repo_field_specs()
        assert len(result) > 0

    def test_all_items_are_repo_field_specs(self):
        result = build_repo_field_specs()
        for item in result:
            assert isinstance(item, RepoFieldSpec)

    def test_contains_all_registry_fields(self):
        result = build_repo_field_specs()
        result_fields = {spec.field for spec in result}
        for key in REPO_FIELDS_META:
            assert key in result_fields, f"Field '{key}' missing from build_repo_field_specs()"

    def test_groups_are_contiguous(self):
        """Fields within the same group should be adjacent in the list."""
        result = build_repo_field_specs()
        seen_groups: list[str] = []
        for spec in result:
            if spec.group not in seen_groups:
                seen_groups.append(spec.group)
            else:
                # If we've seen this group before, it must be the current tail
                assert seen_groups[-1] == spec.group, (
                    f"Group '{spec.group}' is not contiguous — "
                    f"found after '{seen_groups[-1]}'"
                )


# ---------------------------------------------------------------------------
# AC-6: GLOBAL_REPO_FIELDS
# ---------------------------------------------------------------------------


class TestGlobalRepoFields:
    """GLOBAL_REPO_FIELDS lists top-level repos.yaml fields."""

    def test_is_list(self):
        assert isinstance(GLOBAL_REPO_FIELDS, list)

    def test_not_empty(self):
        assert len(GLOBAL_REPO_FIELDS) > 0

    def test_contains_pr_title_format(self):
        assert "pr_title_format" in GLOBAL_REPO_FIELDS

    def test_contains_build_order(self):
        assert "build_order" in GLOBAL_REPO_FIELDS

    def test_all_entries_are_strings(self):
        for entry in GLOBAL_REPO_FIELDS:
            assert isinstance(entry, str), f"Entry {entry!r} should be a string"


# ---------------------------------------------------------------------------
# Edge cases and consistency checks
# ---------------------------------------------------------------------------


class TestConsistency:
    """Cross-cutting validation for registry integrity."""

    def test_widget_types_are_valid(self):
        valid = {"switch", "select", "input", "readonly"}
        for key, spec in REPO_FIELDS_META.items():
            assert spec.widget_type in valid, (
                f"Field '{key}' has invalid widget_type '{spec.widget_type}'"
            )

    def test_groups_are_valid(self):
        valid = {"General", "Build", "PR", "Quality", "Topology"}
        for key, spec in REPO_FIELDS_META.items():
            assert spec.group in valid, (
                f"Field '{key}' has invalid group '{spec.group}'"
            )

    def test_readonly_widget_implies_read_only_flag(self):
        """If widget_type is 'readonly', read_only flag should be True."""
        for key, spec in REPO_FIELDS_META.items():
            if spec.widget_type == "readonly":
                assert spec.read_only is True, (
                    f"Field '{key}' has widget_type='readonly' but read_only=False"
                )

    def test_select_widgets_have_options(self):
        """Select widgets must have non-empty options."""
        for key, spec in REPO_FIELDS_META.items():
            if spec.widget_type == "select":
                assert spec.options is not None and len(spec.options) > 0, (
                    f"Select field '{key}' has no options"
                )

    def test_options_are_label_value_tuples(self):
        """Options must be list of (label, value) 2-tuples."""
        for key, spec in REPO_FIELDS_META.items():
            if spec.options is not None:
                for i, opt in enumerate(spec.options):
                    assert isinstance(opt, tuple) and len(opt) == 2, (
                        f"Field '{key}' option {i} is not a (label, value) tuple: {opt!r}"
                    )
                    assert isinstance(opt[0], str), (
                        f"Field '{key}' option {i} label should be str: {opt[0]!r}"
                    )
