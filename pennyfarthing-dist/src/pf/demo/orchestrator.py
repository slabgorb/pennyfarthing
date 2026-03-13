"""DemoOrchestrator — pipeline entry point and output writer (story 145-7).

Orchestrates the demo generation pipeline: Collector → Classifier →
Generator → Mermaid → ScriptGenerator. Writes output to
sprint/demos/{story_id}/.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from pf.demo.classifier import classify_story
from pf.demo.collector import collect_signals
from pf.demo.generator import generate_content
from pf.demo.mermaid import generate_diagram
from pf.demo.models import GeneratedContent
from pf.demo.script_generator import generate_demo_script


def generate(
    story_id: str,
    corrections: str | None = None,
    dry_run: bool = False,
    project_root: str | Path | None = None,
) -> dict[str, Any]:
    """Generate demo artifacts for a completed story.

    Runs the pipeline sequentially: Collector → Classifier → Generator →
    Mermaid → ScriptGenerator. Short-circuits on core stage failures.
    Diagram and script failures are non-fatal.

    Args:
        story_id: Story identifier (e.g., "145-7")
        corrections: Optional developer feedback for regeneration
        dry_run: If True, run pipeline but don't write files
        project_root: Project root path (defaults to auto-detect)

    Returns:
        {success: bool, data?: dict, error?: str} per ADR-0008
    """
    if not story_id:
        return {"success": False, "error": "story_id is required"}

    # --- Stage 1: Collect signals ---
    collect_result = collect_signals(story_id, project_root=project_root)
    if not collect_result["success"]:
        return {"success": False, "error": collect_result["error"]}

    signals = collect_result["data"]

    # --- Stage 2: Classify story ---
    # Locate demo.yaml for config-based classification overrides
    config_path = None
    if project_root:
        candidate = Path(project_root) / "pennyfarthing-dist" / "demo.yaml"
        if candidate.exists():
            config_path = candidate

    classify_result = classify_story(signals, config_path=config_path)
    if not classify_result["success"]:
        return {"success": False, "error": classify_result["error"]}

    classified = classify_result["data"]

    # --- Stage 3: Generate content ---
    gen_result = generate_content(classified, corrections=corrections)
    if not gen_result["success"]:
        return {"success": False, "error": gen_result["error"]}

    content = gen_result["data"]

    # --- Output path ---
    output_dir = Path(project_root) / "sprint" / "demos" / story_id if project_root else Path("sprint") / "demos" / story_id

    warnings: list[str] = []
    files: list[str] = []

    if not dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

        # --- Stage 4: Mermaid diagram (non-fatal) ---
        diagram_result = generate_diagram(content, str(output_dir))
        if not diagram_result["success"]:
            warnings.append(f"diagram: {diagram_result['error']}")

        # --- Stage 5: Demo script (non-fatal) ---
        script_result = generate_demo_script(content)
        if not script_result["success"]:
            warnings.append(f"script: {script_result['error']}")

        # Narrative
        narrative_path = output_dir / "narrative.md"
        narrative_content = _build_narrative(content)
        narrative_path.write_text(narrative_content, encoding="utf-8")
        files.append(str(narrative_path))

        # Demo script
        demo_script_path = output_dir / "demo-script.md"
        if script_result["success"]:
            demo_script_path.write_text(script_result["data"], encoding="utf-8")
        else:
            demo_script_path.write_text(content.demo_script, encoding="utf-8")
        files.append(str(demo_script_path))

        # Metadata
        metadata_path = output_dir / "metadata.yaml"
        metadata = {
            "story_id": story_id,
            "generated_at": datetime.now(UTC).isoformat(),
            "story_type": classified.story_type.value,
            "diagram_generated": diagram_result["success"],
            "script_generated": script_result["success"],
        }
        metadata_path.write_text(
            yaml.dump(metadata, default_flow_style=False, sort_keys=False),
            encoding="utf-8",
        )
        files.append(str(metadata_path))

        # Diagram files (if generated)
        if diagram_result["success"] and diagram_result.get("data"):
            mmd_path = diagram_result["data"].get("mmd_path")
            if mmd_path:
                files.append(mmd_path)
            png_path = diagram_result["data"].get("png_path")
            if png_path:
                files.append(png_path)

    data: dict[str, Any] = {
        "output_dir": str(output_dir),
        "files": files,
    }
    if warnings:
        data["warnings"] = warnings

    return {
        "success": True,
        "data": data,
    }


def _build_narrative(content: GeneratedContent) -> str:
    """Build narrative markdown from generated content."""
    sections = [
        "# Narrative",
        "",
        "## Problem Statement",
        content.problem_statement,
        "",
        "## What Changed",
        content.what_changed,
        "",
        "## Why This Approach",
        content.why_this_approach,
    ]

    if content.before_after:
        sections.extend(["", "## Before/After", content.before_after])

    return "\n".join(sections) + "\n"
