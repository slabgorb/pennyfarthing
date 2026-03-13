"""Tests for settings migration — Story 141-21, AC2.

Verifies Python migrate_settings() applies the same four legacy-format
transforms as migrateSettings() in TypeScript (settings.ts lines 192-240).

Migration paths:
  1. permission_mode: 'turbo' -> permission_mode: 'accept' + relay_mode: true
  2. handoff_mode: 'auto' -> relay_mode: true
  3. handoff_mode: 'manual' -> relay_mode: false
  4. auto_handoff: true/false -> relay_mode: true/false

RED state: Tests will fail until migrate_settings() is implemented.
"""

from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# Import under test — will fail until function is implemented
# ---------------------------------------------------------------------------
from pf.settings_migration import migrate_settings

# ---------------------------------------------------------------------------
# Migration Path 1: permission_mode 'turbo'
# ---------------------------------------------------------------------------

class TestTurboMigration:
    """permission_mode: 'turbo' -> permission_mode: 'accept' + relay_mode: true"""

    def test_turbo_converts_to_accept(self):
        raw = {"workflow": {"permission_mode": "turbo"}}
        result = migrate_settings(raw)
        assert result["workflow"]["permission_mode"] == "accept"

    def test_turbo_enables_relay_mode(self):
        raw = {"workflow": {"permission_mode": "turbo"}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is True

    def test_turbo_removes_turbo_value(self):
        raw = {"workflow": {"permission_mode": "turbo"}}
        result = migrate_settings(raw)
        assert result["workflow"]["permission_mode"] != "turbo"


# ---------------------------------------------------------------------------
# Migration Path 2: handoff_mode 'auto'
# ---------------------------------------------------------------------------

class TestHandoffAutoMigration:
    """handoff_mode: 'auto' -> relay_mode: true"""

    def test_auto_sets_relay_true(self):
        raw = {"workflow": {"handoff_mode": "auto"}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is True

    def test_auto_removes_handoff_mode(self):
        raw = {"workflow": {"handoff_mode": "auto"}}
        result = migrate_settings(raw)
        assert "handoff_mode" not in result["workflow"]


# ---------------------------------------------------------------------------
# Migration Path 3: handoff_mode 'manual'
# ---------------------------------------------------------------------------

class TestHandoffManualMigration:
    """handoff_mode: 'manual' -> relay_mode: false"""

    def test_manual_sets_relay_false(self):
        raw = {"workflow": {"handoff_mode": "manual"}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is False

    def test_manual_removes_handoff_mode(self):
        raw = {"workflow": {"handoff_mode": "manual"}}
        result = migrate_settings(raw)
        assert "handoff_mode" not in result["workflow"]


# ---------------------------------------------------------------------------
# Migration Path 4: auto_handoff boolean
# ---------------------------------------------------------------------------

class TestAutoHandoffMigration:
    """auto_handoff: true/false -> relay_mode: true/false"""

    def test_auto_handoff_true_sets_relay_true(self):
        raw = {"workflow": {"auto_handoff": True}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is True

    def test_auto_handoff_false_sets_relay_false(self):
        raw = {"workflow": {"auto_handoff": False}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is False

    def test_auto_handoff_removes_legacy_key(self):
        raw = {"workflow": {"auto_handoff": True}}
        result = migrate_settings(raw)
        assert "auto_handoff" not in result["workflow"]


# ---------------------------------------------------------------------------
# Valid modes pass through unchanged
# ---------------------------------------------------------------------------

class TestValidModesPassthrough:
    """Valid permission_mode values should not be altered."""

    @pytest.mark.parametrize("mode", ["plan", "manual", "accept"])
    def test_valid_permission_mode_preserved(self, mode: str):
        raw = {"workflow": {"permission_mode": mode}}
        result = migrate_settings(raw)
        assert result["workflow"]["permission_mode"] == mode

    def test_explicit_relay_mode_preserved(self):
        raw = {"workflow": {"relay_mode": True, "permission_mode": "manual"}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is True
        assert result["workflow"]["permission_mode"] == "manual"


# ---------------------------------------------------------------------------
# Precedence: explicit relay_mode wins over legacy keys
# ---------------------------------------------------------------------------

class TestPrecedence:
    """Explicit relay_mode takes priority over handoff_mode and auto_handoff."""

    def test_explicit_relay_beats_handoff_auto(self):
        raw = {"workflow": {"relay_mode": False, "handoff_mode": "auto"}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is False

    def test_explicit_relay_beats_auto_handoff(self):
        raw = {"workflow": {"relay_mode": True, "auto_handoff": False}}
        result = migrate_settings(raw)
        assert result["workflow"]["relay_mode"] is True

    def test_turbo_relay_not_overridden_by_explicit_false(self):
        """TypeScript: turbo sets relay=true, then explicit relay is checked first.
        If explicit relay_mode is present, it should win."""
        raw = {"workflow": {"permission_mode": "turbo", "relay_mode": False}}
        result = migrate_settings(raw)
        # Explicit relay_mode: false should be respected
        # But permission_mode should still migrate from turbo -> accept
        assert result["workflow"]["permission_mode"] == "accept"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_empty_dict(self):
        result = migrate_settings({})
        assert isinstance(result, dict)

    def test_no_workflow_section(self):
        raw = {"theme": "firefly"}
        result = migrate_settings(raw)
        assert result.get("theme") == "firefly"

    def test_empty_workflow_section(self):
        raw = {"workflow": {}}
        result = migrate_settings(raw)
        assert isinstance(result, dict)

    def test_preserves_non_workflow_keys(self):
        raw = {"theme": "firefly", "workflow": {"permission_mode": "turbo"}}
        result = migrate_settings(raw)
        assert result["theme"] == "firefly"

    def test_preserves_git_monitor(self):
        raw = {"workflow": {"git_monitor": True, "permission_mode": "accept"}}
        result = migrate_settings(raw)
        assert result["workflow"]["git_monitor"] is True

    def test_does_not_mutate_input(self):
        raw = {"workflow": {"permission_mode": "turbo"}}
        original_raw = {"workflow": {"permission_mode": "turbo"}}
        migrate_settings(raw)
        assert raw == original_raw

    def test_returns_new_dict(self):
        raw = {"workflow": {"permission_mode": "accept"}}
        result = migrate_settings(raw)
        assert result is not raw
