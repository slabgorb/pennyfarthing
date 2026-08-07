"""Static web UI serving — ADR web-gui-resurrection. Frame mounts webui/dist
when present; absent dir leaves the server exactly as before."""
from pathlib import Path

from fastapi.testclient import TestClient


def _make_webui(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text(
        "<html><body>pf-webui-sentinel</body></html>", encoding="utf-8"
    )
    return tmp_path


def test_serves_index_when_webui_dir_set(tmp_path, monkeypatch):
    monkeypatch.setenv("FRAME_WEBUI_DIR", str(_make_webui(tmp_path)))
    from pf.frame.app import create_app

    client = TestClient(create_app())
    resp = client.get("/")
    assert resp.status_code == 200
    assert "pf-webui-sentinel" in resp.text


def test_api_routes_take_precedence_over_static(tmp_path, monkeypatch):
    monkeypatch.setenv("FRAME_WEBUI_DIR", str(_make_webui(tmp_path)))
    from pf.frame.app import create_app

    client = TestClient(create_app())
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_missing_webui_dir_is_not_mounted(tmp_path, monkeypatch):
    # Env set but pointing nowhere: resolver returns None, no mount.
    monkeypatch.setenv("FRAME_WEBUI_DIR", str(tmp_path / "nonexistent"))
    from pf.frame.app import create_app

    client = TestClient(create_app())
    assert client.get("/").status_code == 404
    assert client.get("/health").status_code == 200


def test_resolver_env_override_and_default(tmp_path, monkeypatch):
    from pf.frame.app import _resolve_webui_dir

    monkeypatch.setenv("FRAME_WEBUI_DIR", str(_make_webui(tmp_path)))
    assert _resolve_webui_dir() == tmp_path
    monkeypatch.setenv("FRAME_WEBUI_DIR", str(tmp_path / "gone"))
    assert _resolve_webui_dir() is None
