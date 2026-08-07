"""Story 162-49 — persona route live break + cwd-dependent test vacuity.

Epic: 162 (Finish & sprint-tooling truthfulness)

Two coupled defects, one story.

**Defect 1 — live TypeError.** ``pf/frame/routes/data_proxy.py:72`` calls::

    load_persona(project_dir, session_id=session_id)

but ``pf/prime/persona.py:93`` defines::

    load_persona(agent_name: str, project_root: Path | None = None)
        -> tuple[Persona | None, str | None]

Every argument is wrong: the first positional is a project directory where an
agent name belongs, ``session_id`` is not a parameter at all, and the ``/full``
variant adds a second non-existent ``full`` kwarg. Any request that reaches
either line raises ``TypeError``. ``load_persona`` has six correct production
callers (``ws_push``, ``persona/cli``, ``prime/cli`` x2, ``prime/tiers`` x2) and
~25 correct test callers — the published signature is right and the route is
wrong, so the fix belongs in the route.

**Defect 2 — cwd-dependent vacuity.** ``_get_project_dir()`` falls back to
``os.getcwd()``. Run pytest from ``pennyfarthing-dist/`` and no ``.pennyfarthing/``
is found, the route short-circuits to ``404 {"error": "Not a Pennyfarthing
project"}`` before ever reaching line 72, and the existing persona tests — which
assert only ``status_code in (200, 404)`` — pass VACUOUSLY. That is why the same
commit reported 6123 passed / 0 failed from one directory and 6119 / 4 from
another, and why both the 162-29 Reviewer's cycle-1 count and ``reviewer-preflight``
were fooled. This is a pipeline-honesty defect, not a flake.

Acceptance Criteria (derived by TEA — the sprint YAML carried none):

- [AC1] ``GET /api/persona`` against a valid PF project returns HTTP 200 and does
        not raise. Today it raises ``TypeError``.
- [AC2] The 200 payload matches the persona contract the TUI header already
        consumes (``pf/tui/app.py::_render_header`` / ``_resolve_portrait``) and
        that ``ws_push.fetch_persona`` already produces: ``character``, ``role``,
        ``roleDescription``, ``quote``, ``theme``, ``trait``, ``isStreaming``,
        ``portraitPath`` — with ``character``/``role``/``theme`` reflecting the
        active agent and configured theme, not placeholders.
- [AC3] ``GET /api/persona/full`` returns 200 and a superset of the AC2 keys.
- [AC4] The route resolves the active agent from the project dir it was given
        (``.session/agents/``, the same resolution statusline and ws_push use) —
        never from ``os.getcwd()``.
- [AC5] Absent-input cases stay 404 with an ``error`` string: no active agent →
        ``"No active persona"``; project dir that is not a PF project →
        ``"Not a Pennyfarthing project"``.
- [AC6] ``pf.prime.persona.load_persona``'s signature is unchanged — the fix goes
        into the caller, not the shared six-caller API.
- [AC7] cwd-independence: identical status and body from the orchestrator root,
        from ``pennyfarthing-dist/``, and from an unrelated temp dir; and no
        data-proxy route short-circuits on ``"Not a Pennyfarthing project"``
        when ``PF_PROJECT_DIR`` names a real project.
- [AC8] The cwd-independence mechanism is a shared conftest fixture
        (``pf_project_dir``), not a monkeypatch copy-pasted per test.
"""

from __future__ import annotations

import inspect
import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from pf.frame.app import create_app

# The exact payload contract ws_push.fetch_persona already emits and
# tui/app.py::_render_header already reads.
PERSONA_CONTRACT_KEYS = {
    "character",
    "role",
    "roleDescription",
    "quote",
    "theme",
    "trait",
    "isStreaming",
    "portraitPath",
}

# Every data-proxy GET route that derives its project dir from _get_project_dir().
DATA_PROXY_GET_ROUTES = [
    "/api/persona",
    "/api/persona/full",
    "/api/story",
    "/api/git",
    "/api/context",
    "/api/theme-agents",
    "/api/project-info",
]


@pytest.fixture()
def client(pf_project_dir: Path) -> TestClient:
    """Frame TestClient bound to the hermetic conftest project (AC8).

    Depending on ``pf_project_dir`` is what makes every test in this module
    cwd-independent — the fixture exports ``PF_PROJECT_DIR``, so
    ``_get_project_dir()`` never reaches its ``os.getcwd()`` fallback.
    """
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# AC1 + AC2: the live break
# ---------------------------------------------------------------------------


class TestPersonaRouteReachesLoadPersona:
    """The persona route must survive the call it makes at data_proxy.py:72."""

    def test_persona_returns_200_not_type_error(self, client: TestClient):
        """AC1: A valid project dir must yield 200, not a TypeError.

        This is the direct pin on the live break. Today the request reaches
        ``load_persona(project_dir, session_id=...)`` and raises
        ``TypeError: load_persona() got an unexpected keyword argument
        'session_id'``, which Starlette's TestClient re-raises.
        """
        response = client.get("/api/persona")

        assert response.status_code == 200, (
            f"expected 200 for a project with an active agent and a theme, "
            f"got {response.status_code}: {response.text}"
        )

    def test_persona_payload_matches_tui_contract(self, client: TestClient):
        """AC2: Payload carries every key the TUI header renders."""
        data = client.get("/api/persona").json()

        assert isinstance(data, dict)
        missing = PERSONA_CONTRACT_KEYS - set(data)
        assert not missing, f"persona payload missing contract keys: {sorted(missing)}"

    def test_persona_payload_reflects_active_agent_and_theme(self, client: TestClient):
        """AC2+AC4: Values come from the fixture project, not placeholders.

        ``.session/agents/current`` names ``dev``; the configured theme maps
        ``dev`` to Ada Lovelace. A payload that says "Unknown" or echoes a
        directory path means agent resolution is still broken.
        """
        data = client.get("/api/persona").json()

        assert data["character"] == "Ada Lovelace"
        assert data["role"] == "dev"
        assert data["theme"] == "conftest-test-theme"
        assert data["roleDescription"] == "precise and unhurried"
        assert data["quote"] == "First, make it correct."

    def test_persona_does_not_leak_project_path_as_character(self, client: TestClient):
        """AC2: Negative case — the bug's shape was passing project_dir as agent_name.

        If a future regression re-swaps the arguments, the character field would
        stringify a filesystem path. Assert it never does.
        """
        data = client.get("/api/persona").json()

        character = data.get("character", "")
        assert "/" not in character, f"character looks like a path: {character!r}"
        assert character != "Unknown", "agent name did not resolve to a themed character"

    def test_persona_tracks_a_different_active_agent(
        self, client: TestClient, active_agent
    ):
        """AC4: Changing the active agent changes the persona returned.

        Guards against a hardcoded agent name satisfying the tests above.
        """
        active_agent("tea")

        data = client.get("/api/persona").json()

        assert data["character"] == "Grace Hopper"
        assert data["role"] == "tea"

    def test_persona_full_returns_200_superset(self, client: TestClient):
        """AC3: ``/full`` survives its own call and returns at least the base keys."""
        response = client.get("/api/persona/full")

        assert response.status_code == 200, (
            f"expected 200 from /api/persona/full, got {response.status_code}: "
            f"{response.text}"
        )
        data = response.json()
        missing = PERSONA_CONTRACT_KEYS - set(data)
        assert not missing, f"/full payload missing contract keys: {sorted(missing)}"
        assert data["character"] == "Ada Lovelace"


# ---------------------------------------------------------------------------
# AC5: absent-input cases stay 404 (and stay distinguishable)
# ---------------------------------------------------------------------------


class TestPersonaRouteAbsentInputs:
    """404s must remain 404s — and must say which 404 they are."""

    def test_no_active_agent_returns_no_active_persona(
        self, client: TestClient, active_agent
    ):
        """AC5: Empty ``.session/agents/`` → 404 "No active persona"."""
        active_agent(None)

        response = client.get("/api/persona")

        assert response.status_code == 404
        assert response.json()["error"] == "No active persona"

    def test_unknown_agent_returns_no_active_persona(
        self, client: TestClient, active_agent
    ):
        """AC5: An agent absent from the theme resolves to no persona, not a 500."""
        active_agent("nonexistent-role")

        response = client.get("/api/persona")

        assert response.status_code == 404
        assert response.json()["error"] == "No active persona"

    def test_non_pf_project_dir_returns_not_a_project(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """AC5: A directory with no ``.pennyfarthing/`` → 404 "Not a Pennyfarthing project"."""
        bare = tmp_path / "not-a-pf-project"
        bare.mkdir()
        monkeypatch.setenv("PF_PROJECT_DIR", str(bare))

        response = TestClient(create_app()).get("/api/persona")

        assert response.status_code == 404
        assert response.json()["error"] == "Not a Pennyfarthing project"


# ---------------------------------------------------------------------------
# AC6: the fix belongs in the caller
# ---------------------------------------------------------------------------


class TestLoadPersonaSignatureUnchanged:
    """``load_persona`` is shared by six production callers — don't move it."""

    def test_signature_is_agent_name_then_project_root(self):
        """AC6: Parameters stay ``(agent_name, project_root=None)``."""
        from pf.prime.persona import load_persona

        params = list(inspect.signature(load_persona).parameters)

        assert params == ["agent_name", "project_root"], (
            "load_persona's signature changed — the 162-49 fix belongs in "
            f"data_proxy.py, not in the shared API. Got: {params}"
        )

    def test_signature_rejects_the_buggy_call(self):
        """AC6: ``session_id`` / ``full`` must remain non-parameters.

        Binding the original buggy call must still fail. If this ever passes,
        someone widened the shared API to accommodate one broken caller.
        """
        from pf.prime.persona import load_persona

        sig = inspect.signature(load_persona)

        with pytest.raises(TypeError):
            sig.bind("/some/project/dir", session_id="abc123")
        with pytest.raises(TypeError):
            sig.bind("/some/project/dir", session_id="abc123", full=True)

    def test_returns_persona_theme_tuple(self, pf_project_dir: Path):
        """AC6: The contract is a ``(Persona, theme)`` tuple, not a dict.

        The buggy route did ``if not persona`` then ``JSONResponse(persona)`` —
        which would serialize a tuple. Pin the real return shape so the caller
        has to unpack it.
        """
        from pf.prime.persona import load_persona

        result = load_persona("dev", project_root=pf_project_dir)

        assert isinstance(result, tuple)
        assert len(result) == 2
        persona, theme = result
        assert persona is not None
        assert persona.character == "Ada Lovelace"
        assert theme == "conftest-test-theme"


# ---------------------------------------------------------------------------
# AC7 + AC8: cwd-independence — the anti-vacuity guard
# ---------------------------------------------------------------------------


def _candidate_cwds(tmp_path: Path) -> list[Path]:
    """Directories pytest plausibly runs from, including the two that diverged.

    - ``pennyfarthing-dist/`` — the cwd under which the persona tests passed
      vacuously (no ``.pennyfarthing/`` at or above it).
    - the orchestrator root — the cwd under which they failed loudly
      (``.pennyfarthing/`` present).
    - an unrelated temp dir — the control.
    """
    dist_root = Path(__file__).resolve().parents[3]  # pennyfarthing-dist/
    unrelated = tmp_path / "unrelated-cwd"
    unrelated.mkdir(exist_ok=True)

    candidates = [dist_root, dist_root.parent, dist_root.parent.parent, unrelated]
    return [c for c in candidates if c.is_dir()]


class TestCwdIndependence:
    """Suite results must not depend on the shell's working directory."""

    def test_fixture_pins_project_dir(self, pf_project_dir: Path, monkeypatch):
        """AC8: Sentinel — the shared fixture is what removes the cwd degree of freedom.

        If someone drops ``PF_PROJECT_DIR`` from the fixture, this fails loudly
        instead of the suite quietly going vacuous again.
        """
        import os

        assert os.environ.get("PF_PROJECT_DIR") == str(pf_project_dir)
        assert (pf_project_dir / ".pennyfarthing").is_dir()
        for ambient in ("PROJECT_ROOT", "CLAUDE_PROJECT_DIR", "PF_THEME"):
            assert ambient not in os.environ, (
                f"{ambient} is set and can redirect project-root resolution"
            )

    def test_persona_response_identical_from_every_cwd(
        self, pf_project_dir: Path, run_from_cwd, tmp_path: Path
    ):
        """AC7: Same status and same body from every candidate cwd.

        This is the test the vacuity would have caught. Before the fix it fails
        from all cwds (TypeError); after the fix it must return the identical
        200 payload from all of them.
        """
        cwds = _candidate_cwds(tmp_path)
        assert len(cwds) >= 2, f"need >=2 candidate cwds to prove invariance, got {cwds}"

        observed: dict[str, tuple[int, str]] = {}
        for cwd in cwds:
            run_from_cwd(cwd)
            response = TestClient(create_app()).get("/api/persona")
            observed[str(cwd)] = (
                response.status_code,
                json.dumps(response.json(), sort_keys=True),
            )

        distinct = set(observed.values())
        assert len(distinct) == 1, (
            "persona route response varies with cwd — suite counts are not "
            f"trustworthy: {observed}"
        )
        status, _body = distinct.pop()
        assert status == 200

    def test_no_data_proxy_route_short_circuits_on_project_detection(
        self, client: TestClient, run_from_cwd, tmp_path: Path
    ):
        """AC7: With PF_PROJECT_DIR set, no route may claim "Not a Pennyfarthing project".

        That 404 is precisely the short-circuit that made the persona assertions
        vacuous. Sweep every data-proxy GET route from the worst-case cwd.
        """
        run_from_cwd(tmp_path)

        offenders = []
        for path in DATA_PROXY_GET_ROUTES:
            response = client.get(path)
            try:
                body = response.json()
            except ValueError:
                continue
            if isinstance(body, dict) and body.get("error") == "Not a Pennyfarthing project":
                offenders.append(path)

        assert not offenders, (
            "routes short-circuited on project detection despite PF_PROJECT_DIR "
            f"naming a real project: {offenders}"
        )
