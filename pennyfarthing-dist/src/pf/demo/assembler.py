"""PPTX assembler — build slide deck from generated content (story 145-5).

Assembles GeneratedContent + ClassifiedStory into presentation-ready PPTX
slide decks and supporting files. Pure mechanical Python — no AI.

Output structure:
  sprint/demos/<story-id>/
    deck.pptx, demo-script.md, narrative.md, diagram.mmd, metadata.yaml
"""

from __future__ import annotations

import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from pptx import Presentation
from pptx.util import Inches, Pt

from pf.common.config import get_project_root
from pf.demo.models import ClassifiedStory, GeneratedContent, StoryType


def _has_mmdc() -> bool:
    """Check if mermaid-cli (mmdc) is available on PATH."""
    return shutil.which("mmdc") is not None


def _render_mermaid(mmd_path: str, png_path: str) -> None:
    """Render a .mmd file to .png using mmdc."""
    subprocess.run(
        ["mmdc", "-i", mmd_path, "-o", png_path],
        check=True,
        capture_output=True,
    )


def _build_slides(
    prs: Presentation,
    gc: GeneratedContent,
    cs: ClassifiedStory,
) -> None:
    """Add slides to the presentation based on content and story type."""
    blank = prs.slide_layouts[6]  # blank layout

    # 1. Title slide
    slide = prs.slides.add_slide(blank)
    txBox = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(8), Inches(2))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = f"Story {gc.story_id}"
    p.font.size = Pt(36)
    p.font.bold = True
    p2 = tf.add_paragraph()
    p2.text = cs.signals.title if cs.signals else gc.story_id
    p2.font.size = Pt(20)

    # 2. Problem slide
    slide = prs.slides.add_slide(blank)
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(1))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Problem"
    p.font.size = Pt(28)
    p.font.bold = True
    body = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5))
    bf = body.text_frame
    bf.word_wrap = True
    bf.paragraphs[0].text = gc.problem_statement
    bf.paragraphs[0].font.size = Pt(16)

    # 3. What We Built slide
    slide = prs.slides.add_slide(blank)
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(1))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "What We Built"
    p.font.size = Pt(28)
    p.font.bold = True
    body = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5))
    bf = body.text_frame
    bf.word_wrap = True
    bf.paragraphs[0].text = gc.what_changed
    bf.paragraphs[0].font.size = Pt(16)

    # 4. Why This Approach slide
    slide = prs.slides.add_slide(blank)
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(1))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Why This Approach"
    p.font.size = Pt(28)
    p.font.bold = True
    body = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5))
    bf = body.text_frame
    bf.word_wrap = True
    bf.paragraphs[0].text = gc.why_this_approach
    bf.paragraphs[0].font.size = Pt(16)

    # 5. Before/After slide (conditional — refactor/bugfix with content)
    if gc.before_after:
        slide = prs.slides.add_slide(blank)
        txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(1))
        tf = txBox.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = "Before / After"
        p.font.size = Pt(28)
        p.font.bold = True
        body = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5))
        bf = body.text_frame
        bf.word_wrap = True
        bf.paragraphs[0].text = gc.before_after
        bf.paragraphs[0].font.size = Pt(16)

    # 6. CTA / Questions slide (always last)
    slide = prs.slides.add_slide(blank)
    txBox = slide.shapes.add_textbox(Inches(2), Inches(2.5), Inches(6), Inches(2))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Questions?"
    p.font.size = Pt(36)
    p.font.bold = True
    p2 = tf.add_paragraph()
    p2.text = "Next steps and call to action"
    p2.font.size = Pt(18)


def assemble(
    generated_content: GeneratedContent,
    classified_story: ClassifiedStory,
    output_dir: str | None = None,
) -> dict[str, Any]:
    """Assemble demo artifacts from generated content.

    Args:
        generated_content: Output from Generator (145-3).
        classified_story: Output from Classifier (145-2).
        output_dir: Override output directory (default: sprint/demos/<story-id>/).

    Returns:
        {success: True, data: {output_dir, files}} on success,
        {success: False, error: str} on failure.
    """
    try:
        gc = generated_content
        cs = classified_story

        # Validate: non-empty content required
        if not gc.problem_statement and not gc.what_changed and not gc.slide_outline:
            return {"success": False, "error": "Empty generated content — nothing to assemble."}

        # Resolve output directory
        if output_dir is None:
            root = get_project_root()
            out = root / "sprint" / "demos" / gc.story_id
        else:
            out = Path(output_dir)

        out.mkdir(parents=True, exist_ok=True)

        files: list[str] = []

        # --- Build PPTX ---
        prs = Presentation()
        _build_slides(prs, gc, cs)
        pptx_path = out / "deck.pptx"
        prs.save(str(pptx_path))
        files.append("deck.pptx")

        # --- Supporting files ---

        # narrative.md
        narrative = out / "narrative.md"
        narrative.write_text(
            f"# {gc.story_id}\n\n"
            f"## Problem\n\n{gc.problem_statement}\n\n"
            f"## What Changed\n\n{gc.what_changed}\n\n"
            f"## Why This Approach\n\n{gc.why_this_approach}\n"
        )
        files.append("narrative.md")

        # metadata.yaml
        meta = out / "metadata.yaml"
        meta_data = {
            "story_id": gc.story_id,
            "story_type": gc.story_type.value,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        meta.write_text(yaml.dump(meta_data, default_flow_style=False))
        files.append("metadata.yaml")

        # demo-script.md
        script = out / "demo-script.md"
        script.write_text(f"# Demo Script — {gc.story_id}\n\n{gc.demo_script}\n")
        files.append("demo-script.md")

        # diagram.mmd (only when source exists)
        if gc.diagram_source is not None:
            mmd = out / "diagram.mmd"
            mmd.write_text(gc.diagram_source)
            files.append("diagram.mmd")

            # Try rendering to PNG if mmdc available
            if _has_mmdc():
                png_path = out / "diagram.png"
                _render_mermaid(str(mmd), str(png_path))
                if png_path.exists():
                    files.append("diagram.png")

        return {
            "success": True,
            "data": {
                "output_dir": str(out),
                "files": files,
            },
        }

    except Exception as exc:
        return {"success": False, "error": str(exc)}
