"""
Tests for pf.hotspots module.

Covers git log parsing, bug-fix detection, scoring, aggregation, formatters, and CLI.
"""

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from click.testing import CliRunner
from pf.hotspots.analyze import (
    _aggregate_by_directory,
    _parse_git_log,
    _should_exclude,
    analyze_all_repos,
    analyze_repo,
    calculate_hotspot_score,
    is_bug_fix_commit,
)
from pf.hotspots.cli import hotspots
from pf.hotspots.formatters import (
    export_csv,
    export_json,
    format_dir_table,
    format_file_table,
)
from pf.hotspots.models import (
    DirectoryHotspot,
    FileHotspot,
    HotspotResult,
    MultiRepoHotspotResult,
)

# =============================================================================
# Fixtures
# =============================================================================

SAMPLE_GIT_LOG = """COMMIT:abc123|Alice|2025-12-01T10:00:00+00:00|fix: resolve login bug
5\t2\tsrc/auth/login.ts
10\t0\tsrc/auth/session.ts
COMMIT:def456|Bob|2025-12-05T14:00:00+00:00|feat: add user dashboard
20\t3\tsrc/dashboard/index.ts
1\t1\tsrc/utils/helpers.ts
COMMIT:ghi789|Alice|2025-12-10T09:00:00+00:00|fix: patch regression in auth
3\t1\tsrc/auth/login.ts
-\t-\tsrc/assets/logo.png"""


EMPTY_GIT_LOG = ""


BINARY_ONLY_LOG = """COMMIT:aaa111|Alice|2025-12-01T10:00:00+00:00|chore: update images
-\t-\tassets/hero.png
-\t-\tassets/icon.svg"""


# =============================================================================
# _parse_git_log tests
# =============================================================================

class TestParseGitLog:
    def test_parses_commits(self):
        commits = _parse_git_log(SAMPLE_GIT_LOG)
        assert len(commits) == 3

    def test_commit_fields(self):
        commits = _parse_git_log(SAMPLE_GIT_LOG)
        first = commits[0]
        assert first["hash"] == "abc123"
        assert first["author"] == "Alice"
        assert first["date"] == "2025-12-01T10:00:00+00:00"
        assert first["message"] == "fix: resolve login bug"

    def test_file_counts(self):
        commits = _parse_git_log(SAMPLE_GIT_LOG)
        assert len(commits[0]["files"]) == 2
        assert len(commits[1]["files"]) == 2
        assert len(commits[2]["files"]) == 2

    def test_numstat_values(self):
        commits = _parse_git_log(SAMPLE_GIT_LOG)
        login_file = commits[0]["files"][0]
        assert login_file["path"] == "src/auth/login.ts"
        assert login_file["added"] == 5
        assert login_file["deleted"] == 2

    def test_binary_files_have_zero_counts(self):
        commits = _parse_git_log(SAMPLE_GIT_LOG)
        binary_file = commits[2]["files"][1]
        assert binary_file["path"] == "src/assets/logo.png"
        assert binary_file["added"] == 0
        assert binary_file["deleted"] == 0

    def test_empty_log_returns_empty_list(self):
        assert _parse_git_log("") == []
        assert _parse_git_log("   \n  ") == []

    def test_binary_only_commits(self):
        commits = _parse_git_log(BINARY_ONLY_LOG)
        assert len(commits) == 1
        assert len(commits[0]["files"]) == 2
        assert all(f["added"] == 0 for f in commits[0]["files"])


# =============================================================================
# is_bug_fix_commit tests
# =============================================================================

class TestIsBugFixCommit:
    @pytest.mark.parametrize("message", [
        "fix: resolve login bug",
        "Fix the broken test",
        "bug: incorrect value",
        "patch: security update",
        "hotfix: urgent production issue",
        "fix(auth): regression in token refresh",
        "resolve issue #123",
        "resolved merge conflict",
    ])
    def test_positive_matches(self, message):
        assert is_bug_fix_commit(message) is True

    @pytest.mark.parametrize("message", [
        "feat: add new feature",
        "chore: update dependencies",
        "refactor: clean up code",
        "docs: update README",
        "style: format code",
        "test: add unit tests",
        "perf: optimize query",
    ])
    def test_negative_matches(self, message):
        assert is_bug_fix_commit(message) is False


# =============================================================================
# calculate_hotspot_score tests
# =============================================================================

class TestCalculateHotspotScore:
    def test_max_score_for_max_values(self):
        score = calculate_hotspot_score(
            change_count=10, bug_fix_count=5, author_count=3,
            churn=1000, age_days=0,
            max_changes=10, max_bugs=5, max_authors=3,
            max_churn=1000, window_days=90,
        )
        assert score == 100.0

    def test_zero_score_for_zero_values(self):
        score = calculate_hotspot_score(
            change_count=0, bug_fix_count=0, author_count=0,
            churn=0, age_days=90,
            max_changes=10, max_bugs=5, max_authors=3,
            max_churn=1000, window_days=90,
        )
        assert score == 0.0

    def test_score_in_range(self):
        score = calculate_hotspot_score(
            change_count=5, bug_fix_count=2, author_count=2,
            churn=500, age_days=30,
            max_changes=10, max_bugs=5, max_authors=3,
            max_churn=1000, window_days=90,
        )
        assert 0.0 <= score <= 100.0

    def test_higher_bug_fixes_higher_score(self):
        low = calculate_hotspot_score(
            change_count=5, bug_fix_count=1, author_count=2,
            churn=100, age_days=10,
            max_changes=10, max_bugs=10, max_authors=5,
            max_churn=500, window_days=90,
        )
        high = calculate_hotspot_score(
            change_count=5, bug_fix_count=8, author_count=2,
            churn=100, age_days=10,
            max_changes=10, max_bugs=10, max_authors=5,
            max_churn=500, window_days=90,
        )
        assert high > low

    def test_recency_effect(self):
        recent = calculate_hotspot_score(
            change_count=5, bug_fix_count=2, author_count=2,
            churn=100, age_days=1,
            max_changes=10, max_bugs=5, max_authors=5,
            max_churn=500, window_days=90,
        )
        old = calculate_hotspot_score(
            change_count=5, bug_fix_count=2, author_count=2,
            churn=100, age_days=85,
            max_changes=10, max_bugs=5, max_authors=5,
            max_churn=500, window_days=90,
        )
        assert recent > old


# =============================================================================
# _should_exclude tests
# =============================================================================

class TestShouldExclude:
    def test_glob_match(self):
        assert _should_exclude("node_modules/foo/bar.js", ["node_modules/*"])
        assert _should_exclude("dist/index.js", ["dist/*"])

    def test_basename_match(self):
        assert _should_exclude("some/path/pnpm-lock.yaml", ["pnpm-lock.yaml"])
        assert _should_exclude("deep/dir/foo.min.js", ["*.min.js"])

    def test_no_match(self):
        assert not _should_exclude("src/app.ts", ["node_modules/*", "dist/*"])


# =============================================================================
# _aggregate_by_directory tests
# =============================================================================

class TestAggregateByDirectory:
    def test_groups_by_parent(self):
        hotspots = [
            FileHotspot(path="src/auth/login.ts", change_count=10, bug_fix_count=3, author_count=2, hotspot_score=80.0),
            FileHotspot(path="src/auth/session.ts", change_count=5, bug_fix_count=1, author_count=1, hotspot_score=40.0),
            FileHotspot(path="src/dashboard/index.ts", change_count=3, bug_fix_count=0, author_count=1, hotspot_score=20.0),
        ]
        dirs = _aggregate_by_directory(hotspots)
        assert len(dirs) == 2

        auth_dir = next(d for d in dirs if d.path == "src/auth")
        assert auth_dir.file_count == 2
        assert auth_dir.total_changes == 15
        assert auth_dir.total_bug_fixes == 4

    def test_sorted_by_score_desc(self):
        hotspots = [
            FileHotspot(path="low/a.ts", hotspot_score=10.0),
            FileHotspot(path="high/b.ts", hotspot_score=90.0),
        ]
        dirs = _aggregate_by_directory(hotspots)
        assert dirs[0].hotspot_score >= dirs[1].hotspot_score

    def test_root_files(self):
        hotspots = [FileHotspot(path="README.md", hotspot_score=5.0)]
        dirs = _aggregate_by_directory(hotspots)
        assert dirs[0].path == "/"


# =============================================================================
# analyze_repo tests
# =============================================================================

class TestAnalyzeRepo:
    def test_nonexistent_path(self):
        result = asyncio.run(analyze_repo("test", Path("/nonexistent/path"), 90))
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_successful_analysis(self):
        with patch(
            "pf.hotspots.analyze._run_git_log",
            new_callable=AsyncMock,
            return_value=(SAMPLE_GIT_LOG, "", 0),
        ):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 90))
            assert result.success is True
            assert result.commit_count == 3
            assert len(result.file_hotspots) > 0
            assert len(result.directory_hotspots) > 0

    def test_git_failure(self):
        with patch(
            "pf.hotspots.analyze._run_git_log",
            new_callable=AsyncMock,
            return_value=("", "fatal: not a git repository", 128),
        ):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 90))
            assert result.success is False
            assert "git log failed" in result.error

    def test_empty_history(self):
        with patch(
            "pf.hotspots.analyze._run_git_log",
            new_callable=AsyncMock,
            return_value=("", "", 0),
        ):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 90))
            assert result.success is True
            assert result.commit_count == 0

    def test_excludes_patterns(self):
        log_with_lock = """COMMIT:abc|Alice|2025-12-01T10:00:00+00:00|chore: update deps
100\t50\tpnpm-lock.yaml
5\t2\tsrc/app.ts"""
        with patch(
            "pf.hotspots.analyze._run_git_log",
            new_callable=AsyncMock,
            return_value=(log_with_lock, "", 0),
        ):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 90))
            paths = [h.path for h in result.file_hotspots]
            assert "pnpm-lock.yaml" not in paths
            assert "src/app.ts" in paths


# =============================================================================
# Formatter tests
# =============================================================================

class TestFormatters:
    def test_format_file_table_with_data(self):
        hotspots = [
            FileHotspot(path="src/app.ts", change_count=10, bug_fix_count=3,
                       author_count=2, churn=500, hotspot_score=75.0),
        ]
        table = format_file_table(hotspots)
        assert "Score" in table
        assert "src/app.ts" in table
        assert "75.0" in table

    def test_format_file_table_empty(self):
        table = format_file_table([])
        assert "No file hotspots" in table

    def test_format_dir_table_with_data(self):
        dirs = [
            DirectoryHotspot(path="src/auth", file_count=3, total_changes=15,
                           total_bug_fixes=4, avg_author_count=2.0, hotspot_score=60.0),
        ]
        table = format_dir_table(dirs)
        assert "src/auth" in table
        assert "60.0" in table

    def test_format_dir_table_empty(self):
        table = format_dir_table([])
        assert "No directory hotspots" in table

    def test_export_json(self):
        result = HotspotResult(
            success=True, repo_name="test", repo_path="/tmp",
            time_window_days=90, commit_count=5,
        )
        output = export_json(result)
        data = json.loads(output)
        assert data["success"] is True
        assert data["repo_name"] == "test"

    def test_export_csv(self):
        hotspots = [
            FileHotspot(path="src/app.ts", change_count=10, bug_fix_count=3,
                       author_count=2, lines_added=100, lines_deleted=20,
                       churn=120, last_changed="2025-12-01", hotspot_score=75.0),
        ]
        csv_output = export_csv(hotspots)
        assert "path,change_count" in csv_output
        assert "src/app.ts" in csv_output

    def test_top_n_limits(self):
        hotspots = [
            FileHotspot(path=f"file{i}.ts", hotspot_score=float(i))
            for i in range(30)
        ]
        table = format_file_table(hotspots, top_n=5)
        # Should only show 5 data rows + header + separator
        lines = [l for l in table.split("\n") if l.strip()]  # noqa: E741
        assert len(lines) == 7  # header + separator + 5 data


# =============================================================================
# CLI tests
# =============================================================================

class TestCLI:
    def test_help(self):
        runner = CliRunner()
        result = runner.invoke(hotspots, ["--help"])
        assert result.exit_code == 0
        assert "analyze" in result.output
        assert "files" in result.output
        assert "dirs" in result.output

    def test_analyze_help(self):
        runner = CliRunner()
        result = runner.invoke(hotspots, ["analyze", "--help"])
        assert result.exit_code == 0
        assert "--days" in result.output
        assert "--format" in result.output
        assert "--repo" in result.output

    def test_analyze_json_format(self):
        mock_result = HotspotResult(
            success=True, repo_name="test", repo_path="/tmp",
            time_window_days=90, commit_count=1,
            file_hotspots=[
                FileHotspot(path="app.ts", change_count=1, hotspot_score=50.0),
            ],
        )
        with patch(
            "pf.hotspots.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(hotspots, ["analyze", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["success"] is True


# =============================================================================
# analyze_all_repos skip_types filtering tests (Story 79-4)
# =============================================================================

# Mock repos.yaml with type fields
REPOS_YAML_WITH_TYPES = {
    "orchestrator": {
        "path": ".",
        "type": "orchestrator",
    },
    "pennyfarthing": {
        "path": "pennyfarthing",
        "type": "framework",
    },
    "docs-site": {
        "path": "docs",
        "type": "docs",
    },
}


class TestAnalyzeAllReposSkipTypes:
    """Tests for skip_types parameter on analyze_all_repos (Story 79-4).

    The skip_types parameter should filter repos by their 'type' field
    in repos.yaml before analysis begins.
    """

    def test_skip_types_parameter_exists(self):
        """analyze_all_repos() must accept a skip_types parameter."""
        import inspect
        sig = inspect.signature(analyze_all_repos)
        assert "skip_types" in sig.parameters, (
            "analyze_all_repos() must accept a 'skip_types' parameter"
        )

    def test_skip_orchestrator_excludes_orchestrator_repo(self):
        """Passing skip_types=['orchestrator'] should exclude repos with type 'orchestrator'."""
        with patch(
            "pf.common.config.load_yaml_config",
            return_value=REPOS_YAML_WITH_TYPES,
        ), patch(
            "pathlib.Path.exists", return_value=True,
        ), patch(
            "pf.hotspots.analyze.analyze_repo",
            new_callable=AsyncMock,
            return_value=HotspotResult(
                success=True, repo_name="pennyfarthing", repo_path="/tmp/pennyfarthing",
                time_window_days=90, commit_count=1,
            ),
        ) as mock_analyze:
            result = asyncio.run(
                analyze_all_repos(Path("/tmp"), days=90, skip_types=["orchestrator"])
            )
            assert result.success is True
            # Should NOT have analyzed the orchestrator repo
            analyzed_names = [call.args[0] for call in mock_analyze.call_args_list]
            assert "orchestrator" not in analyzed_names
            # Should have analyzed non-orchestrator repos
            assert "pennyfarthing" in analyzed_names

    def test_skip_multiple_types(self):
        """Passing multiple skip_types should exclude all matching repos."""
        with patch(
            "pf.common.config.load_yaml_config",
            return_value=REPOS_YAML_WITH_TYPES,
        ), patch(
            "pathlib.Path.exists", return_value=True,
        ), patch(
            "pf.hotspots.analyze.analyze_repo",
            new_callable=AsyncMock,
            return_value=HotspotResult(
                success=True, repo_name="pennyfarthing", repo_path="/tmp/pennyfarthing",
                time_window_days=90, commit_count=1,
            ),
        ) as mock_analyze:
            result = asyncio.run(
                analyze_all_repos(Path("/tmp"), days=90, skip_types=["orchestrator", "docs"])
            )
            assert result.success is True
            analyzed_names = [call.args[0] for call in mock_analyze.call_args_list]
            assert "orchestrator" not in analyzed_names
            assert "docs-site" not in analyzed_names
            assert "pennyfarthing" in analyzed_names

    def test_no_skip_types_analyzes_all_repos(self):
        """When skip_types is None, all repos should be analyzed (backward compatible)."""
        with patch(
            "pf.common.config.load_yaml_config",
            return_value=REPOS_YAML_WITH_TYPES,
        ), patch(
            "pathlib.Path.exists", return_value=True,
        ), patch(
            "pf.hotspots.analyze.analyze_repo",
            new_callable=AsyncMock,
            return_value=HotspotResult(
                success=True, repo_name="test", repo_path="/tmp/test",
                time_window_days=90, commit_count=1,
            ),
        ) as mock_analyze:
            result = asyncio.run(
                analyze_all_repos(Path("/tmp"), days=90, skip_types=None)
            )
            assert result.success is True
            assert mock_analyze.call_count == 3  # all 3 repos

    def test_empty_skip_types_analyzes_all_repos(self):
        """Empty skip_types list should analyze all repos (same as None)."""
        with patch(
            "pf.common.config.load_yaml_config",
            return_value=REPOS_YAML_WITH_TYPES,
        ), patch(
            "pathlib.Path.exists", return_value=True,
        ), patch(
            "pf.hotspots.analyze.analyze_repo",
            new_callable=AsyncMock,
            return_value=HotspotResult(
                success=True, repo_name="test", repo_path="/tmp/test",
                time_window_days=90, commit_count=1,
            ),
        ) as mock_analyze:
            result = asyncio.run(
                analyze_all_repos(Path("/tmp"), days=90, skip_types=[])
            )
            assert result.success is True
            assert mock_analyze.call_count == 3

    def test_skip_all_types_returns_error(self):
        """If skip_types filters out ALL repos, should return error result."""
        with patch(
            "pf.common.config.load_yaml_config",
            return_value=REPOS_YAML_WITH_TYPES,
        ), patch(
            "pathlib.Path.exists", return_value=True,
        ):
            result = asyncio.run(
                analyze_all_repos(
                    Path("/tmp"), days=90,
                    skip_types=["orchestrator", "framework", "docs"],
                )
            )
            assert result.success is False
            assert "no git repositories" in result.error.lower()

    def test_skip_types_with_missing_type_field(self):
        """Repos without a 'type' field should NOT be skipped."""
        repos_yaml = {
            "orchestrator": {"path": ".", "type": "orchestrator"},
            "legacy": {"path": "legacy"},  # no type field
        }
        with patch(
            "pf.common.config.load_yaml_config",
            return_value=repos_yaml,
        ), patch(
            "pathlib.Path.exists", return_value=True,
        ), patch(
            "pf.hotspots.analyze.analyze_repo",
            new_callable=AsyncMock,
            return_value=HotspotResult(
                success=True, repo_name="legacy", repo_path="/tmp/legacy",
                time_window_days=90, commit_count=1,
            ),
        ) as mock_analyze:
            result = asyncio.run(
                analyze_all_repos(Path("/tmp"), days=90, skip_types=["orchestrator"])
            )
            assert result.success is True
            analyzed_names = [call.args[0] for call in mock_analyze.call_args_list]
            assert "legacy" in analyzed_names
            assert "orchestrator" not in analyzed_names


# =============================================================================
# CLI --skip-type option tests (Story 79-4)
# =============================================================================

class TestCLISkipType:
    """Tests for --skip-type CLI option (Story 79-4)."""

    def test_skip_type_appears_in_help(self):
        """The --skip-type option should appear in analyze --help output."""
        runner = CliRunner()
        result = runner.invoke(hotspots, ["analyze", "--help"])
        assert result.exit_code == 0
        assert "--skip-type" in result.output

    def test_skip_type_is_repeatable(self):
        """--skip-type should accept multiple values."""
        mock_result = MultiRepoHotspotResult(success=True, repo_results=[])
        with patch(
            "pf.hotspots.cli._run_analysis",
            return_value=mock_result,
        ) as mock_run:
            runner = CliRunner()
            result = runner.invoke(hotspots, [
                "analyze", "--format", "json",
                "--skip-type", "orchestrator",
                "--skip-type", "docs",
            ])
            assert result.exit_code == 0
            # Verify skip_type was passed to _run_analysis
            call_kwargs = mock_run.call_args
            # _run_analysis should receive skip_type as a tuple of values
            assert "orchestrator" in str(call_kwargs)
            assert "docs" in str(call_kwargs)

    def test_skip_type_passed_to_analyze_all_repos(self):
        """--skip-type values should flow through to analyze_all_repos."""
        with patch(
            "pf.common.config.get_project_root",
            return_value=Path("/tmp"),
        ), patch(
            "pf.hotspots.analyze.analyze_all_repos",
            new_callable=AsyncMock,
            return_value=MultiRepoHotspotResult(success=True, repo_results=[]),
        ) as mock_all:
            runner = CliRunner()
            result = runner.invoke(hotspots, [
                "analyze", "--format", "json",
                "--skip-type", "orchestrator",
            ])
            assert result.exit_code == 0
            # analyze_all_repos should have been called with skip_types
            mock_all.assert_called_once()
            call_kwargs = mock_all.call_args
            assert "orchestrator" in str(call_kwargs)


# =============================================================================
# Expanded DEFAULT_EXCLUDES tests (Story 79-5)
# =============================================================================

class TestExpandedDefaultExcludes:
    """Tests for expanded DEFAULT_EXCLUDES patterns (Story 79-5).

    DEFAULT_EXCLUDES should filter dotfiles, images, fonts, generated files,
    and CI config in addition to the existing patterns.
    """

    def test_dotfiles_excluded(self):
        """Dotfiles (.*) should be excluded by default."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude(".gitignore", DEFAULT_EXCLUDES)
        assert _should_exclude(".eslintrc", DEFAULT_EXCLUDES)
        assert _should_exclude("some/path/.env", DEFAULT_EXCLUDES)
        assert _should_exclude(".prettierrc", DEFAULT_EXCLUDES)

    def test_images_excluded(self):
        """Image files (*.png, *.jpg, *.gif, *.svg, *.ico) should be excluded."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude("assets/logo.png", DEFAULT_EXCLUDES)
        assert _should_exclude("src/images/hero.jpg", DEFAULT_EXCLUDES)
        assert _should_exclude("icons/spinner.gif", DEFAULT_EXCLUDES)
        assert _should_exclude("public/icon.svg", DEFAULT_EXCLUDES)
        assert _should_exclude("favicon.ico", DEFAULT_EXCLUDES)
        assert _should_exclude("deep/nested/photo.jpeg", DEFAULT_EXCLUDES)

    def test_fonts_excluded(self):
        """Font files (*.woff, *.woff2, *.ttf, *.eot) should be excluded."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude("fonts/Inter.woff", DEFAULT_EXCLUDES)
        assert _should_exclude("fonts/Inter.woff2", DEFAULT_EXCLUDES)
        assert _should_exclude("assets/font.ttf", DEFAULT_EXCLUDES)
        assert _should_exclude("assets/font.eot", DEFAULT_EXCLUDES)

    def test_generated_files_excluded(self):
        """Generated files (*.d.ts, *.snap, *.d.ts.map) should be excluded."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude("dist/types/index.d.ts", DEFAULT_EXCLUDES)
        assert _should_exclude("src/__snapshots__/App.test.tsx.snap", DEFAULT_EXCLUDES)
        assert _should_exclude("types/model.d.ts.map", DEFAULT_EXCLUDES)

    def test_ci_config_excluded(self):
        """CI config (.github/*) should be excluded."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude(".github/workflows/ci.yml", DEFAULT_EXCLUDES)
        assert _should_exclude(".github/dependabot.yml", DEFAULT_EXCLUDES)
        assert _should_exclude(".github/CODEOWNERS", DEFAULT_EXCLUDES)

    def test_source_files_not_excluded(self):
        """Regular source files should NOT be excluded by expanded patterns."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert not _should_exclude("src/app.ts", DEFAULT_EXCLUDES)
        assert not _should_exclude("src/components/Button.tsx", DEFAULT_EXCLUDES)
        assert not _should_exclude("lib/utils.py", DEFAULT_EXCLUDES)
        assert not _should_exclude("src/styles/main.css", DEFAULT_EXCLUDES)

    def test_documentation_files_excluded(self):
        """Documentation files (*.md) are excluded server-side as non-code hotspots."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude("README.md", DEFAULT_EXCLUDES)
        assert _should_exclude("CLAUDE.md", DEFAULT_EXCLUDES)
        assert _should_exclude("CHANGELOG.md", DEFAULT_EXCLUDES)
        assert _should_exclude("docs/guide.md", DEFAULT_EXCLUDES)

    def test_config_manifest_files_excluded(self):
        """Config/manifest files are excluded server-side as high-churn non-code signals."""
        from pf.hotspots.analyze import DEFAULT_EXCLUDES
        assert _should_exclude("tsconfig.json", DEFAULT_EXCLUDES)
        assert _should_exclude("package.json", DEFAULT_EXCLUDES)
        assert _should_exclude("config/settings.yaml", DEFAULT_EXCLUDES)
        assert _should_exclude("workflow.yml", DEFAULT_EXCLUDES)
        # .toml not in default excludes
        assert not _should_exclude("pyproject.toml", DEFAULT_EXCLUDES)

    def test_expanded_excludes_in_analyze_repo(self):
        """analyze_repo should exclude expanded patterns from results."""
        log_with_artifacts = """COMMIT:abc|Alice|2025-12-01T10:00:00+00:00|feat: add feature
5\t2\tsrc/app.ts
3\t1\t.github/workflows/ci.yml
1\t0\tassets/logo.png
10\t0\ttypes/index.d.ts
2\t1\tfonts/Inter.woff2
4\t2\t.eslintrc"""
        with patch(
            "pf.hotspots.analyze._run_git_log",
            new_callable=AsyncMock,
            return_value=(log_with_artifacts, "", 0),
        ):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 90))
            paths = [h.path for h in result.file_hotspots]
            assert "src/app.ts" in paths
            assert ".github/workflows/ci.yml" not in paths
            assert "assets/logo.png" not in paths
            assert "types/index.d.ts" not in paths
            assert "fonts/Inter.woff2" not in paths
            assert ".eslintrc" not in paths
