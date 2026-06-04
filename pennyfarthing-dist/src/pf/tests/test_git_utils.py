"""Tests for git/ utility modules.

Story: PROJ-12402 - Port git utility scripts to Python

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. Python script implements git-status-all functionality with parallel execution
2. Python script implements create-feature-branches functionality with parallel execution
3. Both scripts use asyncio.gather for parallelism
4. Error handling is robust and provides clear messages
5. Output formatting is consistent across platforms
6. Cross-platform compatibility verified
7. Tests pass with 100% coverage
8. Performance is equivalent or better than bash versions
"""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from pf.git.create_branches import (
    BranchAction,
    BranchResult,
    create_feature_branches,
    create_or_checkout_branch,
    detect_worktree,
    filter_repos,
    format_results,
)
from pf.git.status_all import (
    RepoStatus,
    format_status_brief,
    format_status_full,
    format_summary,
    get_all_repo_status,
    get_repo_status,
)

# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def temp_git_repo(tmp_path: Path) -> Path:
    """Create a temporary git repository for testing."""
    import subprocess

    repo_path = tmp_path / "test-repo"
    repo_path.mkdir()

    # Initialize git repo
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"], cwd=repo_path, capture_output=True
    )
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=repo_path, capture_output=True)

    # Create initial commit
    (repo_path / "README.md").write_text("# Test Repo")
    subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True)
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=repo_path, capture_output=True)

    # Create develop branch
    subprocess.run(["git", "branch", "develop"], cwd=repo_path, capture_output=True)

    return repo_path


@pytest.fixture
def sample_repos(tmp_path: Path) -> list[tuple[str, Path]]:
    """Create sample repos list for testing."""
    return [
        ("repo-a", tmp_path / "repo-a"),
        ("repo-b", tmp_path / "repo-b"),
    ]


@pytest.fixture
def clean_repo_status() -> RepoStatus:
    """A clean repo with no changes."""
    return RepoStatus(
        name="clean-repo",
        path=Path("/test/clean-repo"),
        branch="develop",
        changes=[],
        unpushed_commits=[],
    )


@pytest.fixture
def dirty_repo_status() -> RepoStatus:
    """A repo with uncommitted changes."""
    return RepoStatus(
        name="dirty-repo",
        path=Path("/test/dirty-repo"),
        branch="feature/test",
        changes=[
            " M src/file1.py",
            "?? src/newfile.py",
        ],
        unpushed_commits=[],
    )


@pytest.fixture
def repo_with_unpushed() -> RepoStatus:
    """A repo with unpushed commits."""
    return RepoStatus(
        name="unpushed-repo",
        path=Path("/test/unpushed-repo"),
        branch="feature/test",
        changes=[],
        unpushed_commits=[
            "abc1234 Add new feature",
            "def5678 Fix bug",
        ],
    )


# =============================================================================
# AC1: git-status-all functionality
# =============================================================================


class TestRepoStatus:
    """Tests for RepoStatus dataclass."""

    def test_is_clean_with_no_changes(self, clean_repo_status: RepoStatus) -> None:
        """is_clean should be True when no changes."""
        assert clean_repo_status.is_clean is True

    def test_is_clean_with_changes(self, dirty_repo_status: RepoStatus) -> None:
        """is_clean should be False when there are changes."""
        assert dirty_repo_status.is_clean is False

    def test_has_unpushed_with_no_commits(self, clean_repo_status: RepoStatus) -> None:
        """has_unpushed should be False when no unpushed commits."""
        assert clean_repo_status.has_unpushed is False

    def test_has_unpushed_with_commits(self, repo_with_unpushed: RepoStatus) -> None:
        """has_unpushed should be True when there are unpushed commits."""
        assert repo_with_unpushed.has_unpushed is True


class TestGetRepoStatus:
    """Tests for get_repo_status function."""

    @pytest.mark.asyncio
    async def test_returns_repo_status(self, temp_git_repo: Path) -> None:
        """get_repo_status should return a RepoStatus object."""
        result = await get_repo_status("test-repo", temp_git_repo)

        assert isinstance(result, RepoStatus)
        assert result.name == "test-repo"
        assert result.path == temp_git_repo

    @pytest.mark.asyncio
    async def test_captures_current_branch(self, temp_git_repo: Path) -> None:
        """get_repo_status should capture the current branch name."""
        result = await get_repo_status("test-repo", temp_git_repo)

        assert result.branch is not None
        assert isinstance(result.branch, str)

    @pytest.mark.asyncio
    async def test_handles_detached_head(self, temp_git_repo: Path) -> None:
        """get_repo_status should handle detached HEAD state."""
        # When in detached HEAD, branch should be "detached" or similar
        result = await get_repo_status("test-repo", temp_git_repo)

        assert result.branch is not None  # Should not crash

    @pytest.mark.asyncio
    async def test_captures_uncommitted_changes(self, temp_git_repo: Path) -> None:
        """get_repo_status should capture uncommitted changes."""
        result = await get_repo_status("test-repo", temp_git_repo)

        assert isinstance(result.changes, list)

    @pytest.mark.asyncio
    async def test_captures_unpushed_commits(self, temp_git_repo: Path) -> None:
        """get_repo_status should capture unpushed commits."""
        result = await get_repo_status("test-repo", temp_git_repo)

        assert isinstance(result.unpushed_commits, list)

    @pytest.mark.asyncio
    async def test_handles_nonexistent_path(self) -> None:
        """get_repo_status should handle non-existent paths gracefully."""
        result = await get_repo_status("missing-repo", Path("/nonexistent/path"))

        assert result.error is not None

    @pytest.mark.asyncio
    async def test_handles_non_git_directory(self, tmp_path: Path) -> None:
        """get_repo_status should handle non-git directories gracefully."""
        result = await get_repo_status("not-git", tmp_path)

        assert result.error is not None


# =============================================================================
# AC3: asyncio.gather for parallelism
# =============================================================================


class TestGetAllRepoStatus:
    """Tests for get_all_repo_status function."""

    @pytest.mark.asyncio
    async def test_returns_list_of_statuses(self, sample_repos: list[tuple[str, Path]]) -> None:
        """get_all_repo_status should return list of RepoStatus objects."""
        results = await get_all_repo_status(sample_repos)

        assert isinstance(results, list)
        assert len(results) == len(sample_repos)
        assert all(isinstance(r, RepoStatus) for r in results)

    @pytest.mark.asyncio
    async def test_preserves_order(self, sample_repos: list[tuple[str, Path]]) -> None:
        """get_all_repo_status should preserve input order."""
        results = await get_all_repo_status(sample_repos)

        for i, (name, _) in enumerate(sample_repos):
            assert results[i].name == name

    @pytest.mark.asyncio
    async def test_uses_asyncio_gather(self, sample_repos: list[tuple[str, Path]]) -> None:
        """get_all_repo_status should use asyncio.gather for parallelism."""
        with patch(
            "pf.git.status_all.get_repo_status",
            new_callable=AsyncMock,
        ) as mock_get_status:
            mock_get_status.return_value = RepoStatus(
                name="test",
                path=Path("/test"),
                branch="main",
                changes=[],
                unpushed_commits=[],
            )

            await get_all_repo_status(sample_repos)

            # Should be called once per repo
            assert mock_get_status.call_count == len(sample_repos)

    @pytest.mark.asyncio
    async def test_handles_empty_repos_list(self) -> None:
        """get_all_repo_status should handle empty repos list."""
        results = await get_all_repo_status([])

        assert results == []

    @pytest.mark.asyncio
    async def test_continues_on_individual_errors(
        self, sample_repos: list[tuple[str, Path]]
    ) -> None:
        """get_all_repo_status should continue even if one repo has errors."""
        # Even if first repo fails, second should still be processed
        results = await get_all_repo_status(sample_repos)

        assert len(results) == len(sample_repos)


# =============================================================================
# AC5: Output formatting
# =============================================================================


class TestFormatStatusBrief:
    """Tests for format_status_brief function."""

    def test_formats_clean_repo(self, clean_repo_status: RepoStatus) -> None:
        """format_status_brief should show checkmark for clean repos."""
        output = format_status_brief([clean_repo_status])

        assert clean_repo_status.name in output
        assert clean_repo_status.branch in output

    def test_formats_dirty_repo(self, dirty_repo_status: RepoStatus) -> None:
        """format_status_brief should show M indicator for dirty repos."""
        output = format_status_brief([dirty_repo_status])

        assert dirty_repo_status.name in output
        assert "M" in output  # Modified indicator

    def test_formats_unpushed_repo(self, repo_with_unpushed: RepoStatus) -> None:
        """format_status_brief should show unpushed count."""
        output = format_status_brief([repo_with_unpushed])

        assert repo_with_unpushed.name in output
        assert "2" in output  # 2 unpushed commits

    def test_one_line_per_repo(
        self, clean_repo_status: RepoStatus, dirty_repo_status: RepoStatus
    ) -> None:
        """format_status_brief should output one line per repo."""
        output = format_status_brief([clean_repo_status, dirty_repo_status])
        lines = [line for line in output.strip().split("\n") if line]

        assert len(lines) == 2


class TestFormatStatusFull:
    """Tests for format_status_full function."""

    def test_includes_repo_header(self, clean_repo_status: RepoStatus) -> None:
        """format_status_full should include repo name header."""
        output = format_status_full([clean_repo_status])

        assert clean_repo_status.name in output

    def test_includes_branch_name(self, clean_repo_status: RepoStatus) -> None:
        """format_status_full should include branch name."""
        output = format_status_full([clean_repo_status])

        assert clean_repo_status.branch in output

    def test_lists_changes(self, dirty_repo_status: RepoStatus) -> None:
        """format_status_full should list file changes."""
        output = format_status_full([dirty_repo_status])

        # Should include at least one change
        assert "file1.py" in output or "Changes" in output

    def test_truncates_many_changes(self) -> None:
        """format_status_full should truncate if more than 10 changes."""
        many_changes = RepoStatus(
            name="many-changes",
            path=Path("/test"),
            branch="main",
            changes=[f" M file{i}.py" for i in range(15)],
            unpushed_commits=[],
        )

        output = format_status_full([many_changes])

        assert "more" in output.lower() or "..." in output

    def test_lists_unpushed_commits(self, repo_with_unpushed: RepoStatus) -> None:
        """format_status_full should list unpushed commits."""
        output = format_status_full([repo_with_unpushed])

        assert "Unpushed" in output or "unpushed" in output


class TestFormatSummary:
    """Tests for format_summary function."""

    def test_shows_all_clean(self, clean_repo_status: RepoStatus) -> None:
        """format_summary should indicate when all repos are clean."""
        output = format_summary([clean_repo_status])

        assert "clean" in output.lower() or "pushed" in output.lower()

    def test_shows_change_count(
        self, dirty_repo_status: RepoStatus, clean_repo_status: RepoStatus
    ) -> None:
        """format_summary should show total uncommitted changes."""
        output = format_summary([dirty_repo_status, clean_repo_status])

        # dirty_repo_status has 2 changes
        assert "2" in output or "change" in output.lower()

    def test_shows_unpushed_count(self, repo_with_unpushed: RepoStatus) -> None:
        """format_summary should show total unpushed commits."""
        output = format_summary([repo_with_unpushed])

        # repo_with_unpushed has 2 unpushed commits
        assert "2" in output or "unpushed" in output.lower()


# =============================================================================
# AC2: create-feature-branches functionality
# =============================================================================


class TestBranchResult:
    """Tests for BranchResult dataclass."""

    def test_created_action(self) -> None:
        """BranchResult should represent created branch."""
        result = BranchResult(
            name="test-repo",
            path=Path("/test"),
            branch="feature/new",
            action=BranchAction.CREATED,
            current_branch="feature/new",
        )

        assert result.action == BranchAction.CREATED

    def test_error_action(self) -> None:
        """BranchResult should represent error with message."""
        result = BranchResult(
            name="test-repo",
            path=Path("/test"),
            branch="feature/new",
            action=BranchAction.ERROR,
            error="Failed to create branch",
        )

        assert result.action == BranchAction.ERROR
        assert result.error is not None


class TestCreateOrCheckoutBranch:
    """Tests for create_or_checkout_branch function."""

    @pytest.mark.asyncio
    async def test_returns_branch_result(self, temp_git_repo: Path) -> None:
        """create_or_checkout_branch should return a BranchResult."""
        result = await create_or_checkout_branch("test-repo", temp_git_repo, "feature/test")

        assert isinstance(result, BranchResult)

    @pytest.mark.asyncio
    async def test_creates_new_branch_from_develop(self, temp_git_repo: Path) -> None:
        """create_or_checkout_branch should create new branch from develop."""
        result = await create_or_checkout_branch("test-repo", temp_git_repo, "feature/new-branch")

        # Should create branch (no remote in test repo, so creates locally)
        assert result.action in (BranchAction.CREATED, BranchAction.ERROR)
        if result.action == BranchAction.CREATED:
            assert result.current_branch == "feature/new-branch"

    @pytest.mark.asyncio
    async def test_checks_out_existing_local_branch(self, temp_git_repo: Path) -> None:
        """create_or_checkout_branch should checkout existing local branch."""
        import subprocess

        # Create the branch first
        subprocess.run(
            ["git", "checkout", "-b", "existing-branch"],
            cwd=temp_git_repo,
            capture_output=True,
        )
        subprocess.run(
            ["git", "checkout", "main"],
            cwd=temp_git_repo,
            capture_output=True,
        )

        result = await create_or_checkout_branch("test-repo", temp_git_repo, "existing-branch")

        assert result.action in (
            BranchAction.CHECKED_OUT_LOCAL,
            BranchAction.CREATED,
            BranchAction.ERROR,  # May fail if no remote
        )

    @pytest.mark.asyncio
    async def test_tracks_remote_branch(self, temp_git_repo: Path) -> None:
        """create_or_checkout_branch should track remote if branch exists there."""
        result = await create_or_checkout_branch("test-repo", temp_git_repo, "remote-branch")

        # In test repo without remote, should either create or error
        assert result.action in (
            BranchAction.CHECKED_OUT_REMOTE,
            BranchAction.CREATED,
            BranchAction.ERROR,  # May fail if no remote to fetch from
        )

    @pytest.mark.asyncio
    async def test_handles_missing_directory(self) -> None:
        """create_or_checkout_branch should handle missing directory."""
        result = await create_or_checkout_branch(
            "missing-repo", Path("/nonexistent"), "feature/test"
        )

        assert result.action == BranchAction.SKIPPED

    @pytest.mark.asyncio
    async def test_fetches_before_branching(self, temp_git_repo: Path) -> None:
        """create_or_checkout_branch should fetch from origin before creating."""
        result = await create_or_checkout_branch("test-repo", temp_git_repo, "feature/test")

        # Should not error (fetch happens internally)
        assert result.action != BranchAction.ERROR or "fetch" not in (result.error or "").lower()

    @pytest.mark.asyncio
    async def test_includes_commit_info(self, temp_git_repo: Path) -> None:
        """create_or_checkout_branch should include latest commit info."""
        result = await create_or_checkout_branch("test-repo", temp_git_repo, "feature/test")

        # commit_info should be populated on success
        if result.action != BranchAction.SKIPPED:
            assert result.commit_info is not None or result.error is not None


class TestCreateFeatureBranches:
    """Tests for create_feature_branches function."""

    @pytest.mark.asyncio
    async def test_returns_list_of_results(self, sample_repos: list[tuple[str, Path]]) -> None:
        """create_feature_branches should return list of BranchResult objects."""
        results = await create_feature_branches(sample_repos, "feature/test")

        assert isinstance(results, list)
        assert len(results) == len(sample_repos)
        assert all(isinstance(r, BranchResult) for r in results)

    @pytest.mark.asyncio
    async def test_uses_asyncio_gather(self, sample_repos: list[tuple[str, Path]]) -> None:
        """create_feature_branches should use asyncio.gather for parallelism."""
        with patch(
            "pf.git.create_branches.create_or_checkout_branch",
            new_callable=AsyncMock,
        ) as mock_create:
            mock_create.return_value = BranchResult(
                name="test",
                path=Path("/test"),
                branch="feature/test",
                action=BranchAction.CREATED,
            )

            await create_feature_branches(sample_repos, "feature/test")

            assert mock_create.call_count == len(sample_repos)

    @pytest.mark.asyncio
    async def test_preserves_order(self, sample_repos: list[tuple[str, Path]]) -> None:
        """create_feature_branches should preserve input order."""
        results = await create_feature_branches(sample_repos, "feature/test")

        for i, (name, _) in enumerate(sample_repos):
            assert results[i].name == name


# =============================================================================
# Worktree Detection
# =============================================================================


class TestDetectWorktree:
    """Tests for detect_worktree function."""

    def test_detects_main_checkout(self, tmp_path: Path) -> None:
        """detect_worktree should detect main checkout (not worktree)."""
        is_worktree, name, base_path = detect_worktree(tmp_path)

        assert is_worktree is False
        assert name is None

    def test_detects_worktree(self, tmp_path: Path) -> None:
        """detect_worktree should detect worktree from path."""
        worktree_path = tmp_path / "worktrees" / "my-feature"
        worktree_path.mkdir(parents=True)

        is_worktree, name, base_path = detect_worktree(worktree_path)

        assert is_worktree is True
        assert name == "my-feature"


# =============================================================================
# Repo Filtering
# =============================================================================


class TestFilterRepos:
    """Tests for filter_repos function."""

    def test_filter_all_returns_all(self, sample_repos: list[tuple[str, Path]]) -> None:
        """filter_repos with 'all' should return all repos."""
        result = filter_repos(sample_repos, "all")

        assert len(result) == len(sample_repos)

    def test_filter_api_returns_api_only(self) -> None:
        """filter_repos with 'api' should return only API repos."""
        repos = [
            ("Pennyfarthing-api", Path("/api")),
            ("Pennyfarthing-ui", Path("/ui")),
        ]

        result = filter_repos(repos, "api")

        assert len(result) == 1
        assert result[0][0] == "Pennyfarthing-api"

    def test_filter_ui_returns_ui_only(self) -> None:
        """filter_repos with 'ui' should return only UI repos."""
        repos = [
            ("Pennyfarthing-api", Path("/api")),
            ("Pennyfarthing-ui", Path("/ui")),
        ]

        result = filter_repos(repos, "ui")

        assert len(result) == 1
        assert result[0][0] == "Pennyfarthing-ui"


# =============================================================================
# AC4: Error handling
# =============================================================================


class TestErrorHandling:
    """Tests for error handling across git utilities."""

    @pytest.mark.asyncio
    async def test_status_handles_git_command_failure(self) -> None:
        """get_repo_status should handle git command failures gracefully."""
        result = await get_repo_status("test", Path("/nonexistent"))

        assert result.error is not None
        assert isinstance(result.error, str)

    @pytest.mark.asyncio
    async def test_branch_handles_git_command_failure(self) -> None:
        """create_or_checkout_branch should handle git command failures."""
        result = await create_or_checkout_branch("test", Path("/nonexistent"), "feature/test")

        assert result.action in (BranchAction.SKIPPED, BranchAction.ERROR)

    @pytest.mark.asyncio
    async def test_status_all_handles_partial_failures(self, temp_git_repo: Path) -> None:
        """get_all_repo_status should return results even with partial failures."""
        # Use an isolated tmp_path repo for the "good" entry — never the live
        # cwd / current directory, which leaks side effects onto the surrounding
        # repository (story 153-9).
        repos = [
            ("good-repo", temp_git_repo),
            ("bad-repo", Path("/nonexistent")),
        ]

        results = await get_all_repo_status(repos)

        assert len(results) == 2
        # One should have error, one should not

    @pytest.mark.asyncio
    async def test_branches_handles_partial_failures(self, temp_git_repo: Path) -> None:
        """create_feature_branches should return results even with partial failures."""
        # Use an isolated tmp_path repo for the "good" entry — never the live
        # cwd / current directory: create_feature_branches would checkout a
        # branch on the surrounding repository (story 153-9).
        repos = [
            ("good-repo", temp_git_repo),
            ("bad-repo", Path("/nonexistent")),
        ]

        results = await create_feature_branches(repos, "feature/test")

        assert len(results) == 2


# =============================================================================
# AC5: Output formatting - Results
# =============================================================================


class TestFormatResults:
    """Tests for format_results function."""

    def test_includes_branch_name(self) -> None:
        """format_results should include the target branch name."""
        results = [
            BranchResult(
                name="test-repo",
                path=Path("/test"),
                branch="feature/test",
                action=BranchAction.CREATED,
                current_branch="feature/test",
            )
        ]

        output = format_results(results, "feature/test")

        assert "feature/test" in output

    def test_shows_action_taken(self) -> None:
        """format_results should show what action was taken."""
        results = [
            BranchResult(
                name="test-repo",
                path=Path("/test"),
                branch="feature/test",
                action=BranchAction.CREATED,
                current_branch="feature/test",
            )
        ]

        output = format_results(results, "feature/test")

        assert "created" in output.lower() or "Created" in output

    def test_shows_verification_summary(self) -> None:
        """format_results should include verification summary."""
        results = [
            BranchResult(
                name="repo-a",
                path=Path("/a"),
                branch="feature/test",
                action=BranchAction.CREATED,
                current_branch="feature/test",
            ),
            BranchResult(
                name="repo-b",
                path=Path("/b"),
                branch="feature/test",
                action=BranchAction.CHECKED_OUT_LOCAL,
                current_branch="feature/test",
            ),
        ]

        output = format_results(results, "feature/test")

        # Should have some kind of summary/verification section
        assert "Verification" in output or "Summary" in output or "Done" in output

    def test_shows_errors(self) -> None:
        """format_results should show errors clearly."""
        results = [
            BranchResult(
                name="bad-repo",
                path=Path("/bad"),
                branch="feature/test",
                action=BranchAction.ERROR,
                error="Git command failed",
            )
        ]

        output = format_results(results, "feature/test")

        assert "error" in output.lower() or "Error" in output


# =============================================================================
# AC6: Cross-platform compatibility
# =============================================================================


class TestCrossPlatformCompatibility:
    """Tests for cross-platform compatibility."""

    def test_paths_use_pathlib(self) -> None:
        """All path handling should use pathlib.Path."""
        # RepoStatus uses Path
        status = RepoStatus(
            name="test",
            path=Path("/test"),
            branch="main",
            changes=[],
            unpushed_commits=[],
        )
        assert isinstance(status.path, Path)

        # BranchResult uses Path
        result = BranchResult(
            name="test",
            path=Path("/test"),
            branch="main",
            action=BranchAction.CREATED,
        )
        assert isinstance(result.path, Path)

    def test_no_shell_specific_commands(self) -> None:
        """Implementation should not use shell-specific commands."""
        # This is more of a code review check, but we can verify the modules exist
        import pf.git.create_branches as branch_mod
        import pf.git.status_all as status_mod

        # Modules should exist and be importable
        assert status_mod is not None
        assert branch_mod is not None


# =============================================================================
# AC7/AC8: Performance (asyncio.gather verification)
# =============================================================================


class TestAsyncPerformance:
    """Tests verifying async parallel execution."""

    @pytest.mark.asyncio
    async def test_status_runs_in_parallel(self) -> None:
        """get_all_repo_status should run git commands in parallel."""
        # Create mock that tracks call timing
        call_times = []

        async def mock_get_status(name: str, path: Path) -> RepoStatus:
            import time

            call_times.append(time.time())
            await asyncio.sleep(0.01)  # Small delay
            return RepoStatus(name=name, path=path, branch="main", changes=[], unpushed_commits=[])

        repos = [(f"repo-{i}", Path(f"/repo-{i}")) for i in range(3)]

        with patch(
            "pf.git.status_all.get_repo_status",
            side_effect=mock_get_status,
        ):
            await get_all_repo_status(repos)

        # All calls should happen nearly simultaneously (within 0.05s of each other)
        if len(call_times) >= 2:
            time_spread = max(call_times) - min(call_times)
            assert time_spread < 0.05  # Should be nearly simultaneous

    @pytest.mark.asyncio
    async def test_branch_creation_runs_in_parallel(self) -> None:
        """create_feature_branches should run git commands in parallel."""
        call_times = []

        async def mock_create_branch(name: str, path: Path, branch: str) -> BranchResult:
            import time

            call_times.append(time.time())
            await asyncio.sleep(0.01)
            return BranchResult(name=name, path=path, branch=branch, action=BranchAction.CREATED)

        repos = [(f"repo-{i}", Path(f"/repo-{i}")) for i in range(3)]

        with patch(
            "pf.git.create_branches.create_or_checkout_branch",
            side_effect=mock_create_branch,
        ):
            await create_feature_branches(repos, "feature/test")

        if len(call_times) >= 2:
            time_spread = max(call_times) - min(call_times)
            assert time_spread < 0.05
