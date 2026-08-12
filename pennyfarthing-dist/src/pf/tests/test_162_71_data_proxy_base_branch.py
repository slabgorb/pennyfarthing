"""RED tests for Story 162-71 (162-27 sub-area): the Frame git route must
compute "behind base" against each repo's configured base branch + remote,
not a hardcoded ``origin/develop``.

``pf.frame.routes.data_proxy._get_git_info`` computes the ``developBehind``
field with::

    db = _run(["rev-list", "--count", "HEAD..origin/develop"])

Both the remote (``origin``) and the base branch (``develop``) are HARDCODED.
The dogfood orchestrator repo is trunk-based ``main``, so ``origin/develop``
does not exist for it and ``developBehind`` is silently ``None`` — a meaningless
number rendered in the panel. Non-``origin`` remotes break identically.

The 162-71 decision (recorded in the session): honor each repo's configured
``default_branch`` (from repos.yaml) and configured remote when computing the
behind-base count. Renaming the JSON field ``developBehind`` → ``baseBehind`` is
a SUGGESTED follow-up flagged for the Reviewer/frontend — so these tests assert
on the git ARGV actually issued (the observable probe target), NOT on the JSON
field name, and therefore stay green across a later rename.

Fix-agnostic: we assert which base ref the route probes, not how the config is
threaded into ``_get_git_info``.

Epic 162 — Finish & sprint-tooling truthfulness. Workflow: tdd.
"""

from __future__ import annotations

import subprocess

import pytest
from starlette.testclient import TestClient

from pf.frame.app import create_app


def _write_project(tmp_path, default_branch: str, remote_name: str = "origin") -> str:
    """A minimal Pennyfarthing project: a repos.yaml declaring one repo at "."
    with the given base/remote, plus the .git and .pennyfarthing markers the
    route's detection needs."""
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


def _install_git_recorder(monkeypatch) -> list[list[str]]:
    """Patch subprocess.run so every git invocation is recorded and answered
    benignly; non-git calls fall through to the real implementation so app
    startup is unaffected."""
    recorded: list[list[str]] = []
    real_run = subprocess.run

    def fake_run(cmd, *args, **kwargs):  # noqa: ANN001
        if isinstance(cmd, (list, tuple)) and cmd and str(cmd[0]).endswith("git"):
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
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", fake_run)
    return recorded


def _rev_list_argvs(recorded: list[list[str]]) -> list[str]:
    return [" ".join(c) for c in recorded if "rev-list" in c]


class TestGitAllHonorsConfiguredBaseBranch:
    """RED: /api/git/all hardcodes origin/develop instead of the repo's base."""

    def test_behind_probe_targets_configured_base_not_develop(
        self, tmp_path, monkeypatch
    ) -> None:
        project = _write_project(tmp_path, default_branch="main")
        recorded = _install_git_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/all")
        assert resp.status_code == 200

        probes = _rev_list_argvs(recorded)
        assert probes, "expected the git route to issue rev-list probes"
        assert not any("develop" in p for p in probes), (
            "162-27: base-behind must NOT hardcode 'develop' for a repo whose "
            f"configured default_branch is 'main'; probed: {probes}"
        )
        assert any("main" in p for p in probes), (
            "162-27: base-behind must target the repo's configured base "
            f"('main'); probed: {probes}"
        )

    def test_single_git_route_also_honors_configured_base(
        self, tmp_path, monkeypatch
    ) -> None:
        """The primary git panel (GET /api/git/) hits the same hardcoded probe;
        it too must resolve the base from the (root) repo's config."""
        project = _write_project(tmp_path, default_branch="main")
        recorded = _install_git_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/")
        assert resp.status_code == 200

        probes = _rev_list_argvs(recorded)
        assert probes, "expected the git route to issue rev-list probes"
        assert not any("develop" in p for p in probes), (
            "162-27: single git route must not hardcode 'develop' for a "
            f"main-based repo; probed: {probes}"
        )
        assert any("main" in p for p in probes), (
            f"162-27: single git route must target configured base 'main'; probed: {probes}"
        )


class TestGitAllPreservesGitflowBase:
    """Green-on-arrival regression guard: a gitflow repo (default_branch
    develop) must still probe develop after the fix."""

    def test_gitflow_repo_still_probes_develop(self, tmp_path, monkeypatch) -> None:
        project = _write_project(tmp_path, default_branch="develop")
        recorded = _install_git_recorder(monkeypatch)
        monkeypatch.setenv("FRAME_PROJECT_DIR", project)

        client = TestClient(create_app())
        resp = client.get("/api/git/all")
        assert resp.status_code == 200

        probes = _rev_list_argvs(recorded)
        assert any("develop" in p for p in probes), (
            "a gitflow repo (default_branch develop) must still probe its base "
            f"'develop'; probed: {probes}"
        )
