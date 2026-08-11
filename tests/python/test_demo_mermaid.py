"""Tests for Mermaid diagram generation (story 145-6).

Tests validate generate_diagram() and build_diagram_source() against all 7 ACs.

Run with: python -m pytest tests/python/test_demo_mermaid.py -v
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.demo.mermaid import build_diagram_source, generate_diagram  # noqa: E402
from pf.demo.models import GeneratedContent, StoryType  # noqa: E402

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_content(
    *,
    story_type: StoryType = StoryType.BACKEND,
    story_id: str = "99-1",
    diagram_source: str | None = "graph LR\n  A --> B",
    problem_statement: str = "Test problem",
    what_changed: str = "Test change",
    why_this_approach: str = "Test reason",
    before_after: str | None = None,
    demo_script: str = "Test script",
    slide_outline: list[dict] | None = None,
) -> GeneratedContent:
    return GeneratedContent(
        problem_statement=problem_statement,
        what_changed=what_changed,
        why_this_approach=why_this_approach,
        before_after=before_after,
        demo_script=demo_script,
        diagram_source=diagram_source,
        slide_outline=slide_outline or [],
        story_type=story_type,
        story_id=story_id,
    )


# ===========================================================================
# AC 1: Module at pf/demo/mermaid.py with deterministic diagram creation
# ===========================================================================


class TestAC1_DeterministicCreation:
    """AC 1: Module exists and produces deterministic output."""

    def test_same_input_same_output(self, tmp_path: Path) -> None:
        gc = _make_content()
        r1 = generate_diagram(gc, tmp_path / "run1")
        r2 = generate_diagram(gc, tmp_path / "run2")
        assert r1["success"] is True
        assert r2["success"] is True
        content1 = Path(r1["data"]["mmd_path"]).read_text()
        content2 = Path(r2["data"]["mmd_path"]).read_text()
        assert content1 == content2

    def test_result_object_shape_success(self, tmp_path: Path) -> None:
        gc = _make_content()
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        assert "data" in result
        assert "mmd_path" in result["data"]
        assert "png_path" in result["data"]

    def test_result_object_shape_failure(self, tmp_path: Path) -> None:
        gc = _make_content(diagram_source=None)
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is False
        assert "error" in result


# ===========================================================================
# AC 2: Three diagram types — backend, infrastructure, refactor
# ===========================================================================


class TestAC2_DiagramTypes:
    """AC 2: Support three diagram types."""

    def test_backend_diagram(self) -> None:
        source = build_diagram_source("My API", StoryType.BACKEND)
        assert source is not None
        assert "graph LR" in source
        assert "My API" in source
        assert "Client" in source
        assert "Database" in source

    def test_infrastructure_diagram(self) -> None:
        source = build_diagram_source("Deploy Pipeline", StoryType.INFRASTRUCTURE)
        assert source is not None
        assert "graph TD" in source
        assert "Deploy Pipeline" in source
        assert "Load Balancer" in source
        assert "Monitoring" in source

    def test_refactor_diagram(self) -> None:
        source = build_diagram_source("Auth Rewrite", StoryType.REFACTOR)
        assert source is not None
        assert "Before" in source
        assert "After" in source
        assert "Auth Rewrite" in source

    def test_refactor_uses_before_after(self) -> None:
        source = build_diagram_source(
            "Auth Rewrite",
            StoryType.REFACTOR,
            before_after="Moved to JWT tokens",
        )
        assert source is not None
        assert "Moved to JWT tokens" in source

    def test_ui_returns_none(self) -> None:
        source = build_diagram_source("Settings Page", StoryType.UI)
        assert source is None

    def test_bugfix_returns_none(self) -> None:
        source = build_diagram_source("Fix login", StoryType.BUGFIX)
        assert source is None


# ===========================================================================
# AC 3: Optional PNG rendering via mmdc CLI
# ===========================================================================


class TestAC3_PNGRendering:
    """AC 3: Optional rendering to PNG via mmdc CLI."""

    def test_no_mmdc_returns_none_for_png(self, tmp_path: Path) -> None:
        gc = _make_content()
        with patch("pf.demo.mermaid.which", return_value=None):
            result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        assert result["data"]["png_path"] is None

    def test_mmdc_available_renders_png(self, tmp_path: Path) -> None:
        gc = _make_content()
        png_file = tmp_path / "diagram.png"

        def fake_run(cmd: list, **kwargs: Any) -> Any:
            png_file.write_bytes(b"fake-png")

            class FakeResult:
                returncode = 0
                stdout = ""
                stderr = ""

            return FakeResult()

        with (
            patch("pf.demo.mermaid.which", return_value="/usr/local/bin/mmdc"),
            patch("pf.demo.mermaid.subprocess.run", side_effect=fake_run),
        ):
            result = generate_diagram(gc, tmp_path)

        assert result["success"] is True
        assert result["data"]["png_path"] is not None

    def test_mmdc_failure_returns_none_for_png(self, tmp_path: Path) -> None:
        gc = _make_content()

        class FakeResult:
            returncode = 1
            stdout = ""
            stderr = "error"

        with (
            patch("pf.demo.mermaid.which", return_value="/usr/local/bin/mmdc"),
            patch("pf.demo.mermaid.subprocess.run", return_value=FakeResult()),
        ):
            result = generate_diagram(gc, tmp_path)

        assert result["success"] is True
        assert result["data"]["png_path"] is None


# ===========================================================================
# AC 4: Integration with GeneratedContent.diagram_source
# ===========================================================================


class TestAC4_DiagramSourceIntegration:
    """AC 4: Proper integration with GeneratedContent.diagram_source."""

    def test_writes_diagram_source_verbatim(self, tmp_path: Path) -> None:
        source = "graph LR\n  A[Start] --> B[End]"
        gc = _make_content(diagram_source=source)
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        written = Path(result["data"]["mmd_path"]).read_text()
        assert written == source

    def test_none_diagram_source_returns_error(self, tmp_path: Path) -> None:
        gc = _make_content(diagram_source=None)
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is False
        assert "No diagram_source" in result["error"]

    def test_empty_diagram_source_returns_error(self, tmp_path: Path) -> None:
        gc = _make_content(diagram_source="   ")
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is False
        assert "No diagram_source" in result["error"]


# ===========================================================================
# AC 5: Output to sprint/demos/<story-id>/diagram.mmd
# ===========================================================================


class TestAC5_OutputStructure:
    """AC 5: Output structure with .mmd and optional .png."""

    def test_creates_output_directory(self, tmp_path: Path) -> None:
        out = tmp_path / "sprint" / "demos" / "99-1"
        gc = _make_content()
        result = generate_diagram(gc, out)
        assert result["success"] is True
        assert out.exists()

    def test_mmd_file_path(self, tmp_path: Path) -> None:
        gc = _make_content()
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        mmd_path = Path(result["data"]["mmd_path"])
        assert mmd_path.name == "diagram.mmd"
        assert mmd_path.parent == tmp_path

    def test_mmd_file_is_utf8(self, tmp_path: Path) -> None:
        gc = _make_content(diagram_source="graph LR\n  A[\"Unicode: \u2192\"] --> B")
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        content = Path(result["data"]["mmd_path"]).read_text(encoding="utf-8")
        assert "\u2192" in content


# ===========================================================================
# AC 6: Fail hard — no partial output, return {success, data?, error?}
# ===========================================================================


class TestAC6_FailHard:
    """AC 6: No partial output. Result objects per ADR-0008."""

    def test_exception_returns_error_result(self, tmp_path: Path) -> None:
        gc = _make_content()
        with patch.object(Path, "write_text", side_effect=OSError("disk full")):
            result = generate_diagram(gc, tmp_path)
        assert result["success"] is False
        assert "disk full" in result["error"]

    def test_success_never_has_error_key(self, tmp_path: Path) -> None:
        gc = _make_content()
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        assert "error" not in result

    def test_failure_never_has_data_key(self, tmp_path: Path) -> None:
        gc = _make_content(diagram_source=None)
        result = generate_diagram(gc, tmp_path)
        assert result["success"] is False
        assert "data" not in result


# ===========================================================================
# AC 7: Non-fatal graceful degradation — missing mmdc doesn't block
# ===========================================================================


class TestAC7_GracefulDegradation:
    """AC 7: Missing mmdc doesn't block PPTX generation."""

    def test_no_mmdc_still_succeeds(self, tmp_path: Path) -> None:
        gc = _make_content()
        with patch("pf.demo.mermaid.which", return_value=None):
            result = generate_diagram(gc, tmp_path)
        assert result["success"] is True
        assert Path(result["data"]["mmd_path"]).exists()

    def test_mmdc_timeout_still_succeeds(self, tmp_path: Path) -> None:
        gc = _make_content()

        def fake_run(*args: Any, **kwargs: Any) -> None:
            raise subprocess.TimeoutExpired(cmd="mmdc", timeout=30)

        with (
            patch("pf.demo.mermaid.which", return_value="/usr/local/bin/mmdc"),
            patch("pf.demo.mermaid.subprocess.run", side_effect=fake_run),
        ):
            result = generate_diagram(gc, tmp_path)

        # mmdc timeout should not cause the whole operation to fail
        # The .mmd file was already written before mmdc was called
        assert result["success"] is True
        assert result["data"]["png_path"] is None
