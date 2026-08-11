"""Story 153-2 RED tests — skip branch creation on trunk-based (main-only) repos.

Bug (reported by downstream oq-1 / oq-2):
  `sm-setup` and `sm-finish` assume every repo uses a feature-branch (gitflow)
  workflow. On orchestrator-type repos configured `branch_strategy: trunk-based`
  (only a `main` branch, no `develop`), they create stray `feat/*` branches at
  setup and try to `git checkout develop` / `git branch -d` at finish — neither
  of which makes sense on a trunk-based repo.

Expected implementation (Dev makes these pass):

  pf.git.repos
    - should_create_branch(repo_config: RepoConfig | None) -> bool
        The single source of truth for the branch decision:
          * trunk-based  -> False  (skip branching)
          * gitflow      -> True   (create feature branch as before)
          * None         -> True   (repo not in repos.yaml -> preserve legacy
                                     "branch everything" behavior; never crash)

  pf.git.create_branches.create_feature_branches (existing)
    - Must consult the target repo's branch_strategy and NOT create a branch
      for a trunk-based repo (no `feat/*` ref left behind, working branch
      unchanged). gitflow repos keep getting feature branches.

  pf.sprint.story_finish._git_cleanup(project_root, branch, repo_config) (new helper)
    - Extracted from finish_story Step 6. For a trunk-based repo it must NOT run
      `git checkout <default>`, `git pull`, or `git branch -d`. For a gitflow
      repo it runs them exactly as before.

  pennyfarthing-dist/agents/sm-setup.md (static)
    - Reads branch_strategy, skips the `git checkout -b` for trunk-based repos,
      and records the decision in the session file.

ACs covered:
  AC1 read branch_strategy (predicate + finish + sm-setup static)
  AC2 skip for trunk-based (predicate / create_feature_branches / finish)
  AC3 session documents decision (sm-setup static)
  AC4 preserve gitflow (predicate / create_feature_branches / finish)
  AC5 stacked repos unaffected (predicate stays True for gitflow+stacked)
  AC6 no errors / exit 0 (None never raises; finish skip path issues no git)

All tests should FAIL until the implementation lands.
"""

from __future__ import annotations

import asyncio
import re
import subprocess
from pathlib import Path
from unittest.mock import patch

from pf.git.create_branches import BranchAction, create_feature_branches
from pf.git.repos import RepoConfig

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Path to the sm-setup agent definition (repo-root relative, two parents up
# from .../src/pf/tests/ is .../src; dist root is four parents up).
_DIST_ROOT = Path(__file__).resolve().parents[3]
SM_SETUP_MD = _DIST_ROOT / "agents" / "sm-setup.md"


def _cfg(strategy: str, *, default_branch: str = "main", pr_strategy: str = "standard") -> RepoConfig:
    """Build a minimal RepoConfig with the given branch strategy."""
    return RepoConfig(
        name="repo",
        path=".",
        repo_type="orchestrator",
        default_branch=default_branch,
        branch_strategy=strategy,
        pr_strategy=pr_strategy,
    )


def _git(args: list[str], cwd: Path) -> None:
    """Run a git command in a throwaway repo with signing disabled."""
    subprocess.run(
        ["git", "-c", "commit.gpgsign=false", "-c", "user.email=t@t", "-c", "user.name=t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )


def _init_repo(path: Path, *, default_branch: str = "main", extra_branch: str | None = None) -> None:
    """Initialize a git repo with one commit on `default_branch`."""
    path.mkdir(parents=True, exist_ok=True)
    _git(["init", "-b", default_branch], path)
    (path / "README.md").write_text("seed\n", encoding="utf-8")
    _git(["add", "."], path)
    _git(["commit", "-m", "seed"], path)
    if extra_branch:
        _git(["branch", extra_branch], path)


def _branch_exists(path: Path, branch: str) -> bool:
    result = subprocess.run(
        ["git", "branch", "--list", branch],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def _current_branch(path: Path) -> str:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _write_repos_yaml(project_root: Path, *, name: str, strategy: str, default_branch: str) -> None:
    pf_dir = project_root / ".pennyfarthing"
    pf_dir.mkdir(parents=True, exist_ok=True)
    (pf_dir / "repos.yaml").write_text(
        "repos:\n"
        f"  {name}:\n"
        "    path: .\n"
        "    type: orchestrator\n"
        f"    default_branch: {default_branch}\n"
        f"    branch_strategy: {strategy}\n",
        encoding="utf-8",
    )


# ===========================================================================
# AC1/AC2/AC4/AC5/AC6 — should_create_branch predicate (single source of truth)
# ===========================================================================


class TestShouldCreateBranchPredicate:
    def test_trunk_based_returns_false(self) -> None:
        from pf.git.repos import should_create_branch

        assert should_create_branch(_cfg("trunk-based")) is False

    def test_gitflow_returns_true(self) -> None:
        from pf.git.repos import should_create_branch

        assert should_create_branch(_cfg("gitflow", default_branch="develop")) is True

    def test_missing_config_defaults_to_true(self) -> None:
        """AC6: a repo absent from repos.yaml must not crash — branch as before."""
        from pf.git.repos import should_create_branch

        assert should_create_branch(None) is True

    def test_gitflow_stacked_still_branches(self) -> None:
        """AC5: stacked PR repos are gitflow — must keep creating branches."""
        from pf.git.repos import should_create_branch

        cfg = _cfg("gitflow", default_branch="develop", pr_strategy="stacked")
        assert should_create_branch(cfg) is True


# ===========================================================================
# AC2 — create_feature_branches skips trunk-based repos (no stray feat/*)
# ===========================================================================


class TestCreateFeatureBranchesSkipsTrunkBased:
    def test_trunk_based_repo_gets_no_feature_branch(self, tmp_path: Path) -> None:
        repo = tmp_path
        _init_repo(repo, default_branch="main")
        _write_repos_yaml(repo, name="orch", strategy="trunk-based", default_branch="main")

        # Resolve config from this tmp project explicitly — hermetic and
        # independent of CLAUDE_PROJECT_DIR / cwd in the test environment.
        results = asyncio.run(
            create_feature_branches(
                [("orch", repo)], "feat/153-2-skip-test", project_root=repo
            )
        )

        assert len(results) == 1
        # The actual bug: no stray feature branch is left behind.
        assert not _branch_exists(repo, "feat/153-2-skip-test")
        # Working branch is untouched.
        assert _current_branch(repo) == "main"
        # The repo was not "created/checked-out" — it was skipped.
        assert results[0].action != BranchAction.CREATED

    def test_gitflow_repo_still_creates_branch(self, tmp_path: Path) -> None:
        repo = tmp_path
        _init_repo(repo, default_branch="develop", extra_branch=None)
        _write_repos_yaml(repo, name="fw", strategy="gitflow", default_branch="develop")

        results = asyncio.run(
            create_feature_branches(
                [("fw", repo)], "feat/153-2-gitflow-test", project_root=repo
            )
        )

        assert len(results) == 1
        assert _branch_exists(repo, "feat/153-2-gitflow-test")
        assert results[0].action == BranchAction.CREATED


# ===========================================================================
# AC2/AC4 — finish git cleanup respects branch strategy
# ===========================================================================


class TestFinishGitCleanupRespectsStrategy:
    def test_trunk_based_skips_checkout_and_branch_delete(self) -> None:
        from pf.sprint.story_finish import _git_cleanup

        with patch("pf.sprint.story_finish._run") as mock_run:
            _git_cleanup(Path("/proj"), branch=None, repo_config=_cfg("trunk-based"))

        invoked = [c.args[0] for c in mock_run.call_args_list if c.args]
        assert not any(cmd[:2] == ["git", "checkout"] for cmd in invoked), invoked
        assert not any(
            cmd[:2] == ["git", "branch"] and "-d" in cmd for cmd in invoked
        ), invoked

    def test_gitflow_runs_checkout_pull_and_branch_delete(self) -> None:
        from pf.sprint.story_finish import _git_cleanup

        cfg = _cfg("gitflow", default_branch="develop")
        with patch("pf.sprint.story_finish._run") as mock_run:
            # An explicit rc=0 rather than a bare MagicMock: 162-48 adds
            # read-only validation/existence probes ahead of the three
            # mutations, and a MagicMock `returncode` compares unequal to 0, so
            # a default mock would read as "base unusable" and skip cleanup.
            mock_run.return_value = subprocess.CompletedProcess(
                args=[], returncode=0, stdout="", stderr=""
            )
            _git_cleanup(Path("/proj"), branch="feat/153-2-x", repo_config=cfg)

        invoked = [c.args[0] for c in mock_run.call_args_list if c.args]
        # Prefix/containment rather than whole-argv equality: 162-48 guards the
        # base against flag parsing and pathspec DWIM (a `--` separator, a
        # qualified refspec), so the exact argv is not this story's contract —
        # "gitflow returns to the base and pulls it" is.
        assert any(
            cmd[:2] in (["git", "checkout"], ["git", "switch"])
            and any("develop" in token for token in cmd)
            for cmd in invoked
        ), invoked
        # pull is one of the three operations that must run on gitflow (and must
        # NOT run on trunk-based) — assert it symmetrically.
        assert any(cmd[:2] == ["git", "pull"] for cmd in invoked), invoked
        assert any(
            cmd[:2] == ["git", "branch"] and "-d" in cmd and "feat/153-2-x" in cmd
            for cmd in invoked
        ), invoked

    def test_unresolved_root_repo_skips_cleanup(self) -> None:
        """AC6 / regression guard: an unidentified root repo (repo_config=None)
        must NOT run `git checkout develop` — guessing a base branch on a
        main-only repo is the exact failure this story removes."""
        from pf.sprint.story_finish import _git_cleanup

        with patch("pf.sprint.story_finish._run") as mock_run:
            result = _git_cleanup(Path("/proj"), branch="feat/153-2-x", repo_config=None)

        invoked = [c.args[0] for c in mock_run.call_args_list if c.args]
        assert not any(cmd[:2] == ["git", "checkout"] for cmd in invoked), invoked
        assert not any(cmd[:2] == ["git", "branch"] for cmd in invoked), invoked
        assert result[0]["skipped"] == "root-repo-unresolved"


# ===========================================================================
# AC1/AC3 — sm-setup agent definition reads strategy and records the decision
# ===========================================================================


class TestSmSetupTemplate:
    def test_sm_setup_reads_branch_strategy_via_config(self) -> None:
        """AC1: sm-setup must actually READ branch_strategy from repo config,
        not merely mention the word. Require it to bind branch_strategy from a
        get_repo_config lookup."""
        text = SM_SETUP_MD.read_text(encoding="utf-8")  # raises if file missing
        assert "branch_strategy" in text
        assert "get_repo_config" in text
        # The value must be assigned to a usable shell var, not just named in prose.
        assert "BRANCH_STRATEGY=" in text

    def test_sm_setup_skips_branching_for_trunk_based(self) -> None:
        """AC2/AC3: sm-setup must tie 'trunk-based' to a skip instruction, not
        just contain the word somewhere."""
        text = SM_SETUP_MD.read_text(encoding="utf-8").lower()
        assert "trunk-based" in text
        # 'skip' must appear in proximity to 'trunk-based' (either order),
        # so a description that still branched would not pass.
        assert re.search(r"trunk-based[\s\S]{0,400}skip", text) or re.search(
            r"skip[\s\S]{0,400}trunk-based", text
        ), "sm-setup must instruct skipping branch creation for trunk-based repos"
