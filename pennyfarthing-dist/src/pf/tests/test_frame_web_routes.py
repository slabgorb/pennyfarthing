"""Web-GUI support routes: persona portrait file, workflow phases."""
from pathlib import Path

from fastapi.testclient import TestClient


def _client(monkeypatch, project_dir: Path) -> TestClient:
    monkeypatch.setenv("PF_PROJECT_DIR", str(project_dir))
    monkeypatch.delenv("FRAME_WEBUI_DIR", raising=False)
    from pf.frame.app import create_app

    return TestClient(create_app())


def test_portrait_returns_file_when_persona_has_one(tmp_path, monkeypatch):
    png = tmp_path / "carrot.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\nfake")
    monkeypatch.setattr(
        "pf.frame.ws_push.build_persona_payload",
        lambda project_dir, full=False: {"character": "Carrot", "portraitPath": str(png)},
    )
    resp = _client(monkeypatch, tmp_path).get("/api/persona/portrait")
    assert resp.status_code == 200
    assert resp.content.startswith(b"\x89PNG")


def test_portrait_404_when_no_persona_or_missing_file(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "pf.frame.ws_push.build_persona_payload",
        lambda project_dir, full=False: {},
    )
    resp = _client(monkeypatch, tmp_path).get("/api/persona/portrait")
    assert resp.status_code == 404
    assert resp.json() == {"error": "no portrait"}


def _write_session_and_workflow(project_dir: Path) -> None:
    session = project_dir / ".session"
    session.mkdir(parents=True)
    (session / "163-1-session.md").write_text(
        "# Story 163-1: Frame static serving\n"
        "**Story ID:** 163-1\n**Phase:** red\n**Workflow:** tdd\n",
        encoding="utf-8",
    )
    wf_dir = project_dir / ".pennyfarthing" / "workflows"
    wf_dir.mkdir(parents=True)
    (wf_dir / "tdd.yaml").write_text(
        "name: tdd\nphases:\n"
        "  - name: setup\n    agent: sm\n"
        "  - name: red\n    agent: tea\n"
        "  - name: green\n    agent: dev\n",
        encoding="utf-8",
    )


def test_workflow_route_returns_phases_from_yaml(tmp_path, monkeypatch):
    _write_session_and_workflow(tmp_path)
    resp = _client(monkeypatch, tmp_path).get("/api/workflow/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["workflow"] == "tdd"
    assert body["phase"] == "red"
    assert {"name": "red", "agent": "tea"} in body["phases"]


def test_workflow_route_degrades_without_session(tmp_path, monkeypatch):
    resp = _client(monkeypatch, tmp_path).get("/api/workflow/")
    assert resp.status_code == 200
    assert resp.json() == {"workflow": None, "phase": None, "phases": []}
