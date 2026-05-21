"""Tests for the superpowers companion plugin doctor check."""
from __future__ import annotations

from pathlib import Path

from pf.doctor.checks import check_superpowers_plugin


def test_check_superpowers_plugin_pass_when_plugin_installed(tmp_path, monkeypatch):
    """Check passes when superpowers plugin cache dir exists under HOME."""
    plugin_dir = (
        tmp_path
        / ".claude"
        / "plugins"
        / "cache"
        / "claude-plugins-official"
        / "superpowers"
    )
    plugin_dir.mkdir(parents=True)
    monkeypatch.setenv("HOME", str(tmp_path))

    result = check_superpowers_plugin(tmp_path)

    assert result.status == "pass"
    assert "superpowers" in result.detail.lower()


def test_check_superpowers_plugin_fail_when_missing(tmp_path, monkeypatch):
    """Check fails with remediation guidance when plugin dir absent."""
    monkeypatch.setenv("HOME", str(tmp_path))

    result = check_superpowers_plugin(tmp_path)

    assert result.status == "fail"
    assert "install" in result.detail.lower()
    assert "superpowers" in result.detail.lower()


def test_check_superpowers_plugin_has_stable_name(tmp_path, monkeypatch):
    """Check name is stable for CLI output and JSON consumers."""
    monkeypatch.setenv("HOME", str(tmp_path))
    result = check_superpowers_plugin(tmp_path)
    assert result.name == "superpowers_plugin"
