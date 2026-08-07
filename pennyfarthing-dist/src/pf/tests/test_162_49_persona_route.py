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

        Story 162-49 (rework 2): the theme assertion pins PROVENANCE, not just
        shape. A 200 alone is cwd-sensitive evidence — under an ``os.getcwd()``
        regression, a run from a directory that happens to be a real PF project
        with a live persona still returns 200 and this test still passed. Only
        fixture-specific values distinguish "resolved from the dir we were given"
        from "resolved from wherever pytest was launched".
        """
        response = client.get("/api/persona")

        assert response.status_code == 200, (
            f"expected 200 for a project with an active agent and a theme, "
            f"got {response.status_code}: {response.text}"
        )
        assert response.json()["theme"] == "conftest-test-theme"

    def test_persona_payload_matches_tui_contract(self, client: TestClient):
        """AC2: Payload carries every key the TUI header renders.

        Story 162-49 (rework 2): the theme assertion is here for the same reason
        as above — a real ambient project satisfies the key-set check too, so the
        shape assertion alone does not prove which project answered.
        """
        data = client.get("/api/persona").json()

        assert isinstance(data, dict)
        missing = PERSONA_CONTRACT_KEYS - set(data)
        assert not missing, f"persona payload missing contract keys: {sorted(missing)}"
        assert data["theme"] == "conftest-test-theme"

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

        Story 162-49 (rework 2): the status assertion below is REQUIRED, not
        decorative. Without it this test was vacuous on every non-200 response —
        a 404 body is ``{"error": ...}``, so ``data.get("character", "")``
        returned ``""``, and both ``"/" not in ""`` and ``"" != "Unknown"`` held.
        It passed on exactly the responses it was written to rule out. Indexing
        ``data["character"]`` rather than ``.get`` keeps it that way.
        """
        response = client.get("/api/persona")

        assert response.status_code == 200, response.text
        character = response.json()["character"]
        assert "/" not in character, f"character looks like a path: {character!r}"
        assert character != "Unknown", "agent name did not resolve to a themed character"

    def test_persona_tracks_a_different_active_agent(self, client: TestClient, active_agent):
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
            f"expected 200 from /api/persona/full, got {response.status_code}: {response.text}"
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

    def test_no_active_agent_returns_no_active_persona(self, client: TestClient, active_agent):
        """AC5: Empty ``.session/agents/`` → 404 "No active persona"."""
        active_agent(None)

        response = client.get("/api/persona")

        assert response.status_code == 404
        assert response.json()["error"] == "No active persona"

    def test_unknown_agent_returns_no_active_persona(self, client: TestClient, active_agent):
        """AC5: An agent absent from the theme resolves to no persona, not a 500."""
        active_agent("nonexistent-role")

        response = client.get("/api/persona")

        assert response.status_code == 404
        assert response.json()["error"] == "No active persona"

    def test_non_pf_project_dir_returns_not_a_project(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """AC5: A directory with no ``.pennyfarthing/`` → 404 "Not a Pennyfarthing project".

        Story 162-49 (rework 2): this is the one test that hand-rolls its env
        instead of using ``pf_project_dir`` (it needs a NON-PF directory, which
        the fixture cannot provide). That made it the one place B1's fix could
        rot: now that ``FRAME_PROJECT_DIR`` outranks ``PF_PROJECT_DIR``, an
        ambient ``FRAME_PROJECT_DIR`` — exported by any running Frame server —
        would redirect resolution to a real project and turn this 404 into a 200.
        Clear the whole ambient set the fixture clears, for the same reason.
        """
        bare = tmp_path / "not-a-pf-project"
        bare.mkdir()
        for ambient in (
            "FRAME_PROJECT_DIR",
            "PROJECT_ROOT",
            "CLAUDE_PROJECT_DIR",
            "PF_THEME",
            "SESSION_ID",
        ):
            monkeypatch.delenv(ambient, raising=False)
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
        for ambient in ("FRAME_PROJECT_DIR", "PROJECT_ROOT", "CLAUDE_PROJECT_DIR", "PF_THEME"):
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
            f"persona route response varies with cwd — suite counts are not trustworthy: {observed}"
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


# ---------------------------------------------------------------------------
# Rework round 1 — the four blocking review findings, each pinned
# ---------------------------------------------------------------------------
#
# Every fix below was rejected as unpinned or wrong on the first pass. The
# assertions here exist so a later refactor cannot silently undo them — which is
# precisely the failure mode this whole story is about.

# The extra keys /full adds on top of PERSONA_CONTRACT_KEYS. Unpinned on the
# first pass: deleting the entire `if full:` block left 85/85 green (B4).
FULL_ONLY_KEYS = {
    "roleTitle",
    "quirk",
    "motto",
    "helperName",
    "helperStyle",
}


class TestFullContractIsPinned:
    """B4: /api/persona/full's extra keys are asserted, not just counted."""

    def test_full_payload_carries_every_full_only_key(self, client: TestClient):
        """AC3: the superset is a specific set of keys, not any superset."""
        data = client.get("/api/persona/full").json()

        missing = FULL_ONLY_KEYS - set(data)
        assert not missing, f"/full payload missing its own contract keys: {sorted(missing)}"

    def test_full_payload_values_come_from_the_theme(self, client: TestClient):
        """B4: values, not just keys — deleting the block must fail loudly.

        Every value below is declared for ``dev`` in the conftest theme.
        """
        data = client.get("/api/persona/full").json()

        assert data["roleTitle"] == "Developer"
        assert data["quirk"] == "annotates everything"
        assert data["motto"] == "Correctness before speed."
        assert data["helperName"] == "Difference Engine"
        assert data["helperStyle"] == "mechanical"

    def test_base_payload_omits_the_full_only_keys(self, client: TestClient):
        """AC2/AC3: base and /full are genuinely different payloads.

        Without this, ``full=True`` could become a no-op and both endpoints would
        still satisfy "superset of the base keys".
        """
        data = client.get("/api/persona").json()

        leaked = FULL_ONLY_KEYS & set(data)
        assert not leaked, f"base payload leaked /full-only keys: {sorted(leaked)}"

    def test_absent_theme_fields_serialize_as_empty_strings(self, client: TestClient, active_agent):
        """B4: ``tea`` declares no quirk and no helper — those keys stay present.

        Pins the None-to-"" coercion rather than leaving it accidental; a consumer
        reading ``data["helperName"]`` must not KeyError on a sparse theme entry.
        """
        active_agent("tea")

        data = client.get("/api/persona/full").json()

        assert data["quirk"] == ""
        assert data["helperName"] == ""
        assert data["helperStyle"] == ""
        assert data["motto"] == "Prove it breaks."


class TestProductionProjectDirResolution:
    """B1: the route must read the variable production actually sets."""

    def test_frame_project_dir_alone_resolves_the_persona(
        self, pf_project_dir: Path, run_from_cwd, tmp_path: Path, monkeypatch
    ):
        """B1/AC4: FRAME_PROJECT_DIR is the only project-dir var production sets.

        ``launcher.py:128`` exports FRAME_PROJECT_DIR when Frame is spawned;
        nothing anywhere sets PF_PROJECT_DIR outside tests. With only the
        production variable present and the cwd somewhere else, the route used to
        fall through to ``os.getcwd()`` and 404 with "Not a Pennyfarthing
        project" while the WebSocket channel returned the payload.
        """
        monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
        monkeypatch.setenv("FRAME_PROJECT_DIR", str(pf_project_dir))
        run_from_cwd(tmp_path)

        response = TestClient(create_app()).get("/api/persona")

        assert response.status_code == 200, (
            f"route ignored FRAME_PROJECT_DIR and fell back to cwd: {response.text}"
        )
        assert response.json()["character"] == "Ada Lovelace"

    def test_frame_project_dir_outranks_pf_project_dir(
        self, pf_project_dir: Path, tmp_path: Path, monkeypatch
    ):
        """B1: precedence matches ws_push — FRAME_PROJECT_DIR wins.

        Both transports share one payload builder; if they disagree about which
        directory to build it for, they return different answers for one request.
        """
        decoy = tmp_path / "decoy-not-a-pf-project"
        decoy.mkdir()
        monkeypatch.setenv("PF_PROJECT_DIR", str(decoy))
        monkeypatch.setenv("FRAME_PROJECT_DIR", str(pf_project_dir))

        response = TestClient(create_app()).get("/api/persona")

        assert response.status_code == 200, response.text
        assert response.json()["character"] == "Ada Lovelace"

    def test_both_transports_agree_under_production_env(
        self, pf_project_dir: Path, run_from_cwd, tmp_path: Path, monkeypatch
    ):
        """B1: the HTTP route and the WebSocket fetcher return the same payload.

        The measured symptom of the divergence: identical env, one 404 and one
        full payload. Assert the two resolvers cannot drift again.
        """
        from pf.frame.ws_push import fetch_persona

        monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
        monkeypatch.setenv("FRAME_PROJECT_DIR", str(pf_project_dir))
        run_from_cwd(tmp_path)

        http_payload = TestClient(create_app()).get("/api/persona").json()

        assert http_payload == fetch_persona()


class TestPersonaFetchDegradesLoudly:
    """B2: a project-dir resolution failure warns and degrades — never escapes."""

    def test_unlinked_cwd_warns_and_returns_empty(self, monkeypatch, tmp_path: Path):
        """B2: ``os.getcwd()`` raises once the cwd is unlinked.

        Reachable in production: the launcher sets the server's cwd to the
        project dir, so a ``git worktree remove`` / ``mv`` / tmpdir cleanup while
        Frame is alive makes every resolution raise. ``poll_and_broadcast``
        swallows exceptions with ``except Exception: pass``, so an escape here
        stops the persona panel updating with zero diagnostic.
        """
        from pf.frame.ws_push import fetch_persona

        for ambient in ("FRAME_PROJECT_DIR", "PF_PROJECT_DIR"):
            monkeypatch.delenv(ambient, raising=False)

        doomed = tmp_path / "doomed-cwd"
        doomed.mkdir()
        monkeypatch.chdir(doomed)
        doomed.rmdir()

        with pytest.warns(UserWarning, match="Failed to load persona"):
            assert fetch_persona() == {}


class TestPersonaRouteDoesNotBlockTheEventLoop:
    """B3: the synchronous builder must not run on the ASGI event loop."""

    def test_builder_runs_off_the_event_loop_thread(self, client: TestClient, monkeypatch):
        """B3: ``build_persona_payload`` does blocking network I/O.

        ``resolve_portrait_path`` → ``portrait_cdn.fetch_portrait`` walks four
        size buckets at ``urlopen(timeout=30)`` each and does not cache a miss —
        up to ~120s per request. Run inline in an ``async def`` handler that
        stalls the entire loop (measured: a concurrent ``/ping`` blocked 4s).
        Assert the builder executes on a worker thread, not the loop's.
        """
        import asyncio as _asyncio

        observed: dict[str, bool] = {}

        def _spy(project_dir, full=False):
            # A running event loop is only visible from the loop's OWN thread.
            # Reachable here => the builder is executing on the loop and every
            # blocking urlopen inside it stalls the whole server. Comparing
            # thread idents against the test's would prove nothing: TestClient
            # already runs the app in a separate thread.
            try:
                _asyncio.get_running_loop()
                observed["on_loop"] = True
            except RuntimeError:
                observed["on_loop"] = False
            return {"character": "Ada Lovelace"}

        monkeypatch.setattr("pf.frame.ws_push.build_persona_payload", _spy)

        assert client.get("/api/persona").status_code == 200
        assert observed, "build_persona_payload was never called"
        assert not observed["on_loop"], (
            "build_persona_payload ran on the event-loop thread — its blocking "
            "network I/O stalls every other request for up to ~120s"
        )


class TestPortraitBranchOverHttp:
    """B3 follow-up: the branch that does the blocking I/O must be executed."""

    def _theme_with_portrait_slug(self, pf_project_dir: Path) -> None:
        """Give ``dev`` a resolvable portrait slug (``shortName`` + full OCEAN).

        ``resolve_portrait_path`` returns None before touching the CDN unless the
        theme YAML carries both, which is why the base fixture never reaches the
        network — and why the portrait branch had no HTTP-level coverage at all.
        """
        theme_yaml = (
            pf_project_dir / ".pennyfarthing" / "personas" / "themes" / "conftest-test-theme.yaml"
        )
        theme_yaml.write_text(
            theme_yaml.read_text(encoding="utf-8").replace(
                "  dev:\n",
                "  dev:\n    shortName: Ada\n    ocean: {O: 5, C: 5, E: 2, A: 4, N: 2}\n",
                1,
            ),
            encoding="utf-8",
        )

    def test_route_returns_the_resolved_portrait_path(
        self, pf_project_dir: Path, monkeypatch, tmp_path: Path
    ):
        """B3: the portrait branch runs over HTTP and its result reaches the payload.

        This is the code path that stalls the event loop — four
        ``urlopen(timeout=30)`` attempts on a cache miss, uncached. Before this
        test, ``portraitPath`` was None for every route test (the fixture theme
        omits ``shortName``/``ocean``), so the offload B3 added was never
        exercised from the HTTP side at all.
        """
        self._theme_with_portrait_slug(pf_project_dir)
        portrait = tmp_path / "ada-55242.png"
        portrait.write_bytes(b"\x89PNG\r\n\x1a\n")

        calls: list[tuple] = []

        def _stub_fetch(theme, slug, preferred_size="medium", cache=None):
            calls.append((theme, slug))
            return portrait

        monkeypatch.setattr("pf.package.portrait_cdn.fetch_portrait", _stub_fetch)

        response = TestClient(create_app()).get("/api/persona")

        assert response.status_code == 200, response.text
        assert calls, "portrait resolution never reached the CDN fetch"
        theme, slug = calls[0]
        assert theme == "conftest-test-theme"
        assert slug == "ada-55242"
        assert response.json()["portraitPath"] == str(portrait)

    def test_portrait_fetch_runs_off_the_event_loop(self, pf_project_dir: Path, monkeypatch):
        """B3: the blocking CDN call specifically — not just the builder — is offloaded.

        The builder-level test stubs ``build_persona_payload`` itself, so it
        cannot see whether the real blocking work is on the loop. This one lets
        the whole payload path run and checks the thread at the actual
        ``urlopen`` site.
        """
        import asyncio as _asyncio

        self._theme_with_portrait_slug(pf_project_dir)
        observed: dict[str, bool] = {}

        def _stub_fetch(theme, slug, preferred_size="medium", cache=None):
            try:
                _asyncio.get_running_loop()
                observed["on_loop"] = True
            except RuntimeError:
                observed["on_loop"] = False
            return None

        monkeypatch.setattr("pf.package.portrait_cdn.fetch_portrait", _stub_fetch)

        TestClient(create_app()).get("/api/persona")

        assert observed, "the CDN fetch was never reached"
        assert not observed["on_loop"], (
            "portrait_cdn.fetch_portrait ran on the event-loop thread — this is "
            "the up-to-120s blocking call B3 is about"
        )

    def test_portrait_failure_degrades_without_losing_the_persona(
        self, pf_project_dir: Path, monkeypatch
    ):
        """B3/AC2: a broken CDN must cost the portrait, never the whole payload.

        ``build_persona_payload``'s inner try exists for exactly this; with the
        branch previously unreachable from the route tests, nothing pinned it.

        Note on what this does NOT assert: no warning is emitted. I expected
        ``build_persona_payload``'s "Failed to resolve portrait" warn to fire and
        it does not — ``resolve_portrait_path`` wraps the CDN call in its own
        ``except Exception: return None`` (``tui/portrait_resolver.py:86-90``), so
        a broken CDN is swallowed one level below and the outer handler never
        sees it. Pinning the real behaviour rather than the behaviour I assumed;
        the silent swallow is pre-existing upstream and logged as a Delivery
        Finding, not fixed here.
        """
        self._theme_with_portrait_slug(pf_project_dir)

        def _boom(theme, slug, preferred_size="medium", cache=None):
            raise OSError("CDN unreachable")

        monkeypatch.setattr("pf.package.portrait_cdn.fetch_portrait", _boom)

        response = TestClient(create_app()).get("/api/persona")

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["character"] == "Ada Lovelace"
        assert data["portraitPath"] is None
