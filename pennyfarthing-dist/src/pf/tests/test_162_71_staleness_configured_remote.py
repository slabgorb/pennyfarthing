"""RED tests for Story 162-71 (162-27 sub-area): staleness must honor the
configured remote rather than hardcoding ``origin``.

``pf.sprint.staleness._resolve_revision`` resolves the base revision to log
against by trying, in order::

    candidates = [f"origin/{base_branch}", base_branch]

The ``origin/`` prefix is HARDCODED. A repo whose configured remote is named
anything other than ``origin`` (``RepoConfig.remote_name``) has no
``origin/<base>`` remote-tracking ref, so ``_resolve_revision`` silently falls
back to the possibly-stale LOCAL ``<base>`` branch — a false/incomplete drift
report, the exact "silent fallback defeats the check" failure the module's own
docstring warns against.

The 162-71 decision (recorded in the session) is CONFIGURED-REMOTE HONORING:
``_resolve_revision`` accepts the repo's configured remote and probes
``<remote>/<base>``. Full-ref-path / gitrevisions-DWIM hardening is explicitly
OUT OF SCOPE for this sweep (the base/remote come from repos.yaml config, not an
operator-supplied session field, so the 162-4 threat model does not apply here),
so the probe stays in the bare ``<remote>/<base>`` shape — only the hardcoded
``origin`` changes.

162-24 (mergeable/mergeStateStatus case-fold pin) and 162-26 (ref-qualified
branch double-prefix in ``_branch_merge_state``) are ALREADY landed and pinned
(``test_162_19_classify_pr.py::test_case_folded_conflict_fields_still_block``,
``test_162_26_*`` / commit d3357227f), so this story adds no new tests for them.

Epic 162 — Finish & sprint-tooling truthfulness. Workflow: tdd.
"""

from __future__ import annotations

import inspect
import subprocess
from pathlib import Path

import pytest

from pf.sprint.staleness import _resolve_revision


def _init_repo(tmp_path: Path) -> Path:
    """A real git repo with one commit, on the default local branch."""
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
    (repo / "f.txt").write_text("x")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, check=True)
    return repo


def _make_tracking_ref(repo: Path, ref: str) -> None:
    """Create a remote-tracking ref (e.g. ``refs/remotes/upstream/develop``)
    pointing at HEAD, without a real remote — enough for ``rev-parse --verify``
    to resolve it."""
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=True
    ).stdout.strip()
    subprocess.run(["git", "update-ref", ref, sha], cwd=repo, check=True)


class TestResolveRevisionHonorsConfiguredRemote:
    """RED: _resolve_revision hardcodes ``origin/`` and cannot honor a
    configured non-origin remote."""

    def test_resolves_against_configured_non_origin_remote(self, tmp_path: Path) -> None:
        """A repo whose only base remote-tracking ref lives under a NON-origin
        remote must still resolve — by honoring the configured remote name."""
        repo = _init_repo(tmp_path)
        # Only upstream/develop exists — no origin/develop, no local develop.
        _make_tracking_ref(repo, "refs/remotes/upstream/develop")

        sig = inspect.signature(_resolve_revision)
        assert "remote" in sig.parameters, (
            "162-27: _resolve_revision must accept the repo's configured remote "
            "instead of hardcoding 'origin/' — no `remote` parameter found"
        )

        revision, err = _resolve_revision(repo, "develop", remote="upstream")
        assert err == "", f"expected clean resolution, got error: {err!r}"
        assert revision == "upstream/develop", (
            "162-27: base ref must resolve against the configured remote "
            f"'upstream', not fall back to a stale local ref; got {revision!r}"
        )

    def test_does_not_silently_fall_back_to_local_for_non_origin_remote(
        self, tmp_path: Path
    ) -> None:
        """The failure this fixes: hardcoded origin/ misses the real upstream ref
        and the module silently uses the stale local branch (or errors), hiding
        drift. Pin that the configured remote's ref is the one chosen."""
        repo = _init_repo(tmp_path)
        _make_tracking_ref(repo, "refs/remotes/upstream/develop")
        # A stale LOCAL develop also exists — the wrong answer the hardcoded
        # fallback would pick if it ignored the configured remote.
        subprocess.run(["git", "branch", "develop"], cwd=repo, check=True)

        sig = inspect.signature(_resolve_revision)
        assert "remote" in sig.parameters, (
            "162-27: _resolve_revision must accept a configured remote"
        )

        revision, err = _resolve_revision(repo, "develop", remote="upstream")
        assert err == ""
        assert revision == "upstream/develop", (
            "162-27: must prefer the configured remote's ref over the stale "
            f"local branch; got {revision!r}"
        )


class TestResolveRevisionOriginDefaultPreserved:
    """Green-on-arrival regression guard: omitting the remote must keep the
    pre-162-27 origin behavior for the common (origin) repo."""

    def test_defaults_to_origin_when_remote_unspecified(self, tmp_path: Path) -> None:
        repo = _init_repo(tmp_path)
        _make_tracking_ref(repo, "refs/remotes/origin/develop")

        revision, err = _resolve_revision(repo, "develop")
        assert err == ""
        assert revision == "origin/develop", (
            "default (no configured remote) must still resolve origin/<base>; "
            f"got {revision!r}"
        )

    def test_falls_back_to_local_base_when_no_remote_ref(self, tmp_path: Path) -> None:
        """Preserved behavior: with no remote-tracking ref, the local base is the
        documented fallback (typical in ad-hoc fixtures)."""
        repo = _init_repo(tmp_path)
        subprocess.run(["git", "branch", "develop"], cwd=repo, check=True)

        revision, err = _resolve_revision(repo, "develop")
        assert err == ""
        assert revision == "develop", f"expected local-base fallback; got {revision!r}"
