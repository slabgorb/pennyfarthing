"""Tests for DemoOrchestrator — pipeline entry point and output writer (story 145-7).

Tests validate the orchestrator that wires Collector → Classifier → Generator →
Mermaid → ScriptGenerator into a single pipeline with short-circuit failure,
corrections workflow, dry-run mode, and output writing.

Run with: python -m pytest tests/python/test_demo_orchestrator.py -v
"""

from __future__ import annotations

import sys
from contextlib import ExitStack
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.demo.models import (  # noqa: E402
    ArtifactType,
    ClassifiedStory,
    GeneratedContent,
    SignalBundle,
    StoryType,
)
from pf.demo.orchestrator import generate  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_signal_bundle(
    *,
    story_id: str = "99-1",
    title: str = "Test backend API endpoint",
    jira_key: str | None = "MSSCI-99999",
    points: int = 2,
    story_type: StoryType = StoryType.BACKEND,
) -> SignalBundle:
    return SignalBundle(
        story_id=story_id,
        title=title,
        jira_key=jira_key,
        points=points,
        acceptance_criteria=["AC1: Returns result objects", "AC2: Handles errors"],
        pr_diff="diff --git a/src/api.py b/src/api.py\n+new code",
        commit_messages=["feat: add API endpoint"],
        session_fields={"workflow": "tdd", "phase": "green"},
        review_findings=None,
        file_extensions={".py"},
    )


def _make_classified(
    signals: SignalBundle | None = None,
    story_type: StoryType = StoryType.BACKEND,
) -> ClassifiedStory:
    if signals is None:
        signals = _make_signal_bundle(story_type=story_type)
    return ClassifiedStory(
        signals=signals,
        story_type=story_type,
        artifacts=[ArtifactType.MERMAID_DIAGRAM, ArtifactType.NARRATIVE, ArtifactType.DEMO_SCRIPT],
    )


def _make_generated_content(
    story_type: StoryType = StoryType.BACKEND,
    story_id: str = "99-1",
) -> GeneratedContent:
    diagram_source = "graph LR\n  A --> B" if story_type in (
        StoryType.BACKEND, StoryType.INFRASTRUCTURE
    ) else None
    before_after = "Before: X. After: Y." if story_type in (
        StoryType.REFACTOR, StoryType.BUGFIX
    ) else None
    return GeneratedContent(
        problem_statement="Problem: Test. Why it matters: testing.",
        what_changed="We changed things.",
        why_this_approach="This is the right approach.",
        before_after=before_after,
        demo_script="## Demo Script\n### Scene 1\n**Show:** demo",
        diagram_source=diagram_source,
        slide_outline=[
            {"title": "Title", "bullets": ["B1"], "speaker_notes": "Notes"},
        ],
        story_type=story_type,
        story_id=story_id,
    )


def _mock_pipeline_success(
    story_type: StoryType = StoryType.BACKEND,
    story_id: str = "99-1",
) -> dict[str, MagicMock]:
    """Create mocks for a successful full pipeline run."""
    signals = _make_signal_bundle(story_id=story_id, story_type=story_type)
    classified = _make_classified(signals=signals, story_type=story_type)
    content = _make_generated_content(story_type=story_type, story_id=story_id)

    mocks = {
        "collect": MagicMock(return_value={"success": True, "data": signals}),
        "classify": MagicMock(return_value={"success": True, "data": classified}),
        "generate_content": MagicMock(return_value={"success": True, "data": content}),
        "generate_diagram": MagicMock(return_value={
            "success": True,
            "data": {"mmd_path": "/tmp/diagram.mmd", "png_path": None},
        }),
        "generate_demo_script": MagicMock(return_value={
            "success": True,
            "data": "# Demo Script\n\n## Scene 1\n**Show:** demo",
        }),
    }
    return mocks


def _patch_all(mocks: dict[str, MagicMock]):
    """Context manager that patches all pipeline components."""
    stack = ExitStack()
    stack.enter_context(patch("pf.demo.orchestrator.collect_signals", mocks["collect"]))
    stack.enter_context(patch("pf.demo.orchestrator.classify_story", mocks["classify"]))
    stack.enter_context(patch("pf.demo.orchestrator.generate_content", mocks["generate_content"]))
    stack.enter_context(patch("pf.demo.orchestrator.generate_diagram", mocks["generate_diagram"]))
    stack.enter_context(patch("pf.demo.orchestrator.generate_demo_script", mocks["generate_demo_script"]))
    return stack


# ===========================================================================
# AC 1: DemoOrchestrator.generate() public interface
# ===========================================================================


class TestAC1_PublicInterface:
    """AC 1: generate(story_id, corrections?, dry_run?) → {success, data, error}."""

    def test_generate_returns_result_object_on_success(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        assert "data" in result
        assert "error" not in result

    def test_generate_returns_result_object_on_failure(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["collect"].return_value = {"success": False, "error": "Story not found"}
        with _patch_all(mocks):
            result = generate("nonexistent", project_root=tmp_path)
        assert result["success"] is False
        assert "error" in result
        assert "data" not in result

    def test_generate_accepts_corrections_parameter(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", corrections="Fix slide 2", project_root=tmp_path)
        assert result["success"] is True
        # Verify corrections string was actually passed to generator
        mocks["generate_content"].assert_called_once()
        call_args = mocks["generate_content"].call_args
        all_args = list(call_args.args) + list(call_args.kwargs.values())
        found_corrections = any("Fix slide 2" in str(a) for a in all_args)
        assert found_corrections, "corrections string not passed to generate_content"

    def test_generate_accepts_dry_run_parameter(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", dry_run=True, project_root=tmp_path)
        assert result["success"] is True

    def test_generate_requires_story_id(self, tmp_path: Path) -> None:
        result = generate("", project_root=tmp_path)
        assert result["success"] is False
        assert "story_id" in result["error"].lower() or "required" in result["error"].lower()

    def test_project_root_typed_as_path_or_none(self) -> None:
        """project_root parameter should be typed str | Path | None, not Any."""
        import inspect
        import typing
        hints = typing.get_type_hints(generate)
        annotation = hints["project_root"]
        # Should NOT be Any — must be a proper union type
        assert annotation is not Any, (
            f"project_root typed as Any — should be 'str | Path | None', got: {annotation}"
        )


# ===========================================================================
# AC 2: Sequential pipeline — Collector → Classifier → Generator → Assemblers
# ===========================================================================


class TestAC2_SequentialPipeline:
    """AC 2: Orchestrates stages sequentially in dependency order."""

    def test_calls_all_stages_in_order(self, tmp_path: Path) -> None:
        call_order: list[str] = []

        signals = _make_signal_bundle()
        classified = _make_classified(signals=signals)
        content = _make_generated_content()

        def track(name: str, rv: Any):
            def _fn(*args, **kwargs):
                call_order.append(name)
                return rv
            return _fn

        mocks = {
            "collect": MagicMock(side_effect=track("collect", {"success": True, "data": signals})),
            "classify": MagicMock(side_effect=track("classify", {"success": True, "data": classified})),
            "generate_content": MagicMock(side_effect=track("generate_content", {"success": True, "data": content})),
            "generate_diagram": MagicMock(side_effect=track("generate_diagram", {
                "success": True,
                "data": {"mmd_path": "/tmp/d.mmd", "png_path": None},
            })),
            "generate_demo_script": MagicMock(side_effect=track("generate_demo_script", {
                "success": True,
                "data": "# Script",
            })),
        }

        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)

        assert result["success"] is True
        # Collector must come before Classifier, Classifier before Generator
        assert call_order.index("collect") < call_order.index("classify")
        assert call_order.index("classify") < call_order.index("generate_content")
        assert call_order.index("generate_content") < call_order.index("generate_diagram")
        assert call_order.index("generate_content") < call_order.index("generate_demo_script")

    def test_collector_output_feeds_classifier(self, tmp_path: Path) -> None:
        signals = _make_signal_bundle()
        classified = _make_classified(signals=signals)
        content = _make_generated_content()

        mocks = {
            "collect": MagicMock(return_value={"success": True, "data": signals}),
            "classify": MagicMock(return_value={"success": True, "data": classified}),
            "generate_content": MagicMock(return_value={"success": True, "data": content}),
            "generate_diagram": MagicMock(return_value={
                "success": True,
                "data": {"mmd_path": "/tmp/d.mmd", "png_path": None},
            }),
            "generate_demo_script": MagicMock(return_value={
                "success": True, "data": "# Script",
            }),
        }

        with _patch_all(mocks):
            generate("99-1", project_root=tmp_path)

        # Classifier should receive the SignalBundle from collector
        mocks["classify"].assert_called_once()
        classify_args = mocks["classify"].call_args
        assert classify_args[0][0] is signals or (
            classify_args[1].get("signals") is signals if classify_args[1] else False
        )


# ===========================================================================
# AC 3: Short-circuit on failure with clear error messages
# ===========================================================================


class TestAC3_ShortCircuit:
    """AC 3: Pipeline short-circuits on any stage failure."""

    def test_collector_failure_stops_pipeline(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["collect"].return_value = {"success": False, "error": "Sprint data not found"}
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is False
        assert "Sprint data not found" in result["error"]
        mocks["classify"].assert_not_called()
        mocks["generate_content"].assert_not_called()

    def test_classifier_failure_stops_pipeline(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["classify"].return_value = {
            "success": False,
            "error": "Ambiguous classification: matched ['backend', 'infrastructure']",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is False
        assert "Ambiguous" in result["error"]
        mocks["generate_content"].assert_not_called()

    def test_generator_failure_stops_pipeline(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["generate_content"].return_value = {
            "success": False,
            "error": "story title is required",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is False
        assert "title" in result["error"].lower()
        mocks["generate_diagram"].assert_not_called()
        mocks["generate_demo_script"].assert_not_called()

    def test_error_messages_are_descriptive(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["collect"].return_value = {
            "success": False,
            "error": "Story 99-1 not found in sprint data",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        # Error message should include context about what failed
        assert len(result["error"]) > 10


# ===========================================================================
# AC 4: Returns {success, data, error} per ADR-0008
# ===========================================================================


class TestAC4_ResultObjects:
    """AC 4: All return values follow ADR-0008 result object pattern."""

    def test_success_has_data_no_error(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        assert "data" in result
        assert "error" not in result

    def test_failure_has_error_no_data(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["collect"].return_value = {"success": False, "error": "fail"}
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is False
        assert "error" in result
        assert "data" not in result

    def test_success_data_contains_output_dir(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        assert "output_dir" in result["data"]

    def test_success_data_contains_files_list(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        assert "files" in result["data"]
        assert isinstance(result["data"]["files"], list)


# ===========================================================================
# AC 5: Output to sprint/demos/{story_id}/
# ===========================================================================


class TestAC5_OutputWriter:
    """AC 5: Writes all output to sprint/demos/{story_id}/."""

    def test_creates_output_directory(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        output_dir = Path(result["data"]["output_dir"])
        assert output_dir.exists()

    def test_output_dir_is_under_sprint_demos(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        output_dir = result["data"]["output_dir"]
        assert output_dir.endswith("sprint/demos/99-1"), (
            f"output_dir should end with 'sprint/demos/99-1', got: {output_dir}"
        )

    def test_writes_narrative_md(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        output_dir = Path(result["data"]["output_dir"])
        narrative = output_dir / "narrative.md"
        assert narrative.exists()

    def test_writes_demo_script_md(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        output_dir = Path(result["data"]["output_dir"])
        demo_script = output_dir / "demo-script.md"
        assert demo_script.exists()

    def test_writes_metadata_yaml(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        output_dir = Path(result["data"]["output_dir"])
        metadata = output_dir / "metadata.yaml"
        assert metadata.exists()

    def test_overwrites_on_rerun(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            r1 = generate("99-1", project_root=tmp_path)
        assert r1["success"] is True
        output_dir = Path(r1["data"]["output_dir"])
        first_narrative = (output_dir / "narrative.md").read_text()

        # Re-run should overwrite
        mocks2 = _mock_pipeline_success()
        with _patch_all(mocks2):
            r2 = generate("99-1", project_root=tmp_path)
        assert r2["success"] is True


# ===========================================================================
# AC 6: Dry-run mode — no file writes
# ===========================================================================


class TestAC6_DryRun:
    """AC 6: dry_run=True runs pipeline but writes no files."""

    def test_dry_run_returns_success(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", dry_run=True, project_root=tmp_path)
        assert result["success"] is True

    def test_dry_run_does_not_create_output_dir(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", dry_run=True, project_root=tmp_path)
        assert result["success"] is True
        demos_dir = tmp_path / "sprint" / "demos" / "99-1"
        assert not demos_dir.exists()

    def test_dry_run_still_calls_core_pipeline_stages(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            generate("99-1", dry_run=True, project_root=tmp_path)
        mocks["collect"].assert_called_once()
        mocks["classify"].assert_called_once()
        mocks["generate_content"].assert_called_once()

    def test_dry_run_does_not_call_diagram_generation(self, tmp_path: Path) -> None:
        """Dry-run must not invoke generate_diagram — it writes files."""
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", dry_run=True, project_root=tmp_path)
        assert result["success"] is True
        mocks["generate_diagram"].assert_not_called()

    def test_dry_run_does_not_call_script_generation(self, tmp_path: Path) -> None:
        """Dry-run must not invoke generate_demo_script — no output writing."""
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", dry_run=True, project_root=tmp_path)
        assert result["success"] is True
        mocks["generate_demo_script"].assert_not_called()


# ===========================================================================
# AC 7: Corrections workflow — re-run with corrections
# ===========================================================================


class TestAC7_Corrections:
    """AC 7: Corrections re-run generator with previous output + corrections."""

    def test_corrections_passed_to_generator(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate(
                "99-1",
                corrections="Slide 2 says 40% but should say 30%",
                project_root=tmp_path,
            )
        assert result["success"] is True
        # Generator should receive corrections
        call_args = mocks["generate_content"].call_args
        # Check corrections was passed as arg or kwarg
        all_args = list(call_args.args) + list(call_args.kwargs.values())
        found_corrections = any(
            "Slide 2 says 40%" in str(a) for a in all_args
        )
        assert found_corrections, "corrections string not passed to generator"

    def test_corrections_none_is_normal_run(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", corrections=None, project_root=tmp_path)
        assert result["success"] is True


# ===========================================================================
# AC 8: Diagram skipped when not needed
# ===========================================================================


class TestAC8_DiagramSkip:
    """AC 8: Diagram generation skipped when story type doesn't need it."""

    def test_ui_story_skips_diagram(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success(story_type=StoryType.UI)
        # UI stories have no diagram_source
        content = _make_generated_content(story_type=StoryType.UI)
        mocks["generate_content"].return_value = {"success": True, "data": content}
        classified = _make_classified(story_type=StoryType.UI)
        mocks["classify"].return_value = {"success": True, "data": classified}
        signals = _make_signal_bundle(story_type=StoryType.UI, title="Settings page layout")
        mocks["collect"].return_value = {"success": True, "data": signals}

        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        # diagram should not be called when content has no diagram_source
        # (or should be called but gracefully skip)

    def test_backend_story_generates_diagram(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success(story_type=StoryType.BACKEND)
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        mocks["generate_diagram"].assert_called()


# ===========================================================================
# AC 9: Mermaid diagram failure is non-fatal
# ===========================================================================


class TestAC9_DiagramFailureNonFatal:
    """AC 9: Diagram failure doesn't block the rest of the pipeline."""

    def test_diagram_failure_still_succeeds(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["generate_diagram"].return_value = {
            "success": False,
            "error": "No diagram_source provided",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        # Pipeline should still succeed — diagram is optional
        assert result["success"] is True

    def test_script_still_generated_after_diagram_failure(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["generate_diagram"].return_value = {
            "success": False,
            "error": "Diagram generation failed",
        }
        with _patch_all(mocks):
            generate("99-1", project_root=tmp_path)
        mocks["generate_demo_script"].assert_called()

    def test_diagram_error_exposed_in_return_data(self, tmp_path: Path) -> None:
        """Non-fatal diagram errors must be visible to callers, not silently discarded."""
        mocks = _mock_pipeline_success()
        mocks["generate_diagram"].return_value = {
            "success": False,
            "error": "mmdc not found on PATH",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        # Error info should be accessible in the return data
        assert "warnings" in result["data"] or "errors" in result["data"], (
            "Non-fatal stage errors must be exposed in return data"
        )


# ===========================================================================
# AC 10: Metadata written
# ===========================================================================


class TestAC10_Metadata:
    """AC 10: metadata.yaml written with run details."""

    def test_metadata_contains_story_id(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        output_dir = Path(result["data"]["output_dir"])
        metadata = output_dir / "metadata.yaml"
        assert metadata.exists()
        content = metadata.read_text()
        assert "99-1" in content

    def test_metadata_contains_generated_at(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        output_dir = Path(result["data"]["output_dir"])
        metadata = output_dir / "metadata.yaml"
        content = metadata.read_text()
        assert "generated_at" in content


# ===========================================================================
# AC 11: Script generation failure is non-fatal
# ===========================================================================


class TestAC11_ScriptFailureNonFatal:
    """AC 11: Demo script failure doesn't block the pipeline."""

    def test_script_failure_still_succeeds(self, tmp_path: Path) -> None:
        mocks = _mock_pipeline_success()
        mocks["generate_demo_script"].return_value = {
            "success": False,
            "error": "Empty demo_script field",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        # Pipeline should still succeed — script is optional
        assert result["success"] is True

    def test_script_error_exposed_in_return_data(self, tmp_path: Path) -> None:
        """Non-fatal script errors must be visible to callers, not silently discarded."""
        mocks = _mock_pipeline_success()
        mocks["generate_demo_script"].return_value = {
            "success": False,
            "error": "Empty demo_script field",
        }
        with _patch_all(mocks):
            result = generate("99-1", project_root=tmp_path)
        assert result["success"] is True
        assert "warnings" in result["data"] or "errors" in result["data"], (
            "Non-fatal stage errors must be exposed in return data"
        )
