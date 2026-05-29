from unittest.mock import patch

from pf.git.repos import RepoConfig
from pf.sprint.repo_map import map_path_to_repo, repos_for_files


def _repos():
    return {
        "orchestrator": RepoConfig(
            name="orchestrator", path=".", repo_type="orchestrator",
            default_branch="main", branch_strategy="trunk-based",
        ),
        "ui": RepoConfig(
            name="ui", path="sidequest-ui", repo_type="ui",
            default_branch="develop", branch_strategy="trunk-based",
        ),
        "server": RepoConfig(
            name="server", path="sidequest-server", repo_type="api",
            default_branch="develop", branch_strategy="trunk-based",
        ),
    }


def test_longest_prefix_wins_over_dot_repo():
    repos = _repos()
    assert map_path_to_repo("sidequest-ui/src/App.tsx", repos) == "ui"
    assert map_path_to_repo("sidequest-server/app.py", repos) == "server"


def test_dot_repo_is_fallback():
    repos = _repos()
    assert map_path_to_repo("docs/notes.md", repos) == "orchestrator"
    assert map_path_to_repo("./justfile", repos) == "orchestrator"


def test_repos_for_files_dedupes_and_preserves_order():
    files = ["sidequest-ui/a.tsx", "sidequest-server/b.py", "sidequest-ui/c.tsx"]
    with patch("pf.sprint.repo_map.load_repos_config", return_value=_repos()):
        result = repos_for_files(files)
    assert result == ["ui", "server"]


def test_repos_for_files_empty_repos_returns_empty():
    with patch("pf.sprint.repo_map.load_repos_config", return_value={}):
        assert repos_for_files(["anything.py"]) == []


def test_repos_for_files_no_match_returns_empty():
    repos_no_dot = {
        "server": RepoConfig(
            name="server", path="sidequest-server", repo_type="api",
            default_branch="develop", branch_strategy="trunk-based",
        ),
    }
    with patch("pf.sprint.repo_map.load_repos_config", return_value=repos_no_dot):
        assert repos_for_files(["docs/readme.md"]) == []


def test_no_repos_returns_none():
    assert map_path_to_repo("anything.py", {}) is None
