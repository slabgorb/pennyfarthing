"""RED tests for Story 160-20: Frame brownfield routes must await async helpers.

Bug (from the 160-17 Dev finding): the three brownfield analysis routes
``get_dead_code`` / ``get_complexity`` / ``get_dependencies`` in
``pf/frame/routes/analysis.py`` wrap their *async* helpers in
``asyncio.to_thread``::

    result = await asyncio.to_thread(find_stale_files, project_dir)

``find_stale_files`` / ``analyze_complexity`` / ``analyze_dependencies`` are all
``async def``. Calling an async function via ``to_thread`` runs ``fn(...)`` in a
worker thread, which merely *creates* a coroutine (the body never executes) and
returns it un-awaited. Consequences:

* the analysis never runs (``RuntimeWarning: coroutine never awaited``)
* ``result`` is a coroutine object → ``len(result)`` / JSON serialization raise
  → the route's ``except Exception`` returns HTTP 500

The fix is to await the async helpers directly. Two SECONDARY bugs surface once
the await is fixed and the routes are required to "return real results" (AC2):

* ``get_dead_code`` does ``len(result)`` but ``find_stale_files`` returns a
  ``DeadCodeResult`` dataclass, which has no ``__len__`` → ``TypeError``.
* ``get_complexity`` / ``get_dependencies`` pass a ``str`` (``project_dir``) to
  helpers whose first line is ``target_path.resolve()`` (``Path``-only) →
  ``AttributeError``.

These tests are intentionally STRICTER than the existing checks in
``test_frame_routes.py`` (which accept ``status_code in (200, 500)`` and so
masked this bug entirely).

Epic 160 — Frame fail-loud / correctness sweep. Workflow: tdd.
"""

from __future__ import annotations

import json

import pytest
from starlette.testclient import TestClient

from pf.complexity.models import ComplexityResult
from pf.deadcode.models import DeadCodeResult, StaleFile
from pf.dependencies.models import DependenciesResult
from pf.frame.app import create_app
from pf.frame.routes import analysis


@pytest.fixture()
def client() -> TestClient:
    """A TestClient for the Frame app with all routes mounted."""
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# Layer 1 — the route must AWAIT the async helper.
#
# Each helper is monkeypatched with an async fake whose *body* flips an
# ``executed`` flag and returns a real *Result dataclass carrying a sentinel.
# On the broken ``to_thread`` path the fake is called inside a worker thread,
# which produces a coroutine that is never awaited — so the body never runs and
# the flag stays False. The only way the flag becomes True and the sentinel
# reaches the response is for the route to ``await`` the helper directly.
# (Fix-agnostic w.r.t. the str→Path question, which Layer 2 covers.)
# ---------------------------------------------------------------------------


class TestRoutesAwaitTheirHelpers:
    """RED: routes return a coroutine instead of awaiting the analysis."""

    def test_get_dead_code_awaits_and_returns_real_result(self, client, monkeypatch):
        executed = {"ran": False}

        async def fake_find_stale_files(*args, **kwargs):
            executed["ran"] = True
            return DeadCodeResult(
                success=True,
                repo_name="sentinel-repo",
                repo_path="/sentinel",
                time_window_days=180,
                stale_files=[StaleFile(path="sentinel_stale.py")],
                total_files=1,
            )

        monkeypatch.setattr(analysis, "find_stale_files", fake_find_stale_files)

        resp = client.get("/api/dead-code")

        assert executed["ran"] is True, (
            "helper coroutine was never awaited — the analysis never executed"
        )
        assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "files" in data and "total" in data, f"missing real-result shape: {data}"
        assert "sentinel_stale.py" in json.dumps(data), (
            f"real analysis result was not returned (got a coroutine/error): {data}"
        )
        assert data["total"] == 1

    def test_get_complexity_awaits_and_returns_real_result(self, client, monkeypatch):
        executed = {"ran": False}

        async def fake_analyze_complexity(*args, **kwargs):
            executed["ran"] = True
            return ComplexityResult(success=True, target_path="/sentinel-cx", file_count=3)

        monkeypatch.setattr(analysis, "analyze_complexity", fake_analyze_complexity)

        resp = client.get("/api/complexity")

        assert executed["ran"] is True, (
            "helper coroutine was never awaited — the analysis never executed"
        )
        assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "sentinel-cx" in json.dumps(data), (
            f"real analysis result was not returned (got a coroutine/error): {data}"
        )
        assert data.get("file_count") == 3

    def test_get_dependencies_awaits_and_returns_real_result(self, client, monkeypatch):
        executed = {"ran": False}

        async def fake_analyze_dependencies(*args, **kwargs):
            executed["ran"] = True
            return DependenciesResult(success=True, target_path="/sentinel-dep")

        monkeypatch.setattr(analysis, "analyze_dependencies", fake_analyze_dependencies)

        resp = client.get("/api/dependencies")

        assert executed["ran"] is True, (
            "helper coroutine was never awaited — the analysis never executed"
        )
        assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "sentinel-dep" in json.dumps(data), (
            f"real analysis result was not returned (got a coroutine/error): {data}"
        )


# ---------------------------------------------------------------------------
# Layer 2 — end-to-end against the REAL helpers and a real project dir.
#
# Catches the secondary bugs that monkeypatching bypasses: the str→Path
# mismatch in complexity/dependencies and the ``len(DeadCodeResult)`` bug in
# dead-code. Every helper degrades gracefully (``success=False``) when
# git/eslint/npm are unavailable, so a correctly-fixed route ALWAYS returns
# HTTP 200 with a real *Result dict — never a 500 crash.
# ---------------------------------------------------------------------------


class TestRealHelpersReturn200:
    """RED: real helpers crash the route (coroutine, str.resolve, or len())."""

    def test_dead_code_real_helper_returns_200(self, client, monkeypatch, tmp_path):
        monkeypatch.setenv("PF_PROJECT_DIR", str(tmp_path))

        resp = client.get("/api/dead-code")

        assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "files" in data, f"missing real-result shape (len(DeadCodeResult) bug?): {data}"
        assert "total" in data and isinstance(data["total"], int), f"bad total: {data}"

    def test_complexity_real_helper_returns_200(self, client, monkeypatch, tmp_path):
        monkeypatch.setenv("PF_PROJECT_DIR", str(tmp_path))

        resp = client.get("/api/complexity")

        assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "success" in data, f"not a real ComplexityResult (str→Path bug?): {data}"

    def test_dependencies_real_helper_returns_200(self, client, monkeypatch, tmp_path):
        monkeypatch.setenv("PF_PROJECT_DIR", str(tmp_path))

        resp = client.get("/api/dependencies")

        assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "success" in data, f"not a real DependenciesResult (str→Path bug?): {data}"
