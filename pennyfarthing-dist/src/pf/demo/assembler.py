"""PPTX assembler — build slide deck from generated content (story 145-5).

Assembles GeneratedContent + ClassifiedStory into presentation-ready PPTX
slide decks and supporting files. Includes markdown-to-PPTX conversion
and dark-themed branding.

Output structure:
  sprint/demos/<story-id>/
    deck.pptx, demo-script.md, narrative.md, diagram.mmd, metadata.yaml
"""

from __future__ import annotations

import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

from pf.common.config import get_project_root
from pf.demo.models import ClassifiedStory, GeneratedContent

# ---------------------------------------------------------------------------
# Branding constants — 1898 & Co. / Axiathon
# ---------------------------------------------------------------------------

BG_COLOR = RGBColor(0x39, 0x3A, 0x3C)       # Dark gray (#393a3c)
ACCENT_COLOR = RGBColor(0xFF, 0x6A, 0x39)    # 1898 orange-red (#ff6a39)
TEXT_COLOR = RGBColor(0xFF, 0xFF, 0xFF)       # White body text
HEADING_COLOR = RGBColor(0xFF, 0xFF, 0xFF)    # White headings
MUTED_COLOR = RGBColor(0xAA, 0xAA, 0xAA)     # Muted gray
CODE_COLOR = RGBColor(0x7E, 0xCA, 0x9C)      # Green for code
FONT_PRIMARY = "Manrope"                      # 1898 brand font
FONT_FALLBACK = "Calibri"                     # Fallback
BRAND_LINE = "1898 & Co. | Axiathon"


# ---------------------------------------------------------------------------
# Markdown → PPTX text runs
# ---------------------------------------------------------------------------


def _brand_font(run, size: int = 16, *, bold: bool = False, color: RGBColor = TEXT_COLOR) -> None:
    """Apply brand font to a run."""
    run.font.name = FONT_PRIMARY
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color


def _set_slide_bg(slide, color: RGBColor) -> None:
    """Set solid background color on a slide."""
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def _add_markdown_runs(paragraph, text: str, *, font_size: int = 16, color: RGBColor = TEXT_COLOR) -> None:
    """Parse markdown inline formatting and add runs to a paragraph.

    Handles: **bold**, `code`, *italic*. Strips markdown syntax.
    """
    # Split on bold, code, and italic markers
    pattern = r'(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)'
    parts = re.split(pattern, text)

    for part in parts:
        if not part:
            continue

        run = paragraph.add_run()
        run.font.name = FONT_PRIMARY
        run.font.size = Pt(font_size)

        if part.startswith('**') and part.endswith('**'):
            run.text = part[2:-2]
            run.font.bold = True
            run.font.color.rgb = HEADING_COLOR
        elif part.startswith('`') and part.endswith('`'):
            run.text = part[1:-1]
            run.font.name = "Courier New"
            run.font.color.rgb = CODE_COLOR
        elif part.startswith('*') and part.endswith('*') and not part.startswith('**'):
            run.text = part[1:-1]
            run.font.italic = True
            run.font.color.rgb = color
        else:
            run.text = part
            run.font.color.rgb = color


def _add_markdown_body(text_frame, text: str, *, font_size: int = 16) -> None:
    """Parse markdown block content into a text frame with proper formatting.

    Handles: bullet lines (- or *), headings (### Scene), horizontal rules (---),
    and inline formatting via _add_markdown_runs.
    """
    text_frame.word_wrap = True
    lines = text.split('\n')
    first = True

    for line in lines:
        stripped = line.strip()

        # Skip empty lines
        if not stripped:
            continue

        # Skip horizontal rules
        if re.match(r'^-{3,}$', stripped):
            continue

        if first:
            p = text_frame.paragraphs[0]
            first = False
        else:
            p = text_frame.add_paragraph()

        # Heading lines (### Scene 1: ...)
        if stripped.startswith('#'):
            heading_text = re.sub(r'^#+\s*', '', stripped)
            _add_markdown_runs(p, heading_text, font_size=font_size + 2, color=ACCENT_COLOR)
            p.font.bold = True
            p.space_before = Pt(12)
            continue

        # Bullet lines
        if stripped.startswith(('- ', '* ', '• ')):
            bullet_text = stripped[2:]
            p.level = 0
            p.space_before = Pt(4)
            run = p.add_run()
            run.text = "• "
            run.font.size = Pt(font_size)
            run.font.color.rgb = ACCENT_COLOR
            _add_markdown_runs(p, bullet_text, font_size=font_size)
            continue

        # Indented bullets
        if re.match(r'^\s{2,}[-*•]', line):
            bullet_text = re.sub(r'^\s+[-*•]\s*', '', line)
            p.level = 1
            p.space_before = Pt(2)
            run = p.add_run()
            run.text = "  ◦ "
            run.font.size = Pt(font_size - 1)
            run.font.color.rgb = MUTED_COLOR
            _add_markdown_runs(p, bullet_text, font_size=font_size - 1, color=MUTED_COLOR)
            continue

        # Regular text with inline formatting
        _add_markdown_runs(p, stripped, font_size=font_size)
        p.space_before = Pt(4)


# ---------------------------------------------------------------------------
# Slide builders
# ---------------------------------------------------------------------------


def _add_footer(slide, story_id: str, slide_num: int, date_str: str) -> None:
    """Add footer with branding, story ID, date, and slide number."""
    footer = slide.shapes.add_textbox(Inches(0.5), Inches(7.0), Inches(7), Inches(0.3))
    tf = footer.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = f"{BRAND_LINE}  •  Story {story_id}  •  {date_str}"
    _brand_font(run, size=9, color=MUTED_COLOR)

    num_box = slide.shapes.add_textbox(Inches(8.5), Inches(7.0), Inches(1), Inches(0.3))
    tf2 = num_box.text_frame
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.RIGHT
    run2 = p2.add_run()
    run2.text = str(slide_num)
    _brand_font(run2, size=9, color=MUTED_COLOR)


MAX_LINES_PER_SLIDE = 12
MAX_WORDS_PER_SLIDE = 150


def _split_content(text: str) -> list[str]:
    """Split long content into chunks that fit on slides.

    Splits on paragraph boundaries (double newline or after heading blocks).
    Each chunk stays under MAX_LINES_PER_SLIDE lines and MAX_WORDS_PER_SLIDE words.
    """
    lines = [l for l in text.split('\n') if l.strip()]

    if len(lines) <= MAX_LINES_PER_SLIDE and len(text.split()) <= MAX_WORDS_PER_SLIDE:
        return [text]

    chunks: list[str] = []
    current_lines: list[str] = []
    current_words = 0

    for line in lines:
        line_words = len(line.split())
        would_exceed = (
            len(current_lines) >= MAX_LINES_PER_SLIDE
            or current_words + line_words > MAX_WORDS_PER_SLIDE
        )

        if would_exceed and current_lines:
            chunks.append('\n'.join(current_lines))
            current_lines = []
            current_words = 0

        current_lines.append(line)
        current_words += line_words

    if current_lines:
        chunks.append('\n'.join(current_lines))

    return chunks if chunks else [text]


def _add_single_content_slide(
    prs: Presentation,
    title: str,
    body_text: str,
    story_id: str,
    date_str: str,
    slide_num: int,
    *,
    title_size: int = 28,
    body_size: int = 16,
) -> None:
    """Add one branded content slide with markdown parsing."""
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    _set_slide_bg(slide, BG_COLOR)

    # Accent bar at top
    bar = slide.shapes.add_shape(
        1, Inches(0), Inches(0), Inches(10), Inches(0.06),
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT_COLOR
    bar.line.fill.background()

    # Title
    header = slide.shapes.add_textbox(Inches(0.7), Inches(0.4), Inches(8.6), Inches(0.8))
    hf = header.text_frame
    hf.word_wrap = True
    p = hf.paragraphs[0]
    run = p.add_run()
    run.text = title
    _brand_font(run, size=title_size, bold=True, color=HEADING_COLOR)

    # Body with markdown parsing
    body = slide.shapes.add_textbox(Inches(0.7), Inches(1.4), Inches(8.6), Inches(5.3))
    _add_markdown_body(body.text_frame, body_text, font_size=body_size)

    _add_footer(slide, story_id, slide_num, date_str)


def _add_branded_content_slides(
    prs: Presentation,
    title: str,
    body_text: str,
    story_id: str,
    date_str: str,
    slide_num: int,
    *,
    title_size: int = 28,
    body_size: int = 16,
) -> int:
    """Add branded content slide(s), auto-splitting if content is too long.

    Returns the next slide_num after all slides added.
    """
    chunks = _split_content(body_text)

    for i, chunk in enumerate(chunks):
        slide_title = title if len(chunks) == 1 else f"{title} ({i + 1}/{len(chunks)})"
        _add_single_content_slide(
            prs, slide_title, chunk,
            story_id, date_str, slide_num,
            title_size=title_size, body_size=body_size,
        )
        slide_num += 1

    return slide_num


def _build_slides(
    prs: Presentation,
    gc: GeneratedContent,
    cs: ClassifiedStory,
) -> None:
    """Add slides to the presentation with dark branding and markdown parsing."""
    blank = prs.slide_layouts[6]
    date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    title_text = cs.signals.title if cs.signals else gc.story_id
    slide_num = 1

    # 1. Title slide
    slide = prs.slides.add_slide(blank)
    _set_slide_bg(slide, BG_COLOR)

    # Accent bar
    bar = slide.shapes.add_shape(
        1, Inches(0), Inches(3.6), Inches(10), Inches(0.06),
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT_COLOR
    bar.line.fill.background()

    # Brand name
    tx0 = slide.shapes.add_textbox(Inches(1), Inches(1.2), Inches(8), Inches(0.5))
    tf0 = tx0.text_frame
    p0 = tf0.paragraphs[0]
    run0 = p0.add_run()
    run0.text = "1898 & Co."
    _brand_font(run0, size=14, color=MUTED_COLOR)
    run0b = p0.add_run()
    run0b.text = "  •  Axiathon"
    _brand_font(run0b, size=14, color=ACCENT_COLOR)

    # Story ID
    tx = slide.shapes.add_textbox(Inches(1), Inches(1.8), Inches(8), Inches(0.6))
    tf = tx.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = f"Story {gc.story_id}"
    _brand_font(run, size=18, bold=True, color=ACCENT_COLOR)

    # Title
    tx2 = slide.shapes.add_textbox(Inches(1), Inches(2.5), Inches(8), Inches(1))
    tf2 = tx2.text_frame
    tf2.word_wrap = True
    p2 = tf2.paragraphs[0]
    run2 = p2.add_run()
    run2.text = title_text
    _brand_font(run2, size=36, bold=True, color=HEADING_COLOR)

    # Date
    tx3 = slide.shapes.add_textbox(Inches(1), Inches(3.9), Inches(8), Inches(0.5))
    tf3 = tx3.text_frame
    p3 = tf3.paragraphs[0]
    run3 = p3.add_run()
    run3.text = date_str
    _brand_font(run3, size=14, color=MUTED_COLOR)

    _add_footer(slide, gc.story_id, slide_num, date_str)
    slide_num += 1

    # 2. Problem Statement
    slide_num = _add_branded_content_slides(
        prs, "Problem", gc.problem_statement,
        gc.story_id, date_str, slide_num,
    )

    # 3. What We Built
    slide_num = _add_branded_content_slides(
        prs, "What We Built", gc.what_changed,
        gc.story_id, date_str, slide_num,
    )

    # 4. Why This Approach
    slide_num = _add_branded_content_slides(
        prs, "Why This Approach", gc.why_this_approach,
        gc.story_id, date_str, slide_num,
    )

    # 5. Before/After (conditional)
    if gc.before_after:
        slide_num = _add_branded_content_slides(
            prs, "Before / After", gc.before_after,
            gc.story_id, date_str, slide_num,
        )

    # 6. Roadmap & Integration (conditional)
    if gc.roadmap:
        slide_num = _add_branded_content_slides(
            prs, "Roadmap & Integration", gc.roadmap,
            gc.story_id, date_str, slide_num,
        )

    # 7. Questions slide
    slide = prs.slides.add_slide(blank)
    _set_slide_bg(slide, BG_COLOR)

    bar = slide.shapes.add_shape(
        1, Inches(0), Inches(0), Inches(10), Inches(0.06),
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT_COLOR
    bar.line.fill.background()

    tx = slide.shapes.add_textbox(Inches(2), Inches(2.5), Inches(6), Inches(2))
    tf = tx.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = "Questions?"
    _brand_font(run, size=36, bold=True, color=HEADING_COLOR)
    p2 = tf.add_paragraph()
    p2.alignment = PP_ALIGN.CENTER
    run2 = p2.add_run()
    run2.text = "Next steps and call to action"
    _brand_font(run2, size=18, color=MUTED_COLOR)

    _add_footer(slide, gc.story_id, slide_num, date_str)


def _has_mmdc() -> bool:
    """Check if mermaid-cli (mmdc) is available on PATH."""
    return shutil.which("mmdc") is not None


def _render_mermaid(mmd_path: str, png_path: str) -> None:
    """Render a .mmd file to .png using mmdc with presentation-quality size."""
    subprocess.run(
        ["mmdc", "-i", mmd_path, "-o", png_path, "-w", "1920", "-H", "1080", "-s", "2"],
        check=True,
        capture_output=True,
    )


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

        if not gc.problem_statement and not gc.what_changed and not gc.slide_outline:
            return {"success": False, "error": "Empty generated content — nothing to assemble."}

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
            "generated_at": datetime.now(UTC).isoformat(),
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
