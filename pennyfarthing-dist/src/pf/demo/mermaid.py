"""Mermaid diagram generation for demo artifacts (story 145-6).

Transforms GeneratedContent.diagram_source into .mmd files with optional
PNG rendering via the mmdc CLI. Supports backend, infrastructure, and
refactor diagram types.

Pure mechanical Python — no AI, no external calls (except optional mmdc).
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from shutil import which
from typing import Any

from pf.demo.models import GeneratedContent, StoryType


def generate_diagram(
    generated_content: GeneratedContent,
    output_dir: str | Path,
) -> dict[str, Any]:
    """Generate a Mermaid diagram from generated content.

    Args:
        generated_content: Output from the Content Generator (145-3).
        output_dir: Directory to write diagram files into
                    (e.g. sprint/demos/<story-id>/).

    Returns:
        {success: True, data: {mmd_path: str, png_path: str | None}} on success,
        {success: False, error: str} on failure.
    """
    try:
        gc = generated_content

        if gc.diagram_source is None or not gc.diagram_source.strip():
            return {
                "success": False,
                "error": "No diagram_source provided — nothing to render",
            }

        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        mmd_path = out / "diagram.mmd"
        mmd_path.write_text(gc.diagram_source, encoding="utf-8")

        png_path = _render_png(mmd_path)

        return {
            "success": True,
            "data": {
                "mmd_path": str(mmd_path),
                "png_path": str(png_path) if png_path else None,
            },
        }
    except Exception as exc:
        return {"success": False, "error": f"Diagram generation failed: {exc}"}


def build_diagram_source(
    title: str,
    story_type: StoryType,
    *,
    before_after: str | None = None,
) -> str | None:
    """Build a Mermaid diagram source string for the given story type.

    Returns None for story types that don't warrant diagrams (UI, bugfix).

    Args:
        title: The story title for labeling diagram nodes.
        story_type: Determines which diagram template to use.
        before_after: Optional before/after description for refactor diagrams.

    Returns:
        Mermaid source string, or None if the story type has no diagram.
    """
    builder = _BUILDERS.get(story_type)
    if builder is None:
        return None
    return builder(title, before_after)


# ---------------------------------------------------------------------------
# Diagram builders by story type
# ---------------------------------------------------------------------------


def _build_backend(title: str, _before_after: str | None) -> str:
    """Request/response flow diagram for backend stories."""
    return (
        "graph LR\n"
        '  Client["Client"] --> Gateway["API Gateway"]\n'
        f'  Gateway --> Service["{title}"]\n'
        '  Service --> DB["Database"]\n'
        "  DB --> Service\n"
        "  Service --> Gateway\n"
        "  Gateway --> Client"
    )


def _build_infrastructure(title: str, _before_after: str | None) -> str:
    """Deployment topology diagram for infrastructure stories."""
    return (
        "graph TD\n"
        f'  LB["Load Balancer"] --> App["{title}"]\n'
        '  App --> Container["Container"]\n'
        '  Container --> Pod["Pod"]\n'
        '  Pod --> Monitor["Monitoring"]\n'
        '  Pod --> Storage["Storage"]'
    )


def _build_refactor(title: str, before_after: str | None) -> str:
    """Before/after architecture comparison for refactor stories."""
    ba_label = before_after or "Simplified architecture"
    return (
        "graph LR\n"
        f'  subgraph Before["{title} — Before"]\n'
        '    A1["Legacy Component"] --> B1["Tight Coupling"]\n'
        '    B1 --> C1["Monolith"]\n'
        "  end\n"
        f'  subgraph After["{title} — After"]\n'
        f'    A2["Refactored"] --> B2["{ba_label}"]\n'
        '    B2 --> C2["Clean Architecture"]\n'
        "  end\n"
        "  Before -.-> After"
    )


_BUILDERS: dict[StoryType, Any] = {
    StoryType.BACKEND: _build_backend,
    StoryType.INFRASTRUCTURE: _build_infrastructure,
    StoryType.REFACTOR: _build_refactor,
}


# ---------------------------------------------------------------------------
# PNG rendering (optional — graceful degradation)
# ---------------------------------------------------------------------------


def _render_png(mmd_path: Path) -> Path | None:
    """Render .mmd to .png via mmdc CLI. Returns None if mmdc is unavailable.

    All failures are non-fatal — the .mmd file is already written by the caller.
    """
    mmdc = which("mmdc")
    if mmdc is None:
        return None

    try:
        png_path = mmd_path.with_suffix(".png")
        result = subprocess.run(
            [mmdc, "-i", str(mmd_path), "-o", str(png_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            return None

        if png_path.exists():
            return png_path
    except (subprocess.TimeoutExpired, OSError):
        pass

    return None
