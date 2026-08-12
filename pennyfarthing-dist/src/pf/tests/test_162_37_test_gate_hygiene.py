"""Story 162-37 — test-gate hygiene: leakage-gate SKIP_DIRS + frame-route order isolation.

Two independent test-infra defects, from the 162-7 audit:

**Defect 1 — ``SKIP_DIRS`` lists ``.venv`` but not ``venv``.**
``test_152_1_no_company_leakage.SKIP_DIRS`` names the hidden virtualenv
directory only. A stray *unhidden* ``venv/`` — the default name produced by
``python -m venv venv``, and the name PyCharm/VS Code create by default — is
therefore walked. pip's ``*.dist-info/RECORD`` files are CSV rows of
``path,sha256=...,<byte-count>``, so any installed file whose size happens to
equal the forbidden company brand number matches the word-bounded gate and the
hygiene suite fails on third-party bytes that are not redistributables at all.
This tripped twice on 2026-08-05. The fix is one entry in ``SKIP_DIRS``; these
tests pin it so it cannot be dropped again.

**Defect 2 — frame-route process globals are never reset between tests.**
``pf.frame.routes.state`` and ``pf.frame.routes.inline`` keep their stores in
*module-level* mutable globals, and ``pf.frame.routes.data_proxy`` caches the
user identity in a module-level slot with a 300s TTL. ``create_app()`` builds a
fresh app per test but the routers close over those same globals, so every
mutating route test (POST ``/api/permissions/grant``, POST ``/api/welcome``,
POST ``/api/bell-queue``, POST ``/api/pending-tool-input``, GET
``/api/identity``, …) leaves its writes visible to every later test in the
process. Nothing resets them — not the ``client`` fixture, not conftest.

Today the surviving assertions in ``test_frame_routes.py`` are shape-only
(``assert "grants" in data``), so the leak is latent rather than red: it does
not currently *break* a test, it removes the ability of those tests to make a
value assertion at all, and it makes the module's results a function of what ran
before it. The cwd-dependent half of the historical "4 failed in full runs, 0 in
isolation" flake was diagnosed and fixed by 162-49 (the ``pf_project_dir``
conftest fixture, which removed the ``os.getcwd()`` fallback as a degree of
freedom); the *shared-mutable-globals* half was not, and is what these tests
name and pin.

Author: TEA, Story 162-37 (RED).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from pf.frame.app import create_app
from pf.frame.routes import data_proxy, inline, state

from .test_152_1_no_company_leakage import (
    FORBIDDEN_PORT_NUMBER,
    SKIP_DIRS,
    _iter_text_files,
)

# ---------------------------------------------------------------------------
# Defect 1: leakage-gate SKIP_DIRS must cover the unhidden `venv/` name
# ---------------------------------------------------------------------------

# The default names `python -m venv <name>` / virtualenv / IDE tooling produce.
VIRTUALENV_DIR_NAMES = ("venv", ".venv")


def _write_pip_record(venv_dir_name: str, root: Path) -> Path:
    """Materialise a realistic pip ``RECORD`` under ``root/<venv_dir_name>/``.

    The third column of a ``RECORD`` row is the installed file's byte count.
    Here that count is exactly the forbidden company brand number, which is the
    real-world shape that tripped the gate: a wheel shipped a file whose size
    matched, and the word-bounded scan reported it as a company-identifier leak.
    """
    record = (
        root
        / venv_dir_name
        / "lib"
        / "python3.13"
        / "site-packages"
        / "somepkg-1.0.dist-info"
        / "RECORD"
    )
    record.parent.mkdir(parents=True, exist_ok=True)
    record.write_text(
        "somepkg/__init__.py,sha256=0000000000000000000000000000000000000000000,"
        f"{FORBIDDEN_PORT_NUMBER}\n"
        f"somepkg-1.0.dist-info/METADATA,sha256=1111111111111111111111111111111,{FORBIDDEN_PORT_NUMBER}\n",
        encoding="utf-8",
    )
    return record


@pytest.mark.parametrize("venv_dir_name", VIRTUALENV_DIR_NAMES)
def test_virtualenv_dir_names_are_in_skip_dirs(venv_dir_name: str):
    """Both the hidden and unhidden virtualenv directory names must be skipped.

    ``.venv`` has always been listed; ``venv`` — the name ``python -m venv venv``
    produces — has not. Membership is asserted directly so the intent survives
    even if the walk implementation changes.
    """
    assert venv_dir_name in SKIP_DIRS, (
        f"SKIP_DIRS does not list {venv_dir_name!r}; a stray {venv_dir_name}/ "
        f"is walked and pip RECORD byte counts trip the leakage gate. "
        f"Current SKIP_DIRS={sorted(SKIP_DIRS)}"
    )


@pytest.mark.parametrize("venv_dir_name", VIRTUALENV_DIR_NAMES)
def test_leakage_walk_skips_virtualenv_trees(tmp_path: Path, venv_dir_name: str):
    """The walk must yield nothing from inside a virtualenv tree.

    Behavioural counterpart to the membership assertion above: build a tree whose
    ONLY content is a virtualenv containing a pip ``RECORD``, walk it, and assert
    the walk is empty. With ``venv`` missing from ``SKIP_DIRS`` this yields the
    RECORD file and the hygiene gate reports a leak in third-party bytes.
    """
    _write_pip_record(venv_dir_name, tmp_path)

    visited = [path for path, _content in _iter_text_files(tmp_path)]

    assert visited == [], (
        f"leakage walk descended into {venv_dir_name}/ and yielded "
        f"{[str(p.relative_to(tmp_path)) for p in visited]} — virtualenv contents "
        f"are not redistributables and must never be scanned"
    )


def test_leakage_walk_still_scans_real_files_beside_a_virtualenv(tmp_path: Path):
    """Anti-vacuity guard for the two tests above.

    A walk that skipped *everything* would satisfy them. Put a real
    redistributable next to the virtualenv and assert the walk still finds it, so
    the fix cannot be "widen SKIP_DIRS until the walk is empty".
    """
    _write_pip_record("venv", tmp_path)
    real = tmp_path / "pennyfarthing-dist" / "guides" / "example.md"
    real.parent.mkdir(parents=True)
    real.write_text("a redistributable guide\n", encoding="utf-8")

    visited = [path for path, _content in _iter_text_files(tmp_path)]

    assert visited == [real], (
        f"expected the walk to yield exactly the redistributable {real}, got {visited}"
    )


# ---------------------------------------------------------------------------
# Defect 2: frame-route process globals leak across tests
# ---------------------------------------------------------------------------
#
# Every entry below is a module-level mutable container (or cache slot) that a
# route handler writes to and nothing ever resets. Named explicitly — the point
# of this story is to identify the leaked state, not to assert "something leaks".

FRAME_ROUTE_GLOBALS: tuple[tuple[object, str, object], ...] = (
    (state, "_settings", {}),
    (state, "_grants", []),
    (state, "_audit_entries", []),
    (state, "_tool_events", []),
    (state, "_web_mode_todos", []),
    (state, "_tdd_metrics", {}),
    (state, "_agent_stats", {}),
    (state, "_story_stats", {}),
    (state, "_evaluation", {}),
    (state, "_eval_results", []),
    (state, "_enriched_spans", []),
    (state, "_benchmark_events", []),
    (state, "_benchmark_phase", {}),
    (state, "_subagent_events", []),
    (inline, "_welcome_message", {}),
    (inline, "_bell_queue", []),
    (inline, "_pending_approvals", {}),
    (data_proxy, "_identity_cache", None),
)


def _dirty_globals() -> dict[str, object]:
    """Return every frame-route global whose value is not its pristine default."""
    return {
        f"{module.__name__}.{name}": getattr(module, name)
        for module, name, pristine in FRAME_ROUTE_GLOBALS
        if getattr(module, name) != pristine
    }


@pytest.fixture()
def frame_client(pf_project_dir: Path) -> TestClient:
    """Same construction as ``test_frame_routes.client`` — deliberately so.

    Mirroring that fixture is what makes this file a valid probe of the defect:
    if ``test_frame_routes`` needs a reset that this fixture does not get, the
    reset belongs in conftest, not in one module's local fixture.
    """
    return TestClient(create_app())


class TestFrameRouteStateIsolation:
    """Order-independence of the frame-route module.

    The two tests below are an ordered pair on purpose: cross-test leakage cannot
    be observed from inside a single test. ``test_1_...`` performs exactly the
    mutations ``test_frame_routes.py`` already performs; ``test_2_...`` asserts
    the next test starts from pristine state. Definition order is the run order
    (no ordering plugin is installed), so the reproduction is deterministic.
    """

    def test_1_mutating_routes_write_to_process_globals(self, frame_client: TestClient):
        """Documents the writes — these are the real requests from test_frame_routes.py.

        This test PASSES today and after the fix; it is the polluter half of the
        pair, asserting only that the routes accept the requests.
        """
        assert (
            frame_client.post(
                "/api/permissions/grant",
                json={"tool": "Bash", "scope": "/tmp", "grant_type": "session"},
            ).status_code
            == 201
        )
        assert frame_client.post("/api/welcome", json={"message": "hello"}).status_code == 200
        assert (
            frame_client.post("/api/bell-queue", json={"items": [{"agent": "dev"}]}).status_code
            == 200
        )
        assert (
            frame_client.post(
                "/api/pending-tool-input", json={"tool": "Bash", "input": "ls"}
            ).status_code
            == 200
        )

        # Sanity: the writes really did land in module globals, not per-app state.
        assert _dirty_globals(), (
            "no frame-route global changed — the mutation probe is not exercising "
            "the shared state it claims to"
        )

    def test_2_frame_route_globals_are_reset_between_tests(self, frame_client: TestClient):
        """RED: every frame-route global must be pristine at test entry.

        Fails today with ``state._grants``, ``inline._welcome_message`` and
        ``inline._bell_queue`` still holding the previous test's writes. Because
        ``create_app()`` returns a new app but the routers close over the same
        module globals, building a fresh client does NOT restore isolation — the
        reset has to be an explicit teardown.
        """
        dirty = _dirty_globals()
        assert not dirty, (
            "frame-route module globals survived the previous test — "
            f"leaked state: { {k: repr(v)[:120] for k, v in dirty.items()} }"
        )

    def test_identity_cache_is_not_shared_across_tests(self, frame_client: TestClient):
        """RED, order-independent: ``GET /api/identity`` must not leak a cached identity.

        ``data_proxy._identity_cache`` is a module global with a 300s TTL, so the
        FIRST test in the process to hit ``/api/identity`` decides the answer every
        later test sees, regardless of that test's ``PF_PROJECT_DIR``. Asserting on
        the cache slot after the request, rather than on the response body, keeps
        this independent of whether ``jira``/``gh`` are installed on the machine.
        """
        frame_client.get("/api/identity")
        assert data_proxy._identity_cache is None, (
            "GET /api/identity populated the process-wide _identity_cache and left "
            f"it set ({data_proxy._identity_cache!r}); the next test in this process "
            "inherits it for 300s"
        )


def test_conftest_resets_frame_route_state_for_every_test():
    """RED, order-independent: the reset must be a shared autouse fixture.

    Sentinel for the *mechanism*, mirroring how 164-18 pinned the persona quote
    cache and 162-49 pinned the project dir. A per-module fixture would fix
    ``test_frame_routes.py`` and leave every other module that touches a frame
    route (``test_148_5_audit_log_otel``, ``test_frame_web_routes``,
    ``test_frame_websocket``, …) still sharing the same globals, which is exactly
    how this defect survived the 162-5 triage.
    """
    from . import conftest

    reset_fixtures = [
        name
        for name in dir(conftest)
        if "frame_route" in name and "reset" in name
    ]
    assert reset_fixtures, (
        "no conftest fixture resets frame-route module state; frame-route globals "
        "(pf.frame.routes.state, .inline, .data_proxy._identity_cache) are shared "
        "by every test in the process. Expected an autouse fixture named like "
        "'_reset_frame_route_state'."
    )
