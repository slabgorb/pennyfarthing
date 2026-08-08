"""PATCH /api/settings persists whitelisted keys to config.local.yaml."""
from pathlib import Path

import yaml
from fastapi.testclient import TestClient


def _client(monkeypatch, project_dir: Path) -> TestClient:
    monkeypatch.setenv("PF_PROJECT_DIR", str(project_dir))
    monkeypatch.delenv("FRAME_WEBUI_DIR", raising=False)
    from pf.frame.app import create_app

    return TestClient(create_app())


def test_patch_persists_theme_to_config(tmp_path, monkeypatch):
    (tmp_path / ".pennyfarthing").mkdir()
    client = _client(monkeypatch, tmp_path)
    resp = client.patch("/api/settings/", json={"theme": "discworld"})
    assert resp.status_code == 200
    config = yaml.safe_load(
        (tmp_path / ".pennyfarthing" / "config.local.yaml").read_text()
    )
    assert config["theme"] == "discworld"


def test_patch_preserves_existing_config_keys(tmp_path, monkeypatch):
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "config.local.yaml").write_text("statusbar: full\ntheme: scifi\n")
    client = _client(monkeypatch, tmp_path)
    client.patch("/api/settings/", json={"bell_mode": True})
    config = yaml.safe_load((pf_dir / "config.local.yaml").read_text())
    assert config == {"statusbar": "full", "theme": "scifi", "bell_mode": True}


def test_patch_nonpersisted_key_touches_no_file(tmp_path, monkeypatch):
    (tmp_path / ".pennyfarthing").mkdir()
    client = _client(monkeypatch, tmp_path)
    resp = client.patch("/api/settings/", json={"ephemeral_thing": 1})
    assert resp.status_code == 200
    assert not (tmp_path / ".pennyfarthing" / "config.local.yaml").exists()


def test_patch_write_failure_returns_error(tmp_path, monkeypatch):
    # No .pennyfarthing dir at all -> write fails -> result-shaped error.
    client = _client(monkeypatch, tmp_path)
    resp = client.patch("/api/settings/", json={"theme": "discworld"})
    assert resp.status_code == 500
    assert "error" in resp.json()


def test_restart_reads_bell_mode_from_config(tmp_path, monkeypatch):
    """Restart-shaped: bell_mode persisted to config.local.yaml must come back on fresh load."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "config.local.yaml").write_text("bell_mode: true\n")

    # Simulate restart: reset the module-level _settings to empty so there is no
    # warm in-memory state — only what _load_settings reads from disk.
    import pf.frame.routes.state as state_mod

    monkeypatch.setattr(state_mod, "_settings", {})

    client = _client(monkeypatch, tmp_path)
    resp = client.get("/api/settings/")
    assert resp.status_code == 200
    assert resp.json().get("bell_mode") is True


def test_failed_patch_does_not_change_get(tmp_path, monkeypatch):
    """A failed PATCH (500) must not mutate what GET returns for persisted keys."""
    # No .pennyfarthing dir -> the write will fail with a 500.
    # Pre-seed _settings with a known value.
    import pf.frame.routes.state as state_mod

    monkeypatch.setattr(state_mod, "_settings", {"bell_mode": False})

    client = _client(monkeypatch, tmp_path)

    before = client.get("/api/settings/").json()
    assert before.get("bell_mode") is False

    patch_resp = client.patch("/api/settings/", json={"bell_mode": True})
    assert patch_resp.status_code == 500

    after = client.get("/api/settings/").json()
    assert after.get("bell_mode") is False, "failed PATCH must not change GET result"
