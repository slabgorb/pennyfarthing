"""Tests for demo story type classifier (story 145-2).

Tests validate classify_story() and load_classification_config() against all 8 ACs.
Each AC maps to a test class. Tests are in RED state — stubs raise NotImplementedError.

Run with: python -m pytest tests/python/test_demo_classifier.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path
from typing import Any

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.demo.classifier import classify_story, load_classification_config  # noqa: E402
from pf.demo.models import (  # noqa: E402
    ArtifactType,
    ClassifiedStory,
    SignalBundle,
    StoryType,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_signals(
    *,
    title: str = "Sample story",
    file_extensions: set[str] | None = None,
    story_id: str = "99-1",
    pr_diff: str = "",
    acceptance_criteria: list[str] | None = None,
    commit_messages: list[str] | None = None,
) -> SignalBundle:
    """Create a SignalBundle with sensible defaults for testing."""
    return SignalBundle(
        story_id=story_id,
        title=title,
        jira_key=None,
        points=3,
        acceptance_criteria=acceptance_criteria or [],
        pr_diff=pr_diff,
        commit_messages=commit_messages or [],
        session_fields={},
        review_findings=None,
        file_extensions=file_extensions or set(),
    )


# ---------------------------------------------------------------------------
# AC1: Deterministic rule-based story type detection (5 types)
# ---------------------------------------------------------------------------


class TestClassifyUIStory:
    """AC1: UI stories detected by title keywords or frontend file extensions."""

    def test_title_keyword_ui(self) -> None:
        """Title containing 'UI' classifies as UI."""
        signals = _make_signals(title="Add UI for user profile page")
        result = classify_story(signals)
        assert result["success"] is True
        classified: ClassifiedStory = result["data"]
        assert classified.story_type == StoryType.UI

    def test_title_keyword_screen(self) -> None:
        """Title containing 'screen' classifies as UI."""
        signals = _make_signals(title="New screen for onboarding flow")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_title_keyword_button(self) -> None:
        """Title containing 'button' classifies as UI."""
        signals = _make_signals(title="Add submit button to checkout")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_title_keyword_form(self) -> None:
        """Title containing 'form' classifies as UI."""
        signals = _make_signals(title="Create registration form")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_title_keyword_layout(self) -> None:
        """Title containing 'layout' classifies as UI."""
        signals = _make_signals(title="Redesign dashboard layout")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_file_extension_tsx(self) -> None:
        """Files with .tsx extension classify as UI."""
        signals = _make_signals(
            title="Improve component rendering",
            file_extensions={".tsx", ".ts"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_file_extension_jsx(self) -> None:
        """Files with .jsx extension classify as UI."""
        signals = _make_signals(
            title="Update component",
            file_extensions={".jsx"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_file_extension_css(self) -> None:
        """Files with .css extension classify as UI."""
        signals = _make_signals(
            title="Style improvements",
            file_extensions={".css"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_ui_artifacts(self) -> None:
        """UI stories produce screenshots + slide_deck + demo_script."""
        signals = _make_signals(title="Add new screen for settings")
        result = classify_story(signals)
        assert result["success"] is True
        artifacts = result["data"].artifacts
        assert ArtifactType.UI_SCREENSHOTS in artifacts
        assert ArtifactType.SLIDE_DECK in artifacts
        assert ArtifactType.DEMO_SCRIPT in artifacts


class TestClassifyBackendStory:
    """AC1: Backend stories detected by backend file extensions + title keywords."""

    def test_title_keyword_api(self) -> None:
        """Title containing 'API' classifies as backend."""
        signals = _make_signals(
            title="Add REST API for user management",
            file_extensions={".py"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BACKEND

    def test_title_keyword_endpoint(self) -> None:
        """Title containing 'endpoint' classifies as backend."""
        signals = _make_signals(
            title="Create health check endpoint",
            file_extensions={".rs"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BACKEND

    def test_title_keyword_database(self) -> None:
        """Title containing 'database' classifies as backend."""
        signals = _make_signals(
            title="Migrate database schema",
            file_extensions={".go"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BACKEND

    def test_title_keyword_query(self) -> None:
        """Title containing 'query' classifies as backend."""
        signals = _make_signals(
            title="Optimize query performance",
            file_extensions={".java"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BACKEND

    def test_backend_file_extensions_without_ui_keywords(self) -> None:
        """Backend extensions (.rs, .py, .go, .java) without UI keywords → backend."""
        signals = _make_signals(
            title="Add new endpoint for auth",
            file_extensions={".rs", ".toml"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BACKEND

    def test_backend_artifacts(self) -> None:
        """Backend stories produce mermaid_diagram + narrative + demo_script."""
        signals = _make_signals(
            title="Add API endpoint",
            file_extensions={".py"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        artifacts = result["data"].artifacts
        assert ArtifactType.MERMAID_DIAGRAM in artifacts
        assert ArtifactType.NARRATIVE in artifacts
        assert ArtifactType.DEMO_SCRIPT in artifacts


class TestClassifyInfrastructureStory:
    """AC1: Infrastructure stories detected by infra title keywords."""

    def test_title_keyword_infra(self) -> None:
        """Title containing 'infra' classifies as infrastructure."""
        signals = _make_signals(title="Set up infra for staging environment")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.INFRASTRUCTURE

    def test_title_keyword_deployment(self) -> None:
        """Title containing 'deployment' classifies as infrastructure."""
        signals = _make_signals(title="Automate deployment pipeline")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.INFRASTRUCTURE

    def test_title_keyword_docker(self) -> None:
        """Title containing 'docker' classifies as infrastructure."""
        signals = _make_signals(title="Add docker compose for local dev")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.INFRASTRUCTURE

    def test_title_keyword_cicd(self) -> None:
        """Title containing 'ci/cd' classifies as infrastructure."""
        signals = _make_signals(title="Fix ci/cd pipeline timeout")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.INFRASTRUCTURE

    def test_title_keyword_k8s(self) -> None:
        """Title containing 'k8s' classifies as infrastructure."""
        signals = _make_signals(title="Deploy k8s cluster for prod")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.INFRASTRUCTURE

    def test_infra_artifacts(self) -> None:
        """Infrastructure stories produce mermaid_diagram + narrative + demo_script."""
        signals = _make_signals(title="Set up infra monitoring")
        result = classify_story(signals)
        assert result["success"] is True
        artifacts = result["data"].artifacts
        assert ArtifactType.MERMAID_DIAGRAM in artifacts
        assert ArtifactType.NARRATIVE in artifacts
        assert ArtifactType.DEMO_SCRIPT in artifacts


class TestClassifyRefactorStory:
    """AC1: Refactor stories detected by refactor title keywords."""

    def test_title_keyword_refactor(self) -> None:
        """Title containing 'refactor' classifies as refactor."""
        signals = _make_signals(title="Refactor auth middleware")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.REFACTOR

    def test_title_keyword_cleanup(self) -> None:
        """Title containing 'cleanup' classifies as refactor."""
        signals = _make_signals(title="Code cleanup for unused imports")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.REFACTOR

    def test_title_keyword_tech_debt(self) -> None:
        """Title containing 'tech-debt' classifies as refactor."""
        signals = _make_signals(title="Address tech-debt in payment module")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.REFACTOR

    def test_title_keyword_simplify(self) -> None:
        """Title containing 'simplify' classifies as refactor."""
        signals = _make_signals(title="Simplify user validation logic")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.REFACTOR

    def test_refactor_artifacts(self) -> None:
        """Refactor stories produce before_after_comparison + narrative."""
        signals = _make_signals(title="Refactor data layer")
        result = classify_story(signals)
        assert result["success"] is True
        artifacts = result["data"].artifacts
        assert ArtifactType.BEFORE_AFTER_COMPARISON in artifacts
        assert ArtifactType.NARRATIVE in artifacts


class TestClassifyBugfixStory:
    """AC1: Bug fix stories detected by bugfix title keywords."""

    def test_title_keyword_fix(self) -> None:
        """Title containing 'fix' classifies as bugfix."""
        signals = _make_signals(title="Fix null pointer in checkout")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX

    def test_title_keyword_bug(self) -> None:
        """Title containing 'bug' classifies as bugfix."""
        signals = _make_signals(title="Resolve bug in session handling")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX

    def test_title_keyword_patch(self) -> None:
        """Title containing 'patch' classifies as bugfix."""
        signals = _make_signals(title="Patch security vulnerability")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX

    def test_title_keyword_regression(self) -> None:
        """Title containing 'regression' classifies as bugfix."""
        signals = _make_signals(title="Fix regression in login flow")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX

    def test_bugfix_artifacts(self) -> None:
        """Bug fix stories produce problem_statement + narrative."""
        signals = _make_signals(title="Fix crash on startup")
        result = classify_story(signals)
        assert result["success"] is True
        artifacts = result["data"].artifacts
        assert ArtifactType.PROBLEM_STATEMENT in artifacts
        assert ArtifactType.NARRATIVE in artifacts


# ---------------------------------------------------------------------------
# AC2: Classification consumes SignalBundle from Collector
# ---------------------------------------------------------------------------


class TestClassifyConsumesSignalBundle:
    """AC2: classify_story takes a SignalBundle as input."""

    def test_signals_preserved_in_output(self) -> None:
        """ClassifiedStory.signals is the same SignalBundle passed in."""
        signals = _make_signals(title="Add new screen for profile")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].signals is signals

    def test_uses_file_extensions_from_signals(self) -> None:
        """Classification uses signals.file_extensions for type detection."""
        signals = _make_signals(
            title="Update component styling",
            file_extensions={".tsx", ".css"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_uses_title_from_signals(self) -> None:
        """Classification uses signals.title for keyword matching."""
        signals = _make_signals(title="Refactor payment module")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.REFACTOR


# ---------------------------------------------------------------------------
# AC3: Output ClassifiedStory dataclass with story_type and artifacts
# ---------------------------------------------------------------------------


class TestClassifiedStoryOutput:
    """AC3: Output is a ClassifiedStory with story_type and artifacts list."""

    def test_output_is_classified_story(self) -> None:
        """Result data is a ClassifiedStory instance."""
        signals = _make_signals(title="Fix login bug")
        result = classify_story(signals)
        assert result["success"] is True
        assert isinstance(result["data"], ClassifiedStory)

    def test_story_type_is_enum(self) -> None:
        """story_type field is a StoryType enum value."""
        signals = _make_signals(title="Fix login bug")
        result = classify_story(signals)
        assert result["success"] is True
        assert isinstance(result["data"].story_type, StoryType)

    def test_artifacts_is_list_of_enum(self) -> None:
        """artifacts field is a list of ArtifactType enum values."""
        signals = _make_signals(title="Fix login bug")
        result = classify_story(signals)
        assert result["success"] is True
        assert isinstance(result["data"].artifacts, list)
        for artifact in result["data"].artifacts:
            assert isinstance(artifact, ArtifactType)


# ---------------------------------------------------------------------------
# AC4: Rules — file extension detection, title keyword matching
# ---------------------------------------------------------------------------


class TestRulesPriority:
    """AC4: File extensions and title keywords both used for detection."""

    def test_file_extension_overrides_generic_title(self) -> None:
        """Frontend extensions classify as UI even with non-UI title."""
        signals = _make_signals(
            title="Update component rendering performance",
            file_extensions={".tsx"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI

    def test_title_keyword_case_insensitive(self) -> None:
        """Title keyword matching is case-insensitive."""
        signals = _make_signals(title="REFACTOR the auth middleware")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.REFACTOR

    def test_title_keyword_case_insensitive_mixed(self) -> None:
        """Mixed case title keywords detected."""
        signals = _make_signals(title="Fix Bug in payment processing")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX

    def test_backend_extensions_with_ui_keyword_is_ui(self) -> None:
        """UI keywords take precedence over backend extensions.

        Per the rules: backend = backend extensions AND NOT ui-keywords.
        So if both UI keywords and backend extensions present, classify as UI.
        """
        signals = _make_signals(
            title="Add new screen for user management",
            file_extensions={".py"},
        )
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.UI


# ---------------------------------------------------------------------------
# AC5: Config override (demo.yaml rules evaluated before built-in)
# ---------------------------------------------------------------------------


class TestConfigOverride:
    """AC5: Optional demo.yaml rules override built-in classification."""

    def test_config_override_changes_type(self, tmp_path: Path) -> None:
        """Config rule overrides what would be a backend classification."""
        config_file = tmp_path / "demo.yaml"
        config_file.write_text(
            textwrap.dedent("""\
                classification:
                  rules:
                    - pattern: "streaming.*feature"
                      type: "infrastructure"
                      artifacts: ["mermaid_diagram", "narrative"]
            """)
        )
        signals = _make_signals(
            title="Add streaming data feature",
            file_extensions={".py"},
        )
        result = classify_story(signals, config_path=config_file)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.INFRASTRUCTURE

    def test_config_override_changes_artifacts(self, tmp_path: Path) -> None:
        """Config rule can specify custom artifact list."""
        config_file = tmp_path / "demo.yaml"
        config_file.write_text(
            textwrap.dedent("""\
                classification:
                  rules:
                    - pattern: "custom.*story"
                      type: "backend"
                      artifacts: ["narrative"]
            """)
        )
        signals = _make_signals(title="Custom story for demo")
        result = classify_story(signals, config_path=config_file)
        assert result["success"] is True
        assert result["data"].artifacts == [ArtifactType.NARRATIVE]

    def test_config_rules_evaluated_before_builtin(self, tmp_path: Path) -> None:
        """Config rules take precedence over built-in rules.

        A title matching both a config rule and a built-in rule should
        use the config rule's classification.
        """
        config_file = tmp_path / "demo.yaml"
        config_file.write_text(
            textwrap.dedent("""\
                classification:
                  rules:
                    - pattern: "fix.*auth"
                      type: "backend"
                      artifacts: ["mermaid_diagram", "narrative", "demo_script"]
            """)
        )
        # Without config, "fix" would match bugfix
        signals = _make_signals(title="Fix auth token expiration")
        result = classify_story(signals, config_path=config_file)
        assert result["success"] is True
        # Config says backend, not bugfix
        assert result["data"].story_type == StoryType.BACKEND

    def test_no_config_uses_builtin_rules(self) -> None:
        """Without config_path, built-in rules are used."""
        signals = _make_signals(title="Fix null pointer")
        result = classify_story(signals)
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX

    def test_missing_config_file_uses_builtin_rules(self, tmp_path: Path) -> None:
        """Non-existent config file gracefully falls back to built-in rules."""
        signals = _make_signals(title="Fix null pointer")
        result = classify_story(signals, config_path=tmp_path / "nonexistent.yaml")
        assert result["success"] is True
        assert result["data"].story_type == StoryType.BUGFIX


# ---------------------------------------------------------------------------
# AC6: Ambiguous classifications fail hard
# ---------------------------------------------------------------------------


class TestAmbiguousClassification:
    """AC6: Ambiguous classifications return error, no fallback."""

    def test_ambiguous_title_returns_error(self) -> None:
        """Title matching multiple categories returns error.

        'Refactor API UI' matches refactor, backend (API), and UI keywords.
        """
        signals = _make_signals(title="Refactor API UI components")
        result = classify_story(signals)
        assert result["success"] is False
        assert "error" in result
        assert "ambiguous" in result["error"].lower()

    def test_no_match_returns_error(self) -> None:
        """Title matching no category and no file extensions returns error."""
        signals = _make_signals(
            title="Miscellaneous changes to documentation",
            file_extensions=set(),
        )
        result = classify_story(signals)
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC7: All functions return {success, data?, error?} per ADR-0008
# ---------------------------------------------------------------------------


class TestResultObjects:
    """AC7: All functions return ADR-0008 result objects."""

    def test_classify_story_success_shape(self) -> None:
        """Successful classify_story returns {success: True, data: ClassifiedStory}."""
        signals = _make_signals(title="Fix login crash")
        result = classify_story(signals)
        assert "success" in result
        assert result["success"] is True
        assert "data" in result

    def test_classify_story_error_shape(self) -> None:
        """Failed classify_story returns {success: False, error: str}."""
        signals = _make_signals(title="Refactor API UI components")
        result = classify_story(signals)
        assert "success" in result
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)

    def test_load_config_success_shape(self, tmp_path: Path) -> None:
        """Successful load_classification_config returns {success: True, data: dict}."""
        config_file = tmp_path / "demo.yaml"
        config_file.write_text(
            textwrap.dedent("""\
                classification:
                  rules:
                    - pattern: "test"
                      type: "backend"
                      artifacts: ["narrative"]
            """)
        )
        result = load_classification_config(config_file)
        assert result["success"] is True
        assert "data" in result
        assert isinstance(result["data"], dict)

    def test_load_config_error_shape(self, tmp_path: Path) -> None:
        """Failed load_classification_config returns {success: False, error: str}."""
        result = load_classification_config(tmp_path / "nonexistent.yaml")
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)


# ---------------------------------------------------------------------------
# AC8: No AI/ML — purely deterministic
# ---------------------------------------------------------------------------


class TestDeterminism:
    """AC8: Same input always produces same output."""

    def test_same_input_same_output(self) -> None:
        """Running classify_story twice with identical input gives identical output."""
        signals = _make_signals(
            title="Add new API endpoint for users",
            file_extensions={".py"},
        )
        result1 = classify_story(signals)
        result2 = classify_story(signals)
        assert result1["success"] == result2["success"]
        assert result1["data"].story_type == result2["data"].story_type
        assert result1["data"].artifacts == result2["data"].artifacts

    def test_deterministic_across_many_runs(self) -> None:
        """Classify the same story 10 times — all results identical."""
        signals = _make_signals(title="Refactor auth module")
        results = [classify_story(signals) for _ in range(10)]
        first = results[0]
        for r in results[1:]:
            assert r["success"] == first["success"]
            assert r["data"].story_type == first["data"].story_type
            assert r["data"].artifacts == first["data"].artifacts
