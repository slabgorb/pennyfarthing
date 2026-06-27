"""RED tests for story 160-22 — sanitise Frame response-body info-leaks (p1).

Security follow-up to the 160-4..18 Frame fail-loud sweep. The 160-18
reviewer-security pass flagged three response-BODY info-leaks in
``pf/frame/routes/data_proxy.py`` — places that send a raw absolute filesystem
path (OS username + on-disk layout) or a raw exception string straight into a
JSON body that a network client can read:

  1. ``get_project_info`` (~L472): ``{"name": ..., "path": project_dir}`` —
     ``path`` is the RAW ABSOLUTE project dir (``/Users/<username>/...``).
  2. ``get_git_all`` (~L273): ``{"path": repo["path"], ...}`` — the configured
     repo path verbatim; an absolute path or a ``../parent`` traversal in
     ``repos.yaml`` leaks filesystem layout.
  3. ``get_context`` (~L333): ``{"error": str(e), ...}`` — the raw exception
     string in the body. 160-19 fixed get_context's CONSTANT ``ContextConfig``
     bug + added the fail-loud warning, but EXPLICITLY DEFERRED this body
     sanitisation to 160-22 (see ``test_160_19`` docstring, "Scope guard
     (160-22)"). The leak is still LIVE at L333: ``"error": str(e)``.

SCOPE DEVIATION (logged): the sm-setup story summary / SM assessment read the
title's "get_context str(e) (L322) overlaps 160-19" as "already handled by
160-19 — out of scope". That is factually wrong: 160-19's shipped artifact says
the opposite in three places (body sanitisation is 160-22's job) and the leak is
live. So this RED INCLUDES get_context body sanitisation. See the session's
``## Design Deviations`` → TEA.

DESIGNED INTERFACE (for Dev / GREEN) — keep each response SHAPE
backward-compatible (Node.js parity, AC5 of story 48-2; the existing
``test_frame_routes.py::test_project_info_shape`` asserts ``"path" in data``) and
sanitise only the VALUE:

  - get_project_info: ``"path": Path(project_dir).name``     (basename, == name)
  - get_git_all:      ``"path": Path(repo["path"]).name or repo["path"]``
                      (basename; ``or repo["path"]`` keeps a bare ``"."`` for the
                      default repo, whose ``Path(".").name`` is "")
  - get_context:      ``"error": _safe_exc(e)``  — reuse the 160-18 sink
                      sanitiser (type name only); NEVER raw ``str(e)``.

Choosing basename over omit keeps every existing route test green (``path`` stays
present) — Dev should not need to edit ``test_frame_routes.py``.

Conventions mirror ``test_160_19``: async routes are awaited directly via
``asyncio.run`` and the body read with ``json.loads(response.body)``; the
``check_context`` seam is patched where USED (``data_proxy.check_context``,
lang-review #6). No ``filterwarnings=error`` is configured, so the fail-loud
warning that fires on the get_context exception path is harmless here (160-19
owns the warn assertions).

Rule coverage (lang-review/python.md): #11 security — input/output at API
boundaries must not disclose sensitive filesystem paths or exception internals.
"""

from __future__ import annotations

import asyncio
import json
import re

import pytest  # noqa: F401  (kept for parity / future pytest.warns use)

from pf.frame.routes import data_proxy
from pf.frame.routes.data_proxy import get_context, get_git_all, get_project_info

# A username-like sentinel segment that must NEVER survive into a response body.
_SENTINEL_USER = "s3cr3t_username_LEAK"


def _run(coro_fn):
    """Await an async route to completion and return its ``JSONResponse``."""
    return asyncio.run(coro_fn())


def _raiser(exc: Exception):
    def _raise(*_a, **_k):
        raise exc

    return _raise


def _abs_path_leaks(obj) -> list[str]:
    """Every string value in a JSON-ish structure that looks like an absolute
    filesystem path (posix ``/...`` or Windows ``C:\\...``). Relative paths such
    as ``"."`` or ``"alpha"`` (legitimately present in these bodies) are ignored.
    """
    found: list[str] = []

    def walk(v) -> None:
        if isinstance(v, str):
            if v.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", v):
                found.append(v)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(obj)
    return found


def _write_repos_yaml(project_dir, repos: dict) -> None:
    """Write a ``.pennyfarthing/repos.yaml`` with the given ``{name: {path}}`` map
    (the dict shape ``_get_repos_config`` requires)."""
    import yaml

    pf_dir = project_dir / ".pennyfarthing"
    pf_dir.mkdir(parents=True, exist_ok=True)
    (pf_dir / "repos.yaml").write_text(yaml.safe_dump({"repos": repos}), encoding="utf-8")


# ===========================================================================
# get_project_info — raw absolute project_dir in the body (~L472)
# ===========================================================================


def test_project_info_does_not_leak_absolute_path(tmp_path, monkeypatch):
    """``path`` must not expose the absolute project dir (OS username + layout).

    RED today: ``get_project_info`` returns ``"path": project_dir`` verbatim, so
    the body contains the absolute path and the username-like parent segment.
    GREEN once ``path`` is sanitised to the basename.
    """
    proj = tmp_path / _SENTINEL_USER / "my-project"
    proj.mkdir(parents=True)
    monkeypatch.setenv("PF_PROJECT_DIR", str(proj))

    response = _run(get_project_info)
    raw = response.body.decode()
    body = json.loads(response.body)

    assert response.status_code == 200
    assert _SENTINEL_USER not in raw, (
        f"username-like parent segment leaked in response body: {raw!r}"
    )
    assert str(proj) not in raw, f"absolute project_dir leaked in body: {raw!r}"
    assert _abs_path_leaks(body) == [], (
        f"response body still contains absolute filesystem path(s): {_abs_path_leaks(body)!r}"
    )


def test_project_info_preserves_shape_with_basename(tmp_path, monkeypatch):
    """Shape stays backward-compatible (``name`` + ``path`` both present — Node.js
    parity / 48-2 AC5) and both convey only the basename.

    The ``path == basename`` assertion is the RED driver; ``name`` is
    green-on-arrival (already a basename). Pins the chosen "basename, not omit"
    contract so Dev has an unambiguous target. Logged as a TEA Design Deviation.
    """
    proj = tmp_path / _SENTINEL_USER / "penny-proj"
    proj.mkdir(parents=True)
    monkeypatch.setenv("PF_PROJECT_DIR", str(proj))

    body = json.loads(_run(get_project_info).body)

    assert body.get("name") == "penny-proj", f"name basename not preserved: {body!r}"
    assert "path" in body, f"path field dropped — breaks Node.js shape parity: {body!r}"
    assert body["path"] == "penny-proj", (
        f"path must be sanitised to the basename, got {body.get('path')!r}"
    )


# ===========================================================================
# get_git_all — raw repo path in the body (~L273)
# ===========================================================================


def test_git_all_does_not_leak_absolute_repo_path(tmp_path, monkeypatch):
    """An absolute repo path configured in ``repos.yaml`` must not reach the body.

    RED today: ``get_git_all`` echoes ``repo["path"]`` verbatim, so an absolute
    configured path lands in the response. GREEN once basename-sanitised.
    """
    proj = tmp_path / "proj"
    abs_repo = tmp_path / _SENTINEL_USER / "vendored-repo"
    abs_repo.mkdir(parents=True)
    _write_repos_yaml(proj, {"vendored": {"path": str(abs_repo)}})
    monkeypatch.setenv("PF_PROJECT_DIR", str(proj))

    response = _run(get_git_all)
    raw = response.body.decode()
    body = json.loads(response.body)

    assert response.status_code == 200
    assert isinstance(body, list) and body, f"expected a non-empty repo list: {body!r}"
    assert _SENTINEL_USER not in raw, f"absolute repo path leaked in body: {raw!r}"
    assert str(abs_repo) not in raw, f"absolute repo path leaked in body: {raw!r}"
    assert _abs_path_leaks(body) == [], (
        f"response body still contains absolute filesystem path(s): {_abs_path_leaks(body)!r}"
    )


def test_git_all_strips_parent_traversal_to_basename(tmp_path, monkeypatch):
    """A ``../parent/child`` configured path must be reduced to its basename — no
    ``..`` and no parent segment in the body (filesystem-layout disclosure).

    RED today (path echoed verbatim → contains ``..`` and the parent segment).
    GREEN once basename-sanitised to ``child``.
    """
    proj = tmp_path / "proj"
    _write_repos_yaml(proj, {"sibling": {"path": f"../{_SENTINEL_USER}/child"}})
    monkeypatch.setenv("PF_PROJECT_DIR", str(proj))

    body = json.loads(_run(get_git_all).body)
    entry = next(r for r in body if r["name"] == "sibling")

    assert ".." not in entry["path"], f"parent traversal leaked: {entry!r}"
    assert _SENTINEL_USER not in entry["path"], f"parent segment leaked: {entry!r}"
    assert entry["path"] == "child", f"path not sanitised to basename: {entry!r}"


def test_git_all_preserves_repo_fields(tmp_path, monkeypatch):
    """Sanitising ``path`` must not drop the other repo fields (shape parity with
    the Node.js server: name, branch, clean, dirtyFiles).

    Green-on-arrival regression guard (a relative ``"alpha"`` path is already its
    own basename) — TEA Design Deviation. Pins that the fix touches only ``path``.
    """
    proj = tmp_path / "proj"
    _write_repos_yaml(proj, {"alpha": {"path": "alpha"}})
    monkeypatch.setenv("PF_PROJECT_DIR", str(proj))

    body = json.loads(_run(get_git_all).body)
    entry = next(r for r in body if r["name"] == "alpha")

    for field in ("name", "branch", "clean", "dirtyFiles"):
        assert field in entry, f"{field} missing from git/all entry: {entry!r}"
    assert entry["path"] == "alpha", f"a relative basename path must round-trip: {entry!r}"


# ===========================================================================
# get_context — raw str(e) in the body (~L333), deferred to 160-22 by 160-19
# ===========================================================================


def test_get_context_error_body_does_not_leak_raw_exception(monkeypatch):
    """On a genuine ``check_context`` failure the body's ``error`` must carry the
    exception TYPE name only — never the raw ``str(e)`` message (which can embed
    absolute paths, tokens, or file fragments).

    RED today: ``data_proxy.py`` returns ``"error": str(e)``, so the sentinel
    message (an absolute path) appears verbatim in the body. GREEN once routed
    through the 160-18 sink sanitiser (``_safe_exc(e)`` / ``type(e).__name__``).
    """
    sentinel_msg = f"/Users/{_SENTINEL_USER}/secret/path/leaked-in-message"
    monkeypatch.setattr(data_proxy, "check_context", _raiser(RuntimeError(sentinel_msg)))

    response = _run(get_context)
    body = json.loads(response.body)

    assert response.status_code == 200
    assert isinstance(body.get("error"), str) and body["error"], (
        f"error diagnostic missing from degraded body: {body!r}"
    )
    assert sentinel_msg not in body["error"], (
        f"raw exception message (with absolute path) leaked into the body: {body['error']!r}"
    )
    assert _SENTINEL_USER not in json.dumps(body), (
        f"sentinel leaked somewhere in the response body: {body!r}"
    )
    assert "RuntimeError" in body["error"], (
        f"sanitised error must still surface the exception type name: {body['error']!r}"
    )
