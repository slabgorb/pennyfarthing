"""Trunk-based repos must not require a PR on finish preflight (#176)."""

from pathlib import Path

from pf.preflight.finish import _repo_branch_strategy


def test_trunk_based_strategy_from_repos_yaml(tmp_path: Path):
    pf = tmp_path / ".pennyfarthing"
    pf.mkdir()
    (pf / "repos.yaml").write_text(
        "repos:\n  demo:\n    path: .\n    branch_strategy: trunk-based\n",
        encoding="utf-8",
    )
    assert _repo_branch_strategy(tmp_path, "demo") == "trunk-based"


def test_gitflow_strategy_from_repos_yaml(tmp_path: Path):
    pf = tmp_path / ".pennyfarthing"
    pf.mkdir()
    (pf / "repos.yaml").write_text(
        "repos:\n  demo:\n    path: .\n    branch_strategy: gitflow\n",
        encoding="utf-8",
    )
    assert _repo_branch_strategy(tmp_path, "demo") == "gitflow"
