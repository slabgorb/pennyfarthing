"""RED tests for Story 162-87 — data_proxy git-panel base/remote polish.

Follow-up to the 162-71 review (see ``sprint/archive/162-71-session.md`` Delivery
Findings). Four distinct concerns, one AC each:

- **AC1** — non-``origin`` ``remote_name`` coverage. The 162-71 fix threaded the
  configured remote through the HTTP git routes, but no test ever exercised a
  non-``origin`` remote, so a regressor that re-hardcodes ``remote="origin"``
  while keeping ``base`` dynamic would stay green. These tests pin the remote
  axis on both HTTP git routes with a mutation-probe shape: a hardcoded
  ``origin`` would probe ``origin/main`` and FAIL the ``upstream/main`` assertion.

- **AC2** — honest ``_get_repos_config`` contract. The docstring claims "Each
  entry carries ``base`` and ``remote``" but the single-repo fallback omits both
  keys, and ``list[dict[str, str]]`` hides the optional-key contract. We cannot
  assert on a docstring, so we pin the RUNTIME contract the honest docstring /
  annotation must describe: repos.yaml entries carry ``base``+``remote``; the
  fallback entry carries ONLY ``name``+``path``. This guards against a "fix" that
  wrongly adds ``base``/``remote`` to the fallback to match the stale docstring.

- **AC3** — ``get_git`` root-repo edge handling. When repos.yaml declares repos
  but none at path ``"."`` (or declares ``repos: {}``), the route silently falls
  back to ``repos[0]`` / develop-origin defaults, hiding a real config mismatch.
  Per this file's established fail-loud pattern (160-16..22), the route must
  ``warnings.warn`` so operators see the mismatch. RED: no warning today.

- **AC4** — ``developBehind`` → ``baseBehind`` rename. The field now carries a
  per-repo base count (main for the trunk-based orchestrator), so the
  gitflow-flavored ``develop`` name actively leaks the wrong assumption. The
  rename must cover EVERY producer or the two transports diverge and the web
  consumer breaks. Producers: ``_get_git_info`` (data_proxy), ``get_git_all``
  (data_proxy), and ``fetch_git`` (ws_push — the WebSocket transport, a SECOND
  producer the story title did not name). RED: all three emit ``developBehind``.

Scope note (see session Design Deviations / Delivery Findings): ``ws_push``'s
``fetch_git`` calls ``_get_git_info(repo_path)`` with NO base/remote args, so it
ignores repos.yaml config and always probes ``origin/develop`` — the exact
two-transport divergence 162-49 fixed in this file. Renaming its field to
``baseBehind`` while it stays develop-hardcoded would be a named lie, so AC4 is
extended to make ``fetch_git`` base-aware (see
``test_ws_fetch_git_honors_configured_base``).

Epic 162 — Finish & sprint-tooling truthfulness. Workflow: tdd.
"""

from __future__ import annotations

import subprocess

import pytest
from starlette.testclient import TestClient

from pf.frame import ws_push
from pf.frame.app import create_app
from pf.frame.routes import data_proxy

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _write_single_repo_project(
    tmp_path, default_branch: str = "develop", remote_name: str = "origin"
) -> str:
    """A minimal PF project: repos.yaml declaring ONE repo at "." with the given
    base/remote, plus the .git and .pennyfarthing markers the route needs."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".git").mkdir()
    (pf_dir / "repos.yaml").write_text(
        "repos:\n"
        "  orchestrator:\n"
        '    path: "."\n'
        f"    default_branch: {default_branch}\n"
        f"    remote_name: {remote_name}\n",
        encoding="utf-8",
    )
    return str(tmp_path)


def _write_no_root_repo_project(tmp_path) -> str:
    """repos.yaml declaring TWO repos, NEITHER at path "." — the root-repo
    edge case for AC3."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".git").mkdir()
    (pf_dir / "repos.yaml").write_text(
        "repos:\n"
        "  api:\n"
        '    path: "api"\n'
        "    default_branch: main\n"
        "  web:\n"
        '    path: "web"\n'
        "    default_branch: main\n",
        encoding="utf-8",
    )
    return str(tmp_path)


def _write_empty_repos_project(tmp_path) -> str:
    """repos.yaml with an empty ``repos: {}`` mapping — AC3 edge case."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".git").mkdir()
    (pf_dir / "repos.yaml").write_text("repos: {}\n", encoding="utf-8")
    return str(tmp_path)


def _install_process_recorder(monkeypatch) -> list[list[str]]:
    """Record and benignly answer every ``git`` and ``gh`` subprocess call;
    non-git/gh calls fall through to the real implementation so app startup is
    unaffected. ``gh`` is intercepted so ws_push.fetch_git's _get_open_prs never
    reaches the network."""
    recorded: list[list[str]] = []
    real_run = subprocess.run

    def fake_run(cmd, *args, **kwargs):  # noqa: ANN001
        if isinstance(cmd, (list, tuple)) and cmd:
            head = str(cmd[0])
            if head.endswith("git"):
                recorded.append([str(c) for c in cmd])
                if "--abbrev-ref" in cmd:
                    out = "main\n"
                elif "status" in cmd:
                    out = ""
                elif "rev-list" in cmd:
                    out = "0\n"
                else:
                    out = ""
                return subprocess.CompletedProcess(cmd, 0, out, "")
            if head.endswith("gh"):
                # _get_open_prs expects JSON list on stdout.
                return subprocess.CompletedProcess(cmd, 0, "[]", "")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", fake_run)
    return recorded


def _rev_list_argvs(recorded: list[list[str]]) -> list[str]:
    return [" ".join(c) for c in recorded if "rev-list" in c]


@pytest.fixture(autouse=True)
def _reset_ws_push_pr_cache():
    """ws_push caches open-PR results per repo_path with a TTL; clear it so the
    recorder's ``gh`` interception is exercised each test, not a stale hit."""
    ws_push._open_pr_cache.clear()
    yield
    ws_push._open_pr_cache.clear()


# ---------------------------------------------------------------------------
# AC1 — non-origin remote_name coverage (mutation-probe shape)
# ---------------------------------------------------------------------------


class TestAC1NonOriginRemote:
    """The base-behind probe must target the repo's CONFIGURED remote, not a
    hardcoded ``origin``. Mutation-probe: a hardcoded ``origin`` probes
    ``origin/main`` and fails the ``upstream/main`` assertion."""

    def test_git_all_honors_non_origin_remote(self, tmp_path, monkeypatch) -> None:
        project = _write_single_repo_project(
            tmp_path, default_branch="main", remote_name="upstream"
        )
        recorded = _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/all")
        assert resp.status_code == 200

        probes = _rev_list_argvs(recorded)
        assert probes, "expected the git route to issue rev-list probes"
        assert any("upstream/main" in p for p in probes), (
            "AC1: /api/git/all base-behind probe must target the configured "
            f"remote 'upstream' and base 'main'; probed: {probes}"
        )
        assert not any("origin/main" in p for p in probes), (
            "AC1: a hardcoded 'origin' remote must not survive when the repo "
            f"configures remote_name 'upstream'; probed: {probes}"
        )

    def test_git_single_honors_non_origin_remote(self, tmp_path, monkeypatch) -> None:
        project = _write_single_repo_project(
            tmp_path, default_branch="main", remote_name="upstream"
        )
        recorded = _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/")
        assert resp.status_code == 200

        probes = _rev_list_argvs(recorded)
        assert probes, "expected the git route to issue rev-list probes"
        assert any("upstream/main" in p for p in probes), (
            "AC1: /api/git/ base-behind probe must target configured remote "
            f"'upstream' / base 'main'; probed: {probes}"
        )
        assert not any("origin/main" in p for p in probes), (
            f"AC1: hardcoded 'origin' must not survive; probed: {probes}"
        )


# ---------------------------------------------------------------------------
# AC2 — honest _get_repos_config contract
# ---------------------------------------------------------------------------


class TestAC2ReposConfigContract:
    """Pin the runtime contract the honest docstring / type annotation must
    describe: repos.yaml entries carry base+remote; the fallback carries only
    name+path."""

    def test_repos_yaml_entries_carry_base_and_remote(self, tmp_path) -> None:
        project = _write_single_repo_project(
            tmp_path, default_branch="main", remote_name="upstream"
        )
        entries = data_proxy._get_repos_config(project)
        assert entries, "expected at least one repo entry from repos.yaml"
        for e in entries:
            assert "base" in e and "remote" in e, (
                f"AC2: repos.yaml-path entries must carry base+remote; got {e}"
            )
        assert entries[0]["base"] == "main"
        assert entries[0]["remote"] == "upstream"

    def test_single_repo_fallback_omits_base_and_remote(self, tmp_path) -> None:
        # No repos.yaml anywhere -> single-repo fallback shape.
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        entries = data_proxy._get_repos_config(str(tmp_path))
        assert len(entries) == 1, f"expected single fallback entry; got {entries}"
        assert set(entries[0]) == {"name", "path"}, (
            "AC2: the single-repo fallback must carry ONLY name+path (no "
            f"base/remote) — the honest contract; got keys {set(entries[0])}"
        )
        assert entries[0]["path"] == "."


# ---------------------------------------------------------------------------
# AC3 — get_git root-repo edge handling (fail-loud)
# ---------------------------------------------------------------------------


class TestAC3RootRepoEdgeHandling:
    """When no root repo can be identified, the single-repo panel silently
    probes a fallback. Fail loud so operators see the config mismatch."""

    def test_get_git_warns_when_no_root_repo_among_multiple(
        self, tmp_path, monkeypatch
    ) -> None:
        project = _write_no_root_repo_project(tmp_path)
        _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        with pytest.warns(Warning) as record:
            resp = client.get("/api/git/")
        assert resp.status_code == 200
        messages = " ".join(str(w.message) for w in record)
        assert "root" in messages.lower(), (
            "AC3: /api/git/ must warn when repos.yaml declares repos but none "
            f"at path '.' (no root repo); warnings seen: {messages!r}"
        )

    def test_get_git_warns_on_empty_repos_config(self, tmp_path, monkeypatch) -> None:
        project = _write_empty_repos_project(tmp_path)
        _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        with pytest.warns(Warning) as record:
            resp = client.get("/api/git/")
        assert resp.status_code == 200
        messages = " ".join(str(w.message) for w in record)
        assert "root" in messages.lower() or "repos" in messages.lower(), (
            "AC3: /api/git/ must warn on an empty `repos: {}` config instead of "
            f"silently defaulting; warnings seen: {messages!r}"
        )


# ---------------------------------------------------------------------------
# AC4 — developBehind -> baseBehind rename (every producer)
# ---------------------------------------------------------------------------


class TestAC4BaseBehindRename:
    """The behind-base count must be exposed as ``baseBehind`` everywhere;
    ``developBehind`` must not survive in any producer."""

    def test_get_git_info_unit_returns_baseBehind(self, tmp_path, monkeypatch) -> None:
        (tmp_path / ".git").mkdir()
        _install_process_recorder(monkeypatch)
        info = data_proxy._get_git_info(str(tmp_path), base="main", remote="origin")
        assert info is not None
        assert "baseBehind" in info, (
            f"AC4: _get_git_info must return 'baseBehind'; keys {set(info)}"
        )
        assert "developBehind" not in info, (
            f"AC4: _get_git_info must not return 'developBehind'; keys {set(info)}"
        )

    def test_git_all_response_uses_baseBehind(self, tmp_path, monkeypatch) -> None:
        project = _write_single_repo_project(tmp_path, default_branch="main")
        _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/all")
        assert resp.status_code == 200
        repos = resp.json()
        assert repos, "expected at least one repo in /api/git/all"
        for repo in repos:
            assert "baseBehind" in repo, (
                f"AC4: /api/git/all repo must expose 'baseBehind'; got {set(repo)}"
            )
            assert "developBehind" not in repo, (
                f"AC4: 'developBehind' must not survive in /api/git/all; got {set(repo)}"
            )

    def test_git_single_response_uses_baseBehind(self, tmp_path, monkeypatch) -> None:
        project = _write_single_repo_project(tmp_path, default_branch="main")
        _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/")
        assert resp.status_code == 200
        body = resp.json()
        assert "baseBehind" in body, (
            f"AC4: /api/git/ must expose 'baseBehind'; got {set(body)}"
        )
        assert "developBehind" not in body, (
            f"AC4: 'developBehind' must not survive in /api/git/; got {set(body)}"
        )

    def test_ws_fetch_git_uses_baseBehind(self, tmp_path, monkeypatch) -> None:
        """The WebSocket transport (ws_push.fetch_git) is a SECOND producer of
        this field and must rename in lockstep, or the two transports diverge and
        the web consumer breaks."""
        project = _write_single_repo_project(tmp_path, default_branch="main")
        _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        payload = ws_push.fetch_git()
        repos = payload.get("repos", [])
        assert repos, f"expected repos in ws_push.fetch_git payload; got {payload}"
        for repo in repos:
            assert "baseBehind" in repo, (
                f"AC4: ws_push.fetch_git repo must expose 'baseBehind'; got {set(repo)}"
            )
            assert "developBehind" not in repo, (
                "AC4: 'developBehind' must not survive in the WebSocket transport; "
                f"got {set(repo)}"
            )

    def test_ws_fetch_git_honors_configured_base(self, tmp_path, monkeypatch) -> None:
        """AC4 scope extension (see module docstring / session deviation): a
        ``baseBehind`` field in ws_push that is computed against a hardcoded
        ``develop`` is a named lie. fetch_git must thread the configured base
        like /api/git/all does."""
        project = _write_single_repo_project(tmp_path, default_branch="main")
        recorded = _install_process_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        ws_push.fetch_git()
        probes = _rev_list_argvs(recorded)
        assert probes, "expected ws_push.fetch_git to issue rev-list probes"
        assert any("main" in p for p in probes), (
            "AC4: ws_push.fetch_git base-behind probe must honor configured base "
            f"'main'; probed: {probes}"
        )
        assert not any("develop" in p for p in probes), (
            "AC4: ws_push.fetch_git must not hardcode 'develop' for a main-based "
            f"repo; probed: {probes}"
        )
