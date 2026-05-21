"""E2E tests for reviewer subagent toggle pipeline — Story 150-11.

Verifies the full settings pipeline for reviewer subagent toggles:
config → storage → runtime → output. Each test proves one link in the
chain actually works, not just that the data structures exist.

RED state: Tests that verify E2E behavior of the reviewer toggle system.
"""

from __future__ import annotations

import os
import re
import textwrap
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml

from pf.handoff.complete_phase import (
    REQUIRED_SUBAGENTS,
    SUBAGENT_DISPATCH_TAGS,
    _SUBAGENT_SETTING_MAP,
    _check_subagent_completion,
    _check_subagent_dispatch,
    _get_enabled_subagents,
)
from pf.settings.settings import DEFAULTS, _coerce_value, _deep_merge, _get_by_path, _set_by_path
from pf.tui.settings_meta import SETTINGS_META, build_setting_specs


# ---------------------------------------------------------------------------
# AC1: Reviewer subagent specialist checks are gatable via settings
# ---------------------------------------------------------------------------


class TestAC1SettingsGating:
    """Toggle settings must control which subagents are enabled."""

    def test_all_nine_subagents_in_defaults(self):
        """DEFAULTS must define all 9 reviewer subagent toggles."""
        toggles = DEFAULTS["workflow"]["reviewer_subagents"]
        expected = {
            "preflight", "edge_hunter", "silent_failure_hunter",
            "test_analyzer", "comment_analyzer", "type_design",
            "security", "simplifier", "rule_checker",
        }
        assert set(toggles.keys()) == expected

    def test_all_defaults_are_true(self):
        """All toggles default to enabled (True)."""
        toggles = DEFAULTS["workflow"]["reviewer_subagents"]
        for key, val in toggles.items():
            assert val is True, f"Toggle {key} defaults to {val}, expected True"

    def test_setting_map_covers_all_defaults(self):
        """_SUBAGENT_SETTING_MAP must have an entry for every DEFAULTS toggle."""
        default_keys = set(DEFAULTS["workflow"]["reviewer_subagents"].keys())
        map_keys = set(_SUBAGENT_SETTING_MAP.keys())
        assert map_keys == default_keys, (
            f"Mismatch: DEFAULTS has {default_keys - map_keys} not in map, "
            f"map has {map_keys - default_keys} not in DEFAULTS"
        )

    def test_setting_map_names_match_required_subagents(self):
        """Every subagent name in the setting map must be in REQUIRED_SUBAGENTS."""
        map_names = {name for name, _tag in _SUBAGENT_SETTING_MAP.values()}
        assert map_names == REQUIRED_SUBAGENTS

    def test_setting_map_tags_match_dispatch_tags(self):
        """Every non-None tag in the setting map must be in SUBAGENT_DISPATCH_TAGS."""
        map_tags = {tag for _name, tag in _SUBAGENT_SETTING_MAP.values() if tag is not None}
        assert map_tags == SUBAGENT_DISPATCH_TAGS

    def test_all_enabled_when_all_true(self):
        """With all toggles True, all subagents should be enabled."""
        all_true = {k: True for k in _SUBAGENT_SETTING_MAP}
        with patch("pf.settings.settings.get_setting", return_value=all_true):
            names, tags = _get_enabled_subagents()
        assert names == REQUIRED_SUBAGENTS
        assert tags == SUBAGENT_DISPATCH_TAGS

    def test_disable_one_subagent(self):
        """Disabling one toggle should remove exactly that subagent."""
        toggles = {k: True for k in _SUBAGENT_SETTING_MAP}
        toggles["security"] = False
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            names, tags = _get_enabled_subagents()
        assert "reviewer-security" not in names
        assert "[SEC]" not in tags
        # Other 8 should still be there
        assert len(names) == 8
        assert len(tags) == 7  # preflight has no tag

    def test_disable_multiple_subagents(self):
        """Disabling multiple toggles removes all of them."""
        toggles = {k: True for k in _SUBAGENT_SETTING_MAP}
        toggles["security"] = False
        toggles["simplifier"] = False
        toggles["comment_analyzer"] = False
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            names, tags = _get_enabled_subagents()
        assert "reviewer-security" not in names
        assert "reviewer-simplifier" not in names
        assert "reviewer-comment-analyzer" not in names
        assert "[SEC]" not in tags
        assert "[SIMPLE]" not in tags
        assert "[DOC]" not in tags
        assert len(names) == 6

    def test_disable_all_except_preflight(self):
        """Edge case: all optional subagents disabled, only preflight remains."""
        toggles = {k: False for k in _SUBAGENT_SETTING_MAP}
        toggles["preflight"] = True
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            names, tags = _get_enabled_subagents()
        assert names == {"reviewer-preflight"}
        assert tags == set()  # preflight has no dispatch tag

    def test_empty_toggles_defaults_all_enabled(self):
        """If settings returns empty dict, all subagents default to enabled."""
        with patch("pf.settings.settings.get_setting", return_value={}):
            names, tags = _get_enabled_subagents()
        assert names == REQUIRED_SUBAGENTS

    def test_settings_exception_defaults_all_enabled(self):
        """If settings raises an exception, all subagents default to enabled."""
        with patch("pf.settings.settings.get_setting", side_effect=Exception("boom")):
            names, tags = _get_enabled_subagents()
        assert names == REQUIRED_SUBAGENTS


# ---------------------------------------------------------------------------
# AC2: Settings UI exposes toggles for specialist subagent profiles
# ---------------------------------------------------------------------------


class TestAC2SettingsMetadata:
    """SETTINGS_META must have proper entries for all reviewer toggles."""

    REVIEWER_KEYS = [
        f"workflow.reviewer_subagents.{k}" for k in _SUBAGENT_SETTING_MAP
    ]

    def test_all_toggles_have_metadata(self):
        """Every reviewer toggle must have an explicit SETTINGS_META entry."""
        missing = [k for k in self.REVIEWER_KEYS if k not in SETTINGS_META]
        assert missing == [], f"Missing SETTINGS_META for: {missing}"

    def test_all_toggles_are_switch_widgets(self):
        """Boolean toggles must use 'switch' widget type."""
        for key in self.REVIEWER_KEYS:
            spec = SETTINGS_META[key]
            assert spec.widget_type == "switch", (
                f"{key} has widget_type '{spec.widget_type}', expected 'switch'"
            )

    def test_all_toggles_in_workflow_group(self):
        """Reviewer toggles must be grouped under 'Workflow'."""
        for key in self.REVIEWER_KEYS:
            spec = SETTINGS_META[key]
            assert spec.group == "Workflow", (
                f"{key} in group '{spec.group}', expected 'Workflow'"
            )

    def test_all_toggles_have_labels(self):
        """Each toggle must have a non-empty, human-readable label."""
        for key in self.REVIEWER_KEYS:
            spec = SETTINGS_META[key]
            assert spec.label, f"{key} has empty label"
            assert "reviewer" in spec.label.lower() or "Reviewer" in spec.label, (
                f"{key} label '{spec.label}' should mention 'Reviewer'"
            )

    def test_all_toggles_have_descriptions(self):
        """Each toggle must have a non-empty description."""
        for key in self.REVIEWER_KEYS:
            spec = SETTINGS_META[key]
            assert spec.description, f"{key} has empty description"
            assert len(spec.description) > 10, (
                f"{key} description too short: '{spec.description}'"
            )

    def test_toggles_appear_in_build_setting_specs(self):
        """build_setting_specs() must include all reviewer toggles."""
        specs = build_setting_specs()
        spec_keys = {s.key for s in specs}
        missing = [k for k in self.REVIEWER_KEYS if k not in spec_keys]
        assert missing == [], f"Missing from build_setting_specs: {missing}"


# ---------------------------------------------------------------------------
# AC3: Settings persist across sessions (config round-trip)
# ---------------------------------------------------------------------------


class TestAC3SettingsPersistence:
    """Settings must round-trip through config.local.yaml correctly."""

    def test_set_by_path_creates_nested_structure(self):
        """_set_by_path must create intermediate dicts for deep paths."""
        data: dict[str, Any] = {}
        _set_by_path(data, "workflow.reviewer_subagents.security", False)
        assert data["workflow"]["reviewer_subagents"]["security"] is False

    def test_set_by_path_preserves_siblings(self):
        """Setting one toggle must not clobber others."""
        data: dict[str, Any] = {
            "workflow": {
                "reviewer_subagents": {
                    "preflight": True,
                    "security": True,
                }
            }
        }
        _set_by_path(data, "workflow.reviewer_subagents.security", False)
        assert data["workflow"]["reviewer_subagents"]["preflight"] is True
        assert data["workflow"]["reviewer_subagents"]["security"] is False

    def test_get_by_path_reads_nested(self):
        """_get_by_path must traverse nested dicts correctly."""
        data = {"workflow": {"reviewer_subagents": {"security": False}}}
        assert _get_by_path(data, "workflow.reviewer_subagents.security") is False

    def test_get_by_path_raises_on_missing(self):
        """Missing keys must raise KeyError."""
        data: dict[str, Any] = {"workflow": {}}
        with pytest.raises(KeyError):
            _get_by_path(data, "workflow.reviewer_subagents.security")

    def test_deep_merge_override_single_toggle(self):
        """User override of one toggle must not lose other defaults."""
        user_config = {"workflow": {"reviewer_subagents": {"security": False}}}
        merged = _deep_merge(DEFAULTS, user_config)
        toggles = merged["workflow"]["reviewer_subagents"]
        assert toggles["security"] is False
        assert toggles["preflight"] is True
        assert toggles["edge_hunter"] is True

    def test_deep_merge_preserves_non_toggle_workflow_settings(self):
        """Merging reviewer toggles must not lose other workflow settings."""
        user_config = {"workflow": {"reviewer_subagents": {"security": False}}}
        merged = _deep_merge(DEFAULTS, user_config)
        # Other workflow defaults must survive
        assert "relay_mode" in merged["workflow"]
        assert "pr_mode" in merged["workflow"]

    def test_coerce_true_false_strings(self):
        """CLI input 'true'/'false' must coerce to Python booleans."""
        assert _coerce_value("true") is True
        assert _coerce_value("false") is False
        assert _coerce_value("True") is True
        assert _coerce_value("FALSE") is False

    def test_yaml_roundtrip(self, tmp_path: Path):
        """Settings written to YAML must read back identically."""
        config = {
            "workflow": {
                "reviewer_subagents": {
                    "preflight": True,
                    "security": False,
                    "simplifier": False,
                }
            }
        }
        config_path = tmp_path / "config.local.yaml"
        with open(config_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

        with open(config_path) as f:
            loaded = yaml.safe_load(f)

        toggles = loaded["workflow"]["reviewer_subagents"]
        assert toggles["preflight"] is True
        assert toggles["security"] is False
        assert toggles["simplifier"] is False

    def test_full_config_roundtrip(self, pf_config_root):
        """set_setting → config file → get_setting must return the same value."""
        pf_config_root.write_config("")

        with (
            patch(
                "pf.settings.settings.get_project_root",
                return_value=pf_config_root.project_dir,
            ),
            patch("pf.settings.settings.load_pennyfarthing_config", return_value={}),
        ):
            from pf.settings.settings import set_setting

            set_setting("workflow.reviewer_subagents.security", "false")

        # Read back what was written
        saved = pf_config_root.read_config()
        assert saved["workflow"]["reviewer_subagents"]["security"] is False


# ---------------------------------------------------------------------------
# AC5: E2E gate enforcement with toggles
# ---------------------------------------------------------------------------


class TestAC5GateEnforcementWithToggles:
    """Gate checks must respect toggle state — only enforce enabled subagents."""

    FULL_SUBAGENT_TABLE = textwrap.dedent("""\
        ## Subagent Results

        | # | Specialist | Received | Status | Findings | Decision |
        |---|-----------|----------|--------|----------|----------|
        | 1 | reviewer-preflight | Yes | clean | none | N/A |
        | 2 | reviewer-edge-hunter | Yes | findings | 2 | confirm |
        | 3 | reviewer-silent-failure-hunter | Yes | clean | none | N/A |
        | 4 | reviewer-test-analyzer | Yes | findings | 1 | dismiss |
        | 5 | reviewer-comment-analyzer | Yes | clean | none | N/A |
        | 6 | reviewer-type-design | Yes | clean | none | N/A |
        | 7 | reviewer-security | Yes | clean | none | N/A |
        | 8 | reviewer-simplifier | Yes | clean | none | N/A |
        | 9 | reviewer-rule-checker | Yes | clean | none | N/A |

        **All received:** **Yes**
    """)

    FULL_ASSESSMENT = textwrap.dedent("""\
        ## Reviewer Assessment

        [EDGE] Found 2 boundary issues.
        [SILENT] No swallowed errors found.
        [TEST] Test coverage adequate.
        [DOC] Comments are current.
        [TYPE] Types are sound.
        [SEC] No security issues.
        [SIMPLE] No unnecessary complexity.
        [RULE] All rules satisfied.
    """)

    def test_completion_passes_all_enabled(self):
        """With all subagents enabled and present, completion check passes."""
        content = self.FULL_SUBAGENT_TABLE
        all_true = {k: True for k in _SUBAGENT_SETTING_MAP}
        with patch("pf.settings.settings.get_setting", return_value=all_true):
            result = _check_subagent_completion(content)
        assert result is None, f"Expected pass, got: {result}"

    def test_completion_passes_disabled_subagent_missing_from_table(self):
        """Disabled subagent can be absent from table without error."""
        # Remove security from the table
        content = self.FULL_SUBAGENT_TABLE.replace(
            "| 7 | reviewer-security | Yes | clean | none | N/A |\n", ""
        )
        toggles = {k: True for k in _SUBAGENT_SETTING_MAP}
        toggles["security"] = False
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            result = _check_subagent_completion(content)
        assert result is None, f"Expected pass for disabled subagent, got: {result}"

    def test_completion_fails_enabled_subagent_missing(self):
        """Enabled subagent missing from table must fail."""
        content = self.FULL_SUBAGENT_TABLE.replace(
            "| 7 | reviewer-security | Yes | clean | none | N/A |\n", ""
        )
        all_true = {k: True for k in _SUBAGENT_SETTING_MAP}
        with patch("pf.settings.settings.get_setting", return_value=all_true):
            result = _check_subagent_completion(content)
        assert result is not None
        assert "reviewer-security" in result

    def test_dispatch_passes_all_tags_present(self):
        """With all subagents enabled and all tags present, dispatch passes."""
        content = self.FULL_ASSESSMENT
        all_true = {k: True for k in _SUBAGENT_SETTING_MAP}
        with patch("pf.settings.settings.get_setting", return_value=all_true):
            missing = _check_subagent_dispatch(content)
        assert missing == set(), f"Expected no missing tags, got: {missing}"

    def test_dispatch_skips_disabled_tag(self):
        """Disabled subagent's tag should not be required in assessment."""
        # Remove [SEC] from assessment
        content = self.FULL_ASSESSMENT.replace("[SEC] No security issues.\n", "")
        toggles = {k: True for k in _SUBAGENT_SETTING_MAP}
        toggles["security"] = False
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            missing = _check_subagent_dispatch(content)
        assert missing == set(), f"Disabled tag should not be required, got: {missing}"

    def test_dispatch_fails_enabled_tag_missing(self):
        """Missing tag for enabled subagent must fail."""
        content = self.FULL_ASSESSMENT.replace("[SEC] No security issues.\n", "")
        all_true = {k: True for k in _SUBAGENT_SETTING_MAP}
        with patch("pf.settings.settings.get_setting", return_value=all_true):
            missing = _check_subagent_dispatch(content)
        assert "[SEC]" in missing

    def test_dispatch_multiple_disabled(self):
        """Multiple disabled subagents should all be skipped."""
        content = self.FULL_ASSESSMENT
        # Remove tags for security, simplifier, type_design
        content = content.replace("[SEC] No security issues.\n", "")
        content = content.replace("[SIMPLE] No unnecessary complexity.\n", "")
        content = content.replace("[TYPE] Types are sound.\n", "")
        toggles = {k: True for k in _SUBAGENT_SETTING_MAP}
        toggles["security"] = False
        toggles["simplifier"] = False
        toggles["type_design"] = False
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            missing = _check_subagent_dispatch(content)
        assert missing == set()

    def test_no_assessment_returns_all_enabled_tags(self):
        """Missing assessment section should return all enabled tags."""
        content = "## Some Other Section\nNo assessment here."
        all_true = {k: True for k in _SUBAGENT_SETTING_MAP}
        with patch("pf.settings.settings.get_setting", return_value=all_true):
            missing = _check_subagent_dispatch(content)
        assert missing == SUBAGENT_DISPATCH_TAGS

    def test_completion_missing_section_reports_enabled_count(self):
        """Missing Subagent Results should report count of enabled subagents."""
        content = "## Reviewer Assessment\nSome content."
        toggles = {k: True for k in _SUBAGENT_SETTING_MAP}
        toggles["security"] = False
        toggles["simplifier"] = False
        with patch("pf.settings.settings.get_setting", return_value=toggles):
            result = _check_subagent_completion(content)
        assert result is not None
        assert "7 enabled" in result  # 9 total - 2 disabled = 7


# ---------------------------------------------------------------------------
# E2E: Settings key consistency across layers
# ---------------------------------------------------------------------------


class TestSettingsKeyConsistency:
    """All layers must agree on the same set of setting keys."""

    def test_defaults_keys_match_settings_meta_keys(self):
        """Every DEFAULTS toggle must have a corresponding SETTINGS_META entry."""
        default_keys = set(DEFAULTS["workflow"]["reviewer_subagents"].keys())
        meta_prefix = "workflow.reviewer_subagents."
        meta_keys = {
            k.removeprefix(meta_prefix)
            for k in SETTINGS_META
            if k.startswith(meta_prefix)
        }
        assert default_keys == meta_keys, (
            f"DEFAULTS has {default_keys - meta_keys} not in META, "
            f"META has {meta_keys - default_keys} not in DEFAULTS"
        )

    def test_defaults_keys_match_setting_map_keys(self):
        """DEFAULTS toggle keys must match _SUBAGENT_SETTING_MAP keys."""
        default_keys = set(DEFAULTS["workflow"]["reviewer_subagents"].keys())
        map_keys = set(_SUBAGENT_SETTING_MAP.keys())
        assert default_keys == map_keys

    def test_dispatch_tags_match_setting_map(self):
        """SUBAGENT_DISPATCH_TAGS must exactly match tags in _SUBAGENT_SETTING_MAP."""
        map_tags = {tag for _name, tag in _SUBAGENT_SETTING_MAP.values() if tag is not None}
        assert map_tags == SUBAGENT_DISPATCH_TAGS

    def test_required_subagents_match_setting_map(self):
        """REQUIRED_SUBAGENTS must exactly match names in _SUBAGENT_SETTING_MAP."""
        map_names = {name for name, _tag in _SUBAGENT_SETTING_MAP.values()}
        assert map_names == REQUIRED_SUBAGENTS

    def test_preflight_has_no_dispatch_tag(self):
        """reviewer-preflight should not have a dispatch tag (it's always first)."""
        _name, tag = _SUBAGENT_SETTING_MAP["preflight"]
        assert tag is None, f"preflight should have no tag, got {tag}"

    def test_all_non_preflight_have_tags(self):
        """Every subagent except preflight must have a dispatch tag."""
        for key, (name, tag) in _SUBAGENT_SETTING_MAP.items():
            if key == "preflight":
                continue
            assert tag is not None, f"{key} ({name}) has no dispatch tag"
