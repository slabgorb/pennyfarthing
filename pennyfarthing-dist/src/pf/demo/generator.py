"""Content generator — Claude ELI5 translation from classified signals.

Translates technical story signals into non-technical narratives using
template-based content generation. Produces GeneratedContent with problem
statement, what changed, why, demo script, diagrams, and slide outlines.

Three public functions:
- generate_content: Main entry point — builds content from classified story
- build_prompt: Constructs Claude prompt from signals (pure function)
- parse_response: Parses structured response text into GeneratedContent
"""

from __future__ import annotations

import re
from typing import Any

from pf.demo.models import ClassifiedStory, GeneratedContent, StoryType

MAX_DIFF_CHARS = 50_000

# Story types that get diagram_source
_DIAGRAM_TYPES = frozenset({StoryType.BACKEND, StoryType.INFRASTRUCTURE})

# Story types that get before_after
_BEFORE_AFTER_TYPES = frozenset({StoryType.REFACTOR, StoryType.BUGFIX})

# Type-specific prompt instructions
_TYPE_INSTRUCTIONS: dict[StoryType, str] = {
    StoryType.UI: (
        "Focus on user-facing changes: what the user sees, how interactions changed, "
        "and visual improvements. No architecture diagrams needed."
    ),
    StoryType.BACKEND: (
        "Focus on system architecture changes: API endpoints, data flow, and service "
        "interactions. Include a Mermaid diagram showing the request/response flow."
    ),
    StoryType.INFRASTRUCTURE: (
        "Focus on deployment and operational changes: what infrastructure was added or "
        "modified, and how it improves reliability or performance. Include a Mermaid "
        "diagram showing the infrastructure topology."
    ),
    StoryType.REFACTOR: (
        "Focus on before/after comparison: what the code looked like before, what it "
        "looks like now, and why the new structure is better. Include a before/after summary."
    ),
    StoryType.BUGFIX: (
        "Focus on the problem and fix: what was broken, what caused it, and how it was "
        "resolved. Include a before/after showing the broken vs fixed behavior."
    ),
}


def generate_content(
    classified: ClassifiedStory,
    corrections: str | None = None,
) -> dict[str, Any]:
    """Generate ELI5 content from a classified story.

    Builds content from the classified story's signals using template-based
    generation. Each story type produces appropriate content fields.

    Args:
        classified: Classified story with signals and type
        corrections: Optional developer feedback for regeneration

    Returns:
        Result object: {success: bool, data?: GeneratedContent, error?: str}
    """
    signals = classified.signals

    if not signals.story_id:
        return {"success": False, "error": "story_id is required"}

    if not signals.title:
        return {"success": False, "error": "story title is required"}

    story_type = classified.story_type
    title = signals.title
    acs = signals.acceptance_criteria

    # Problem statement
    problem_statement = _build_problem_statement(title, story_type)

    # What changed
    what_changed = _build_what_changed(title, acs, signals.commit_messages)

    # Why this approach
    why_this_approach = _build_why_this_approach(title, story_type)

    # Before/after (refactor and bugfix only)
    before_after: str | None = None
    if story_type in _BEFORE_AFTER_TYPES:
        before_after = _build_before_after(title, story_type)

    # Demo script
    demo_script = _build_demo_script(title, story_type, acs)

    # Diagram source (backend and infrastructure only)
    diagram_source: str | None = None
    if story_type in _DIAGRAM_TYPES:
        diagram_source = _build_diagram_source(title, story_type)

    # Slide outline
    slide_outline = _build_slide_outline(
        title, story_type, problem_statement, what_changed, signals.story_id,
    )

    content = GeneratedContent(
        problem_statement=problem_statement,
        what_changed=what_changed,
        why_this_approach=why_this_approach,
        before_after=before_after,
        demo_script=demo_script,
        diagram_source=diagram_source,
        slide_outline=slide_outline,
    )

    return {"success": True, "data": content}


def build_prompt(
    classified: ClassifiedStory,
    corrections: str | None = None,
) -> str:
    """Build the Claude prompt from classified story signals.

    Constructs a prompt that includes all signals, story type, ACs,
    and constraints for ELI5 translation.

    Args:
        classified: Classified story with signals and type
        corrections: Optional previous output corrections

    Returns:
        Formatted prompt string
    """
    signals = classified.signals
    story_type = classified.story_type

    type_instruction = _TYPE_INSTRUCTIONS.get(story_type, "")

    sections = [
        "You are a content generator that translates technical story signals "
        "into non-technical, executive-friendly narratives. Write in plain language "
        "that a non-technical audience can understand.",
        "",
        f"## Story: {signals.title}",
        f"- Story ID: {signals.story_id}",
        f"- Story Type: {story_type.value}",
        f"- Points: {signals.points}",
        "",
    ]

    # Acceptance criteria
    if signals.acceptance_criteria:
        sections.append("## Acceptance Criteria")
        for ac in signals.acceptance_criteria:
            sections.append(f"- {ac}")
        sections.append("")

    # Type-specific instructions
    sections.append(f"## Content Instructions ({story_type.value})")
    sections.append(type_instruction)
    sections.append("")

    # PR diff (truncated)
    diff = signals.pr_diff
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n... (truncated)"
    sections.append("## PR Diff")
    sections.append(diff)
    sections.append("")

    # Commit messages
    if signals.commit_messages:
        sections.append("## Commit Messages")
        for msg in signals.commit_messages:
            sections.append(f"- {msg}")
        sections.append("")

    # Review findings
    if signals.review_findings:
        sections.append("## Review Findings")
        sections.append(signals.review_findings)
        sections.append("")

    # Corrections
    if corrections:
        sections.append("## Corrections (from developer)")
        sections.append(corrections)
        sections.append("")

    # Output format instructions
    sections.extend([
        "## Required Output Sections",
        "Respond with these markdown sections:",
        "- ## Problem Statement — 'Problem: X. Why it matters: Y.'",
        "- ## What Changed — ELI5 summary of the technical changes",
        "- ## Why This Approach — Engineering reasoning in simple terms",
        "- ## Demo Script — Scene-by-scene presenter walkthrough",
        "- ## Slide Outline — Per-slide metadata (title, bullets, speaker_notes)",
    ])

    if story_type in _DIAGRAM_TYPES:
        sections.append(
            "- ## Diagram Source — Mermaid diagram showing architecture/flow"
        )

    if story_type in _BEFORE_AFTER_TYPES:
        sections.append(
            "- ## Before/After — Comparison of old vs new behavior"
        )

    return "\n".join(sections)


def parse_response(
    response_text: str,
    classified: ClassifiedStory,
) -> dict[str, Any]:
    """Parse Claude's response into a GeneratedContent dataclass.

    Extracts structured fields from the response text and validates
    completeness. Expects markdown sections with ## headers.

    Args:
        response_text: Raw text response from Claude
        classified: The classified story (for context)

    Returns:
        Result object: {success: bool, data?: GeneratedContent, error?: str}
    """
    if not response_text or not response_text.strip():
        return {"success": False, "error": "Empty response text"}

    sections = _split_sections(response_text)

    # Required sections
    problem_statement = sections.get("problem statement", "").strip()
    what_changed = sections.get("what changed", "").strip()
    why_this_approach = sections.get("why this approach", "").strip()
    demo_script = sections.get("demo script", "").strip()
    slide_outline_raw = sections.get("slide outline", "").strip()

    # Validate required sections present
    missing = []
    if not problem_statement:
        missing.append("Problem Statement")
    if not what_changed:
        missing.append("What Changed")
    if not why_this_approach:
        missing.append("Why This Approach")
    if not demo_script:
        missing.append("Demo Script")
    if not slide_outline_raw:
        missing.append("Slide Outline")

    if missing:
        return {
            "success": False,
            "error": f"Missing required sections: {', '.join(missing)}",
        }

    # Optional sections
    before_after = sections.get("before/after", "").strip() or None
    diagram_raw = sections.get("diagram source", "").strip()
    diagram_source = _extract_mermaid(diagram_raw) if diagram_raw else None

    # Parse slide outline
    slide_outline = _parse_slide_outline(slide_outline_raw)

    content = GeneratedContent(
        problem_statement=problem_statement,
        what_changed=what_changed,
        why_this_approach=why_this_approach,
        before_after=before_after,
        demo_script=demo_script,
        diagram_source=diagram_source,
        slide_outline=slide_outline,
    )

    return {"success": True, "data": content}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_problem_statement(title: str, story_type: StoryType) -> str:
    """Build a problem statement from story title and type."""
    type_context = {
        StoryType.UI: "users needed a better interface",
        StoryType.BACKEND: "the system needed new capabilities",
        StoryType.INFRASTRUCTURE: "the infrastructure needed improvement",
        StoryType.REFACTOR: "the codebase needed restructuring for maintainability",
        StoryType.BUGFIX: "a defect was impacting functionality",
    }
    context = type_context.get(story_type, "a change was needed")
    return f"Problem: {title}. Why it matters: {context}."


def _build_what_changed(
    title: str,
    acs: list[str],
    commit_messages: list[str],
) -> str:
    """Build a what-changed summary from signals."""
    parts = [f"We implemented: {title}."]
    if acs:
        parts.append("This delivers the following capabilities:")
        for ac in acs:
            parts.append(f"  - {ac}")
    if commit_messages:
        parts.append("Key changes made:")
        for msg in commit_messages:
            parts.append(f"  - {msg}")
    return "\n".join(parts)


def _build_why_this_approach(title: str, story_type: StoryType) -> str:
    """Build engineering reasoning for the approach taken."""
    type_reasoning = {
        StoryType.UI: "This approach prioritizes user experience and accessibility.",
        StoryType.BACKEND: "This approach follows RESTful conventions and maintains clean data flow.",
        StoryType.INFRASTRUCTURE: "This approach improves reliability and operational visibility.",
        StoryType.REFACTOR: "This approach reduces complexity and improves long-term maintainability.",
        StoryType.BUGFIX: "This approach addresses the root cause rather than symptoms.",
    }
    return type_reasoning.get(story_type, "This approach balances simplicity with correctness.")


def _build_before_after(title: str, story_type: StoryType) -> str:
    """Build before/after comparison for refactor and bugfix stories."""
    if story_type == StoryType.REFACTOR:
        return (
            f"Before: The existing implementation had grown complex and difficult to maintain.\n"
            f"After: {title} — the code is now cleaner, more modular, and easier to extend."
        )
    # bugfix
    return (
        f"Before: The system exhibited incorrect behavior that affected users.\n"
        f"After: {title} — the issue has been resolved and verified with tests."
    )


def _build_demo_script(
    title: str,
    story_type: StoryType,
    acs: list[str],
) -> str:
    """Build a scene-based demo script."""
    scenes = [
        f"## Demo Script — {title}",
        "",
        "### Scene 1: Setup (30 sec)",
        f'**Presenter says:** "Today we\'re going to show you what we built for {title}."',
        "**Show:** The project overview",
        "",
        "### Scene 2: Demo (1 min)",
    ]

    if acs:
        scenes.append('**Presenter says:** "Here\'s what this delivers:"')
        for ac in acs:
            scenes.append(f"**Show:** {ac}")
    else:
        scenes.append('**Presenter says:** "Let me show you the changes."')
        scenes.append("**Show:** The implementation in action")

    scenes.extend([
        "",
        "### Scene 3: Closing (30 sec)",
        f'**Presenter says:** "That\'s {title} — shipped and verified."',
    ])

    return "\n".join(scenes)


def _build_diagram_source(title: str, story_type: StoryType) -> str:
    """Build a Mermaid diagram for backend/infrastructure stories."""
    if story_type == StoryType.INFRASTRUCTURE:
        return (
            "graph TD\n"
            f'  A["{title}"] --> B["Infrastructure Layer"]\n'
            '  B --> C["Monitoring"]\n'
            '  B --> D["Deployment"]'
        )
    # backend
    return (
        "graph LR\n"
        '  A["Client"] --> B["API Gateway"]\n'
        f'  B --> C["{title}"]\n'
        '  C --> D["Database"]'
    )


def _build_slide_outline(
    title: str,
    story_type: StoryType,
    problem_statement: str,
    what_changed: str,
    story_id: str,
) -> list[dict]:
    """Build per-slide metadata for the presentation."""
    return [
        {
            "title": f"Story {story_id}: {title}",
            "bullets": [f"Story {story_id}", title],
            "speaker_notes": "Welcome to the demo for this story.",
        },
        {
            "title": "The Problem",
            "bullets": [problem_statement],
            "speaker_notes": "Here is the challenge we set out to solve.",
        },
        {
            "title": "What We Built",
            "bullets": [what_changed.split("\n")[0]],
            "speaker_notes": "This is what was delivered.",
        },
        {
            "title": "Questions",
            "bullets": ["Open floor for questions"],
            "speaker_notes": "Thank you for your time.",
        },
    ]


def _split_sections(text: str) -> dict[str, str]:
    """Split markdown text into sections by ## headers."""
    sections: dict[str, str] = {}
    current_header = ""
    current_lines: list[str] = []

    for line in text.splitlines():
        header_match = re.match(r"^##\s+(.+)$", line)
        if header_match:
            if current_header:
                sections[current_header] = "\n".join(current_lines).strip()
            current_header = header_match.group(1).strip().lower()
            current_lines = []
        else:
            current_lines.append(line)

    if current_header:
        sections[current_header] = "\n".join(current_lines).strip()

    return sections


def _extract_mermaid(text: str) -> str | None:
    """Extract mermaid code from a markdown code block or raw text."""
    match = re.search(r"```mermaid\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # If no code block, return the text itself if non-empty
    stripped = text.strip()
    return stripped if stripped else None


def _parse_slide_outline(text: str) -> list[dict]:
    """Parse slide outline text into list of slide dicts."""
    slides: list[dict] = []
    current_slide: dict | None = None

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Match "- slide: Title" pattern
        slide_match = re.match(r"^-\s*slide:\s*(.+)$", line)
        if slide_match:
            if current_slide:
                slides.append(current_slide)
            current_slide = {
                "title": slide_match.group(1).strip(),
                "bullets": [],
                "speaker_notes": "",
            }
            continue

        if current_slide is None:
            continue

        # Match "bullets: [...]" pattern
        bullets_match = re.match(r"^\s*bullets:\s*\[(.+)\]$", line)
        if bullets_match:
            raw = bullets_match.group(1)
            items = [
                s.strip().strip('"').strip("'")
                for s in raw.split(",")
                if s.strip()
            ]
            current_slide["bullets"] = items
            continue

        # Match "speaker_notes: ..." pattern
        notes_match = re.match(r'^\s*speaker_notes:\s*"?(.+?)"?\s*$', line)
        if notes_match:
            current_slide["speaker_notes"] = notes_match.group(1).strip()

    if current_slide:
        slides.append(current_slide)

    return slides
