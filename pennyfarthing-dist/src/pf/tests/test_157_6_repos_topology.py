"""Failing tests (RED) for story 157-6 — repos.yaml topology verification.

pennyfarthing gh#98: three compounding setup gaps let a completely broken
dogfood topology pass green:

  (a) setup discovery never cross-checks repos.yaml-declared paths against disk;
  (b) repos.yaml has no ``remote:`` field for clone URLs;
  (c) ``pf doctor`` validates the runtime, not the topology, while ``pf init``
      silently materializes dist content as real directories over a missing
      symlink target.

These tests pin the acceptance criteria. They are written against a *designed*
interface (documented in the story handoff) that Dev must implement:

  RepoConfig (pf.git.repos):
    - ``remote: str = ""``                       (AC2)
    - ``symlinks: dict[str, str] = {}``          (AC1/AC4) parsed from the
      per-repo ``symlinks:`` map already present in the live repos.yaml
      (link-path -> target, both relative to the *project root*).

  Doctor topology check (pf.doctor.checks / .core):
    - ``check_repos_topology(root) -> CheckResult(name="repos_topology", ...)``
      registered in ``CHECKS`` and ``_CHECK_FNS``. FAILs (not silence) when a
      declared repo ``path`` is missing on disk, OR a declared symlink does not
      resolve to its declared target (broken link, or materialized-as-dir).
      ``detail`` names the offending repo / path. (AC1)

  Init loud warning (pf.init.core.init_project):
    - result ``data["materialized_warnings"]: list[str]`` — one entry per repo
      whose declared symlink target was missing at init time, each naming the
      missing repo. Empty list when nothing was materialized over a gap. (AC3)

  Relink affordance — chosen surface: ``pf doctor --fix`` (documented choice;
  see handoff). The ``repos_topology`` check exposes a ``fix_fn`` backed by:
    - ``relink_topology(root) -> dict`` that replaces materialized copies with
      the declared symlinks when the target exists; idempotent; refuses to
      destroy content when the target is absent. (AC4)

  AC5 (existing init/doctor/setup tests still pass) is covered by the existing
  suites, not re-asserted here.

CAUTION: every test uses a tmp-dir fixture. None of these touch the live
orchestrator topology / symlinks.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixtures — tmp-dir topologies only. Never the real orchestrator.
# ---------------------------------------------------------------------------


def _write_repos_yaml(root: Path, repos: dict) -> None:
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir(parents=True, exist_ok=True)
    (pf_dir / "repos.yaml").write_text(yaml.dump({"repos": repos}, default_flow_style=False))


@pytest.fixture
def healthy_topology(tmp_path: Path) -> Path:
    """A project whose repos.yaml-declared paths and symlinks are all intact.

    Layout (mirrors the dogfood shape):
        project/
          .pennyfarthing/repos.yaml         (orchestrator + sub)
          sub/                              (declared repo path, exists)
            dist/agents/                    (declared symlink target, exists)
          .pennyfarthing/agents -> sub/dist/agents   (correct symlink)
    """
    root = tmp_path / "project"
    root.mkdir()
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()

    # Sub-repo path + symlink target both real
    target = root / "sub" / "dist" / "agents"
    target.mkdir(parents=True)
    (target / ".keep").touch()

    link = pf_dir / "agents"
    rel = os.path.relpath(target, link.parent)
    link.symlink_to(rel)

    _write_repos_yaml(
        root,
        {
            "orchestrator": {
                "path": ".",
                "type": "orchestrator",
                "symlinks": {".pennyfarthing/agents": "sub/dist/agents"},
            },
            "sub": {
                "path": "sub",
                "type": "framework",
                "remote": "git@github.com:acme/sub.git",
            },
        },
    )
    return root


@pytest.fixture
def missing_repo_path(tmp_path: Path) -> Path:
    """repos.yaml declares a repo whose path does NOT exist on disk."""
    root = tmp_path / "project"
    root.mkdir()
    (root / ".pennyfarthing").mkdir()
    _write_repos_yaml(
        root,
        {
            "orchestrator": {"path": ".", "type": "orchestrator"},
            "sub": {
                "path": "sub",  # deliberately not created on disk
                "type": "framework",
                "remote": "git@github.com:acme/sub.git",
            },
        },
    )
    return root


@pytest.fixture
def materialized_over_gap(tmp_path: Path) -> Path:
    """The exact gh#98 failure: declared symlink replaced by a real dir copy.

    The repo path is missing AND the declared symlink location is a real
    directory full of materialized content instead of a symlink — every health
    signal would be green under the old runtime-only check.
    """
    root = tmp_path / "project"
    root.mkdir()
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()

    # Declared symlink location is a *materialized real dir*, target missing.
    materialized = pf_dir / "agents"
    materialized.mkdir()
    (materialized / "dev.md").write_text("# materialized copy\n")

    _write_repos_yaml(
        root,
        {
            "orchestrator": {
                "path": ".",
                "type": "orchestrator",
                "symlinks": {".pennyfarthing/agents": "pennyfarthing/dist/agents"},
            },
            "pennyfarthing": {
                "path": "pennyfarthing",  # not cloned
                "type": "framework",
                "remote": "git@github.com:acme/pennyfarthing.git",
            },
        },
    )
    return root


@pytest.fixture
def materialized_target_present(tmp_path: Path) -> Path:
    """Materialized copy exists AND the declared target now exists — relinkable."""
    root = tmp_path / "project"
    root.mkdir()
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()

    # Real target content (repo was cloned after the fact)
    target = root / "pennyfarthing" / "dist" / "agents"
    target.mkdir(parents=True)
    (target / "dev.md").write_text("# real source\n")

    # Materialized copy sitting where the symlink should be
    materialized = pf_dir / "agents"
    materialized.mkdir()
    (materialized / "dev.md").write_text("# stale materialized copy\n")

    _write_repos_yaml(
        root,
        {
            "orchestrator": {
                "path": ".",
                "type": "orchestrator",
                "symlinks": {".pennyfarthing/agents": "pennyfarthing/dist/agents"},
            },
            "pennyfarthing": {"path": "pennyfarthing", "type": "framework"},
        },
    )
    return root


# ---------------------------------------------------------------------------
# AC2: repos.yaml accepts an optional remote: per repo
# ---------------------------------------------------------------------------


class TestRemoteField:
    """AC2: optional ``remote:`` per repo; schema/validation covers it."""

    def test_repoconfig_has_remote_field(self):
        from pf.git.repos import RepoConfig

        rc = RepoConfig(
            name="x",
            path="x",
            repo_type="framework",
            default_branch="main",
            branch_strategy="trunk-based",
        )
        assert hasattr(rc, "remote"), "RepoConfig must expose a 'remote' field"
        assert rc.remote == "", "remote must default to empty string"

    def test_remote_parsed_from_yaml(self, missing_repo_path):
        from pf.git.repos import load_repos_config

        repos = load_repos_config(missing_repo_path)
        assert repos["sub"].remote == "git@github.com:acme/sub.git"

    def test_remote_absent_defaults_empty(self, missing_repo_path):
        from pf.git.repos import load_repos_config

        repos = load_repos_config(missing_repo_path)
        assert repos["orchestrator"].remote == ""

    def test_remote_field_validates(self):
        """A 'remote' value must be accepted by the repo-field validator."""
        from pf.settings.validators import validate_repo_field

        result = validate_repo_field("remote", "git@github.com:acme/sub.git")
        assert result.valid, f"remote should be a writable, valid field: {result.errors}"


# ---------------------------------------------------------------------------
# AC1 (parsing prerequisite): symlinks map parsed onto RepoConfig
# ---------------------------------------------------------------------------


class TestSymlinkMapParsing:
    """The declared per-repo symlinks map must surface on RepoConfig."""

    def test_repoconfig_has_symlinks_field(self):
        from pf.git.repos import RepoConfig

        rc = RepoConfig(
            name="x",
            path=".",
            repo_type="orchestrator",
            default_branch="main",
            branch_strategy="trunk-based",
        )
        assert hasattr(rc, "symlinks"), "RepoConfig must expose a 'symlinks' field"
        assert rc.symlinks == {}, "symlinks must default to empty dict"

    def test_symlinks_parsed_from_yaml(self, healthy_topology):
        from pf.git.repos import load_repos_config

        repos = load_repos_config(healthy_topology)
        assert repos["orchestrator"].symlinks == {
            ".pennyfarthing/agents": "sub/dist/agents"
        }


# ---------------------------------------------------------------------------
# AC1: doctor FAILS (actionably) on broken topology
# ---------------------------------------------------------------------------


class TestDoctorTopologyCheck:
    """AC1: topology check fails loud, naming the offender."""

    def test_check_registered(self):
        from pf.doctor.checks import CHECKS
        from pf.doctor.core import _CHECK_FNS

        names = [name for name, _ in CHECKS]
        assert "repos_topology" in names, "repos_topology not registered in CHECKS"
        assert "repos_topology" in _CHECK_FNS, "repos_topology not wired in _CHECK_FNS"

    def test_check_function_importable(self):
        from pf.doctor.checks import check_repos_topology  # noqa: F401

    def test_passes_on_healthy_topology(self, healthy_topology):
        from pf.doctor.checks import check_repos_topology

        result = check_repos_topology(healthy_topology)
        assert result.name == "repos_topology"
        assert result.status == "pass", result.detail

    def test_fails_when_declared_repo_path_missing(self, missing_repo_path):
        from pf.doctor.checks import check_repos_topology

        result = check_repos_topology(missing_repo_path)
        assert result.status == "fail"
        assert "sub" in result.detail, "failure must name the missing repo"

    def test_fails_when_symlink_materialized_as_dir(self, materialized_over_gap):
        from pf.doctor.checks import check_repos_topology

        result = check_repos_topology(materialized_over_gap)
        assert result.status == "fail"
        # Must name the broken symlink location or the missing repo.
        assert (
            ".pennyfarthing/agents" in result.detail
            or "pennyfarthing" in result.detail
        ), result.detail

    def test_fails_when_symlink_resolves_to_wrong_target(self, healthy_topology):
        """A declared symlink that resolves somewhere other than its target fails."""
        from pf.doctor.checks import check_repos_topology

        link = healthy_topology / ".pennyfarthing" / "agents"
        link.unlink()
        wrong = healthy_topology / "elsewhere"
        wrong.mkdir()
        link.symlink_to(os.path.relpath(wrong, link.parent))

        result = check_repos_topology(healthy_topology)
        assert result.status == "fail"

    def test_no_repos_yaml_does_not_crash(self, tmp_path):
        """A project without repos.yaml must not blow up — pass or skip cleanly."""
        from pf.doctor.checks import check_repos_topology

        root = tmp_path / "bare"
        root.mkdir()
        result = check_repos_topology(root)
        assert result.status in ("pass", "warn")

    def test_run_doctor_overall_fails_on_broken_topology(self, materialized_over_gap):
        """The aggregate report must go red — not stay green like gh#98."""
        from unittest.mock import patch

        from pf.doctor.core import run_doctor

        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            report = run_doctor(materialized_over_gap, fix=False)
        topo = next(c for c in report.checks if c.name == "repos_topology")
        assert topo.status == "fail"
        assert report.success is False


# ---------------------------------------------------------------------------
# AC3: init emits a loud warning naming the missing repo when materializing
# ---------------------------------------------------------------------------


class TestInitMaterializeWarning:
    """AC3: init names the missing repo instead of silently copying."""

    def _make_dist(self, tmp_path: Path) -> Path:
        """Minimal dist root with one content dir so init has something to copy."""
        dist = tmp_path / "dist"
        (dist / "agents").mkdir(parents=True)
        (dist / "agents" / "dev.md").write_text("# dev\n")
        return dist

    def test_result_exposes_materialized_warnings_key(self, tmp_path):
        """init_project result data always carries a materialized_warnings list."""
        import subprocess

        from pf.init.core import init_project

        target = tmp_path / "proj"
        target.mkdir()
        subprocess.run(["git", "init", str(target)], capture_output=True)
        dist = self._make_dist(tmp_path)

        result = init_project(target_dir=target, dist_root=dist)
        assert result["success"], result.get("error")
        assert "materialized_warnings" in result["data"], (
            "init result must always expose materialized_warnings"
        )
        assert isinstance(result["data"]["materialized_warnings"], list)

    def test_warns_naming_missing_repo_when_target_absent(self, tmp_path):
        """When a declared symlink target is missing, init names that repo loudly."""
        import subprocess

        from pf.init.core import init_project

        target = tmp_path / "proj"
        target.mkdir()
        subprocess.run(["git", "init", str(target)], capture_output=True)
        dist = self._make_dist(tmp_path)

        # Declare a repo whose symlink target does not exist on disk.
        _write_repos_yaml(
            target,
            {
                "orchestrator": {
                    "path": ".",
                    "type": "orchestrator",
                    "symlinks": {".pennyfarthing/agents": "missingrepo/dist/agents"},
                },
                "missingrepo": {
                    "path": "missingrepo",
                    "type": "framework",
                    "remote": "git@github.com:acme/missingrepo.git",
                },
            },
        )

        result = init_project(target_dir=target, dist_root=dist)
        assert result["success"], result.get("error")
        warnings = result["data"]["materialized_warnings"]
        assert warnings, "expected a loud warning when materializing over a gap"
        assert any("missingrepo" in w for w in warnings), warnings


# ---------------------------------------------------------------------------
# AC4: relink affordance (pf doctor --fix -> relink_topology)
# ---------------------------------------------------------------------------


class TestRelinkAffordance:
    """AC4: relink replaces materialized copies with declared symlinks.

    Chosen surface: ``pf doctor --fix`` driving ``relink_topology`` (documented
    choice — the topology check already lives in the doctor fix-fn model and
    ``--fix`` already exists, so this is the lower-friction fit).
    """

    def test_relink_topology_importable(self):
        from pf.init.core import relink_topology  # noqa: F401

    def test_relink_converts_materialized_copy_to_symlink(self, materialized_target_present):
        from pf.init.core import relink_topology

        link = materialized_target_present / ".pennyfarthing" / "agents"
        assert link.is_dir() and not link.is_symlink()  # precondition: materialized

        result = relink_topology(materialized_target_present)
        assert result["success"], result.get("error")
        assert link.is_symlink(), "materialized copy must become a symlink"
        # And it resolves to the declared target.
        target = materialized_target_present / "pennyfarthing" / "dist" / "agents"
        assert link.resolve() == target.resolve()

    def test_relink_is_idempotent(self, materialized_target_present):
        from pf.init.core import relink_topology

        first = relink_topology(materialized_target_present)
        assert first["success"]
        link = materialized_target_present / ".pennyfarthing" / "agents"
        assert link.is_symlink()
        # Second run: still a correct symlink, no error, no churn.
        second = relink_topology(materialized_target_present)
        assert second["success"]
        assert link.is_symlink()

    def test_relink_refuses_to_destroy_content_when_target_absent(self, materialized_over_gap):
        """If the declared target does not exist, relink must NOT delete the copy."""
        from pf.init.core import relink_topology

        link = materialized_over_gap / ".pennyfarthing" / "agents"
        preserved = link / "dev.md"
        assert preserved.is_file()

        result = relink_topology(materialized_over_gap)
        # Content must survive — the materialized copy is the only data we have.
        assert link.is_dir() and not link.is_symlink()
        assert preserved.is_file(), "must not destroy content when target absent"
        # It should report the skip rather than claim success-with-relink.
        assert result.get("relinked", 0) == 0

    def test_doctor_fix_relinks_topology(self, materialized_target_present):
        """`pf doctor --fix` must repair a relinkable topology end to end."""
        from unittest.mock import patch

        from pf.doctor.core import run_doctor

        link = materialized_target_present / ".pennyfarthing" / "agents"
        assert not link.is_symlink()  # precondition

        with patch("shutil.which", return_value="/usr/local/bin/pf"):
            run_doctor(materialized_target_present, fix=True)

        assert link.is_symlink(), "doctor --fix must relink a materialized copy"
